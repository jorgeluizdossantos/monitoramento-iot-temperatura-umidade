import { afterAll, expect, it } from 'vitest';
import request from 'supertest';
import type { RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/env';
import { createDatabase } from '../src/db/mysql';
import { createMysqlHealthRepository } from '../src/modules/health/mysql-health.repository';
import { createLogger } from '../src/shared/logger';
import { createApp } from '../src/app';

const env = loadEnvironment();
// Integração nunca escreve no Aiven nem no ambiente de produção.
if (env.DB_TARGET !== 'local' || env.NODE_ENV !== 'test') throw new Error('Testes exigem NODE_ENV=test e DB_TARGET=local.');
const db = createDatabase(env);
afterAll(() => db.close());

it('health responde 200 consultando MySQL real', async () => {
  const result = await request(createApp({ logger: createLogger('silent'), healthRepository: createMysqlHealthRepository(db) })).get('/health');
  expect(result.status).toBe(200);
});

it('schema definitivo possui 13 tabelas e view; todas as conexões operam em UTC', async () => {
  await db.withConnection(async connection => {
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE'", [env.database.name]);
    expect(rows).toHaveLength(13);
    const [timezone] = await connection.query<RowDataPacket[]>('SELECT @@session.time_zone AS timezone');
    expect(timezone[0].timezone).toBe('+00:00');
    await connection.execute('SELECT * FROM vw_ambiente_estado LIMIT 1');
  });
});

it('MySQL recusa vínculo entre empresas e faixa inválida; rollback preserva dados', async () => {
  await db.withConnection(async connection => {
    await connection.beginTransaction();
    try {
      const suffix = crypto.randomUUID();
      await connection.execute('INSERT INTO empresa (nome) VALUES (?)', [`teste-a-${suffix}`]);
      const [[a]] = await connection.query<RowDataPacket[]>('SELECT LAST_INSERT_ID() AS id');
      await connection.execute('INSERT INTO empresa (nome) VALUES (?)', [`teste-b-${suffix}`]);
      const [[b]] = await connection.query<RowDataPacket[]>('SELECT LAST_INSERT_ID() AS id');
      await connection.execute('INSERT INTO unidade (empresa_id,nome) VALUES (?,?)', [a.id, 'Unidade de teste']);
      const [[unit]] = await connection.query<RowDataPacket[]>('SELECT LAST_INSERT_ID() AS id');
      await expect(connection.execute('INSERT INTO setor (empresa_id,unidade_id,nome) VALUES (?,?,?)', [b.id, unit.id, 'Setor inválido'])).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
      await connection.execute('INSERT INTO setor (empresa_id,unidade_id,nome) VALUES (?,?,?)', [a.id, unit.id, 'Setor válido']);
      const [[sector]] = await connection.query<RowDataPacket[]>('SELECT LAST_INSERT_ID() AS id');
      await expect(connection.execute('INSERT INTO ambiente (empresa_id,setor_id,nome,temp_min_ideal,temp_max_ideal) VALUES (?,?,?,?,?)', [a.id, sector.id, 'Faixa inválida', 40, 20])).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    } finally { await connection.rollback(); }
  });
});
