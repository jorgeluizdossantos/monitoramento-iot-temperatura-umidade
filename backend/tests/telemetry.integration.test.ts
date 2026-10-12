import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/env';
import { createDatabase, type Database } from '../src/db/mysql';
import { createMysqlTelemetryRepository } from '../src/modules/telemetria/mysql-telemetry.repository';
import type { TelemetryMessage } from '../src/modules/telemetria/telemetry.repository';

const env = loadEnvironment();
if (env.DB_TARGET !== 'local' || env.NODE_ENV !== 'test') throw new Error('Integração exige MySQL local e NODE_ENV=test.');
const db = createDatabase(env);
const repository = createMysqlTelemetryRepository(db);
const suffix = randomUUID(); const deviceId = `test-${suffix}`; const unknown = `unknown-${suffix}`;
let company: number; let unit: number; let sector: number; let room: number; let secondRoom: number; let device: number;
const sql = (query: string, values: (string | number | boolean | Date)[] = []) => db.withConnection(c => c.execute(query, values));
const insert = async (query: string, values: (string | number)[]) => { const [result] = await sql(query, values); return (result as ResultSetHeader).insertId; };
const baseTime = Date.now();
function reading(offset: number, temperature = 20): TelemetryMessage {
  return { kind: 'dados', deviceId, temperature, humidity: 50, measuredAt: new Date(baseTime + offset), receivedAt: new Date(baseTime + 60000), retained: false, timestampSource: 'device' };
}
beforeAll(async () => {
  company = await insert('INSERT INTO empresa (nome) VALUES (?)', [`telemetry-${suffix}`]);
  unit = await insert('INSERT INTO unidade (empresa_id,nome) VALUES (?,?)', [company, 'Unidade']);
  sector = await insert('INSERT INTO setor (empresa_id,unidade_id,nome) VALUES (?,?,?)', [company, unit, 'Setor']);
  room = await insert('INSERT INTO ambiente (empresa_id,setor_id,nome) VALUES (?,?,?)', [company, sector, 'Sala']);
  secondRoom = await insert('INSERT INTO ambiente (empresa_id,setor_id,nome) VALUES (?,?,?)', [company, sector, 'Sala 2']);
  device = await insert('INSERT INTO dispositivo (empresa_id,ambiente_id,device_id,sensor) VALUES (?,?,?,?)', [company, room, deviceId, 'DHT22']);
});
afterAll(async () => {
  try {
    if (device) { await sql('DELETE FROM evento_porta WHERE dispositivo_id=?', [device]); await sql('DELETE FROM leitura_telemetria WHERE dispositivo_id=?', [device]); }
    if (company) {
      for (const table of ['dispositivo', 'ambiente', 'setor', 'unidade']) await sql(`DELETE FROM ${table} WHERE empresa_id=?`, [company]);
      await sql('DELETE FROM empresa WHERE id=?', [company]);
    }
    await sql('DELETE FROM dispositivo_pendente WHERE device_id=?', [unknown]);
  } finally { await db.close(); }
});
it('grava leitura e estado atual atomicamente; reenvio não duplica', async () => {
  expect(await repository.ingest(reading(0))).toBe('stored');
  expect(await repository.ingest(reading(0))).toBe('duplicate');
  const [[count]] = await db.withConnection(c => c.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM leitura_telemetria WHERE dispositivo_id=?', [device]));
  expect(Number(count.total)).toBe(1);
  const [[state]] = await db.withConnection(c => c.execute<RowDataPacket[]>('SELECT ultima_temperatura_c,status_conexao,ultima_leitura_em FROM dispositivo WHERE id=?', [device]));
  expect(Number(state.ultima_temperatura_c)).toBe(20); expect(state.status_conexao).toBe('online'); expect(state.ultima_leitura_em.getTime()).toBe(baseTime);
});
it('mesmo horário com valores diferentes é conflito e não sobrescreve histórico', async () => {
  expect(await repository.ingest(reading(0, 70))).toBe('conflict');
  const [[row]] = await db.withConnection(c => c.execute<RowDataPacket[]>('SELECT temperatura_c FROM leitura_telemetria WHERE dispositivo_id=? AND medido_em=?', [device, new Date(baseTime)]));
  expect(Number(row.temperatura_c)).toBe(20);
});
it('reentregas concorrentes persistem uma única leitura', async () => {
  expect((await Promise.all([repository.ingest(reading(1000, 21)), repository.ingest(reading(1000, 21))])).sort()).toEqual(['duplicate', 'stored']);
});
it('leitura atrasada entra no histórico sem retroceder a última leitura', async () => {
  expect(await repository.ingest(reading(-1000, 10))).toBe('stored');
  const [[row]] = await db.withConnection(c => c.execute<RowDataPacket[]>('SELECT ultima_temperatura_c,ultima_leitura_em FROM dispositivo WHERE id=?', [device]));
  expect(Number(row.ultima_temperatura_c)).toBe(21); expect(row.ultima_leitura_em.getTime()).toBe(baseTime + 1000);
});
it('mudança de ambiente preserva o vínculo histórico da medição', async () => {
  await sql('UPDATE dispositivo SET ambiente_id=? WHERE id=?', [secondRoom, device]);
  await repository.ingest(reading(2000));
  const [rows] = await sql('SELECT ambiente_id FROM leitura_telemetria WHERE dispositivo_id=? ORDER BY medido_em', [device]);
  expect((rows as RowDataPacket[])[0].ambiente_id).toBe(room);
  expect((rows as RowDataPacket[]).at(-1)?.ambiente_id).toBe(secondRoom);
});
it('ID desconhecido atualiza pendência sem criar dispositivo nem leitura', async () => {
  await repository.ingest({ ...reading(0), deviceId: unknown });
  await repository.ingest({ ...reading(1000), deviceId: unknown });
  const [[row]] = await db.withConnection(c => c.execute<RowDataPacket[]>('SELECT qtd_mensagens,situacao,ultimo_payload FROM dispositivo_pendente WHERE device_id=?', [unknown]));
  expect(row.qtd_mensagens).toBe(2); expect(row.situacao).toBe('pendente'); expect(row.ultimo_payload.deviceId).toBe(unknown);
  const [devices] = await sql('SELECT id FROM dispositivo WHERE device_id=?', [unknown]); expect(devices).toHaveLength(0);
});
it('cadastro ou ancestral inativo não recebe telemetria nem vira pendente', async () => {
  for (const [table, id] of [['dispositivo', device], ['ambiente', secondRoom], ['setor', sector], ['unidade', unit], ['empresa', company]] as const) {
    await sql(`UPDATE ${table} SET ativo=0 WHERE id=?`, [id]);
    try { expect(await repository.ingest(reading(3000))).toBe('inactive'); }
    finally { await sql(`UPDATE ${table} SET ativo=1 WHERE id=?`, [id]); }
  }
  expect((await sql('SELECT id FROM dispositivo_pendente WHERE device_id=?', [deviceId]))[0]).toHaveLength(0);
});
it('porta grava apenas transições e status offline não falsifica último contato', async () => {
  const door = (offset: number, open: boolean): TelemetryMessage => ({ kind: 'porta', deviceId, open, measuredAt: new Date(baseTime + offset), receivedAt: new Date(), retained: false });
  expect(await repository.ingest(door(0, false))).toBe('stored');
  expect(await repository.ingest(door(1000, false))).toBe('unchanged');
  expect(await repository.ingest(door(2000, true))).toBe('stored');
  expect(await repository.ingest(door(0, false))).toBe('stale');
  const [[before]] = await db.withConnection(c => c.execute<RowDataPacket[]>('SELECT ultimo_contato_em FROM dispositivo WHERE id=?', [device]));
  await repository.ingest({ kind: 'status', deviceId, status: 'offline', receivedAt: new Date(), retained: true });
  await repository.ingest({ kind: 'status', deviceId, status: 'online', receivedAt: new Date(), retained: true });
  const [[after]] = await db.withConnection(c => c.execute<RowDataPacket[]>('SELECT status_conexao,ultimo_contato_em FROM dispositivo WHERE id=?', [device]));
  expect(after.status_conexao).toBe('offline'); expect(after.ultimo_contato_em).toEqual(before.ultimo_contato_em);
});
it('erro entre INSERT e estado atual provoca rollback integral', async () => {
  const failing: Database = { ...db, withConnection: work => db.withConnection(c => work(new Proxy(c, {
    get(target, property) {
      if (property === 'execute') return (query: string, values: unknown[]) => {
        if (query.startsWith('UPDATE dispositivo SET ultima_leitura_em')) throw new Error('simulated-write-failure');
        return target.execute(query, values);
      };
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    },
  }))) };
  await expect(createMysqlTelemetryRepository(failing).ingest(reading(9000))).rejects.toThrow('simulated-write-failure');
  expect((await sql('SELECT id FROM leitura_telemetria WHERE dispositivo_id=? AND medido_em=?', [device, new Date(baseTime + 9000)]))[0]).toHaveLength(0);
});
