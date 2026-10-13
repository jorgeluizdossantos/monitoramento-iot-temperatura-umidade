import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/env';
import { createDatabase, type Database } from '../src/db/mysql';
import { createMysqlMaintenanceRepository } from '../src/modules/maintenance/mysql-maintenance.repository';
import { createMysqlHistoryRepository } from '../src/modules/telemetria/mysql-history.repository';

const env = loadEnvironment();
if (env.DB_TARGET !== 'local' || env.NODE_ENV !== 'test') throw new Error('Exige MySQL local de teste');
const db = createDatabase(env);
const suffix = randomUUID();
const sql = (text: string, args: unknown[] = []) => db.withConnection(c => c.execute(text, args));
const add = async (text: string, args: unknown[] = []) => ((await sql(text, args))[0] as ResultSetHeader).insertId;
const rows = async (text: string, args: unknown[] = []) => (await sql(text, args))[0] as RowDataPacket[];
const notify = vi.fn();
const repository = createMysqlMaintenanceRepository(db, notify);
const history = createMysqlHistoryRepository(db);
// Datas sintéticas anteriores ao projeto: nenhuma rotina atinge dados da bancada.
const start = new Date('2000-01-01T10:00:00Z');
const end = new Date('2000-01-01T11:00:00Z');
let company: number, unit: number, sector: number, room: number, device: number, user: number;
const read = (seconds: number, temperature = 20, humidity = 50) => add('INSERT INTO leitura_telemetria(dispositivo_id,ambiente_id,temperatura_c,umidade_pct,medido_em) VALUES (?,?,?,?,?)', [device, room, temperature, humidity, new Date(+start + seconds * 1000)]);
const summaries = () => rows('SELECT * FROM leitura_hora WHERE ambiente_id=? ORDER BY hora_ref', [room]);
function intercept(execute: (c: PoolConnection, query: string, values: unknown[]) => unknown): Database {
  return { ...db, withConnection: work => db.withConnection(c => work(new Proxy(c, { get(target, property) {
    if (property === 'execute') return (query: string, values: unknown[]) => execute(target, query, values);
    const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
  } }))) };
}
beforeAll(async () => {
  company = await add('INSERT INTO empresa(nome) VALUES (?)', [`jobs-${suffix}`]);
  unit = await add('INSERT INTO unidade(empresa_id,nome) VALUES (?,?)', [company, 'Unit']);
  sector = await add('INSERT INTO setor(empresa_id,unidade_id,nome) VALUES (?,?,?)', [company, unit, 'Sector']);
  room = await add('INSERT INTO ambiente(empresa_id,setor_id,nome) VALUES (?,?,?)', [company, sector, 'Room']);
  device = await add("INSERT INTO dispositivo(empresa_id,ambiente_id,device_id,sensor) VALUES (?,?,?,'DHT11')", [company, room, `test-${suffix}`]);
  user = await add("INSERT INTO usuario(empresa_id,nome,email,senha_hash,perfil) VALUES (?,'Test',?,'unused','leitor')", [company, `${suffix}@test.invalid`]);
});
beforeEach(async () => {
  await sql('DELETE FROM alerta WHERE dispositivo_id=?', [device]);
  await sql('DELETE FROM leitura_telemetria WHERE dispositivo_id=?', [device]);
  await sql('DELETE FROM leitura_hora WHERE ambiente_id=?', [room]);
  await sql('DELETE FROM sessao WHERE usuario_id=?', [user]);
  await sql("UPDATE dispositivo SET ativo=1,status_conexao='offline',ultimo_contato_em=NULL,offline_apos_seg=60 WHERE id=?", [device]);
  notify.mockClear();
});
afterAll(async () => {
  try {
    if (company) {
      await sql('DELETE FROM alerta WHERE dispositivo_id=?', [device]);
      await sql('DELETE FROM leitura_telemetria WHERE dispositivo_id=?', [device]);
      await sql('DELETE FROM leitura_hora WHERE ambiente_id=?', [room]);
      for (const table of ['usuario', 'dispositivo', 'ambiente', 'setor', 'unidade']) await sql(`DELETE FROM ${table} WHERE empresa_id=?`, [company]);
      await sql('DELETE FROM empresa WHERE id=?', [company]);
    }
  } finally { await db.close(); }
});
it('resumo idempotente, fronteiras UTC e atualização de leitura atrasada sem duplicar série', async () => {
  await read(0,20,40); await read(3599,24,60); await read(3600,30,80);
  await repository.summarize(start,end);
  const first = await summaries();
  expect(first).toHaveLength(1); expect(first[0]).toMatchObject({qtd_leituras:2,temp_media:'22.0',temp_min:'20.0',temp_max:'24.0',umid_media:'50.0'});
  await repository.summarize(start,end); expect(await summaries()).toEqual(first);
  await read(1800,28,50);
  const before = await history.series(room,company,{de:start,ate:end});
  expect(before).toHaveLength(1); expect(before[0]).toMatchObject({qtd_leituras:3,temp_media:'24.0'});
  await repository.summarize(start,end);
  expect((await summaries())[0].qtd_leituras).toBe(3);
  expect(await history.series(room,company+999999,{de:start,ate:end})).toEqual([]);
});
it('offline respeita prazo estrito e ativo; invalida somente depois do commit', async () => {
  await sql("UPDATE dispositivo SET status_conexao='online',ultimo_contato_em=? WHERE id=?",[start,device]);
  await repository.markOffline(new Date(+start+60000)); expect(notify).not.toHaveBeenCalled();
  await repository.markOffline(new Date(+start+60001)); expect(notify).toHaveBeenCalledExactlyOnceWith(company);
  expect((await rows('SELECT status_conexao,ultimo_contato_em FROM dispositivo WHERE id=?',[device]))[0]).toMatchObject({status_conexao:'offline',ultimo_contato_em:start});
  await repository.markOffline(end); expect(notify).toHaveBeenCalledTimes(1);
  await sql("UPDATE dispositivo SET ativo=0,status_conexao='online' WHERE id=?",[device]);
  await repository.markOffline(end); expect(notify).toHaveBeenCalledTimes(1);
});
it('contato renovado antes do bloqueio impede falso offline; rollback não publica SSE', async () => {
  await sql("UPDATE dispositivo SET status_conexao='online',ultimo_contato_em=? WHERE id=?",[start,device]);
  let renewed = false;
  const racing = intercept(async (c,q,v) => {
    if (q.startsWith('SELECT id FROM empresa') && !renewed) { renewed=true; await sql('UPDATE dispositivo SET ultimo_contato_em=? WHERE id=?',[end,device]); }
    return c.execute(q,v);
  });
  await createMysqlMaintenanceRepository(racing,notify).markOffline(end); expect(notify).not.toHaveBeenCalled();
  await sql('UPDATE dispositivo SET ultimo_contato_em=? WHERE id=?',[start,device]);
  const failing = intercept(async (c,q,v) => { const result=await c.execute(q,v); if(q.startsWith('UPDATE dispositivo'))throw new Error('forced'); return result; });
  await expect(createMysqlMaintenanceRepository(failing,notify).markOffline(end)).rejects.toThrow('forced');
  expect((await rows('SELECT status_conexao FROM dispositivo WHERE id=?',[device]))[0].status_conexao).toBe('online'); expect(notify).not.toHaveBeenCalled();
});
it('expurgo recalcula resumo, preserva alerta e série e não apaga a hora no limite', async () => {
  const reading = await read(0,29); await read(1,31); await read(3600,20);
  await sql("INSERT INTO alerta(ambiente_id,dispositivo_id,leitura_id,tipo,sentido,severidade,valor,valor_extremo,limite_violado,ocorrido_em) VALUES (?,?,?,'temperatura','acima','critico',29,31,26,?)",[room,device,reading,start]);
  const before=await history.series(room,company,{de:start,ate:end});
  expect((await repository.purgeReadings(end,()=>true)).affected).toBe(2);
  expect((await rows('SELECT * FROM alerta WHERE dispositivo_id=?',[device]))[0]).toMatchObject({leitura_id:null,valor:'29.0',valor_extremo:'31.0',encerrado_em:null});
  expect(await history.series(room,company,{de:start,ate:end})).toEqual(before);
  expect((await rows('SELECT * FROM leitura_telemetria WHERE dispositivo_id=?',[device]))).toHaveLength(1);
  expect((await repository.purgeReadings(end,()=>true)).affected).toBe(0);
  expect(await history.series(room,company,{de:start,ate:end})).toEqual(before);
});
it('expurgo usa lotes de 10000 e falha no segundo lote restaura TODA a hora e o resumo', async () => {
  const digits='(SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9)';
  await sql(`INSERT INTO leitura_telemetria(dispositivo_id,ambiente_id,temperatura_c,umidade_pct,medido_em)
    SELECT ?,?,20,50,TIMESTAMPADD(MICROSECOND,(a.n+10*b.n+100*c.n+1000*d.n+10000*e.n)*1000,?)
    FROM ${digits} a CROSS JOIN ${digits} b CROSS JOIN ${digits} c CROSS JOIN ${digits} d CROSS JOIN ${digits} e LIMIT 10001`,[device,room,start]);
  let batches=0;
  const failing=intercept((c,q,v)=>{if(q.startsWith('DELETE FROM leitura_telemetria')&&++batches===2)throw new Error('forced');return c.execute(q,v);});
  await expect(createMysqlMaintenanceRepository(failing).purgeReadings(end,()=>true)).rejects.toThrow('forced');
  expect(batches).toBe(2);expect(await summaries()).toHaveLength(0);
  expect(Number((await rows('SELECT COUNT(*) n FROM leitura_telemetria WHERE dispositivo_id=?',[device]))[0].n)).toBe(10001);
  expect((await repository.purgeReadings(end,()=>true)).affected).toBe(10001);
  expect((await summaries())[0].qtd_leituras).toBe(10001);
},30000);
it('lock entre instâncias exclui resumo e expurgo concorrentes e é liberado após falha', async () => {
  const key=`stma:${createHash('sha256').update(env.database.name).digest('hex').slice(0,32)}:telemetry`;
  await db.withConnection(async c=>{
    await c.execute('SELECT GET_LOCK(?,0)',[key]);
    try { expect((await repository.summarize(start,end)).skipped).toBe(true); expect((await repository.purgeReadings(end,()=>true)).skipped).toBe(true); }
    finally { await c.execute('SELECT RELEASE_LOCK(?)',[key]); }
  });
  expect((await repository.summarize(start,end)).skipped).toBe(false);
  expect((await repository.purgeReadings(end,()=>false)).affected).toBe(0);
});
it('capacidade SMALLINT do schema impede resumo truncado e qualquer exclusão', async () => {
  const digits='(SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9)';
  await sql(`INSERT INTO leitura_telemetria(dispositivo_id,ambiente_id,temperatura_c,umidade_pct,medido_em)
    SELECT ?,?,20,50,TIMESTAMPADD(MICROSECOND,(a.n+10*b.n+100*c.n+1000*d.n+10000*e.n)*1000,?)
    FROM ${digits} a CROSS JOIN ${digits} b CROSS JOIN ${digits} c CROSS JOIN ${digits} d CROSS JOIN ${digits} e LIMIT 65536`,[device,room,start]);
  await expect(repository.summarize(start,end)).rejects.toThrow('SUMMARY_CAPACITY_EXCEEDED');
  await expect(repository.purgeReadings(end,()=>true)).rejects.toThrow('SUMMARY_CAPACITY_EXCEEDED');
  expect(await summaries()).toHaveLength(0);
  expect(Number((await rows('SELECT COUNT(*) n FROM leitura_telemetria WHERE dispositivo_id=?',[device]))[0].n)).toBe(65536);
},30000);
it('limpeza usa expiração OU revogação com 30 dias completos, preservando fronteira e sessões válidas', async () => {
  const dates=[[new Date(+start-1),null],[end,new Date(+start-1)],[start,null],[end,start],[end,null]];
  for(const [expires,revoked] of dates)await sql('INSERT INTO sessao(usuario_id,token_hash,expira_em,revogada_em) VALUES (?,?,?,?)',[user,randomBytes(32).toString('hex'),expires,revoked]);
  expect((await repository.cleanSessions(start,()=>true)).affected).toBe(2);
  expect(await rows('SELECT id FROM sessao WHERE usuario_id=?',[user])).toHaveLength(3);
  expect((await repository.cleanSessions(start,()=>true)).affected).toBe(0);
});
