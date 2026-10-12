import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createLogger } from '../src/shared/logger';
import { parseEnvironment } from '../src/config/env';

const local = { DB_LOCAL_HOST: '127.0.0.1', DB_LOCAL_PORT: '3306', DB_LOCAL_NAME: 'stma_db', DB_LOCAL_USER: 'test', DB_LOCAL_PASSWORD: 'secret-test' };
describe('configuração', () => {
  it('seleciona o banco local sem exigir credenciais Aiven', () => {
    expect(parseEnvironment(local).database.host).toBe('127.0.0.1');
  });
  it('seleciona Aiven apenas por ambiente e exige CA', () => {
    const aiven = { ...local, DB_TARGET: 'aiven', DB_AIVEN_HOST: 'example.aivencloud.com', DB_AIVEN_PORT: '25060', DB_AIVEN_NAME: 'stma_db', DB_AIVEN_USER: 'test', DB_AIVEN_PASSWORD: 'secret', DB_AIVEN_CA_FILE: 'certs/ca.pem' };
    expect(parseEnvironment(aiven).database.host).toBe('example.aivencloud.com');
    expect(() => parseEnvironment({ ...aiven, DB_AIVEN_CA_FILE: '' })).toThrow('DB_AIVEN_CA_FILE');
  });
  it('recusa configurações inválidas sem expor valores', () => {
    expect(() => parseEnvironment({ ...local, DB_LOCAL_PORT: 'invalid-secret' })).toThrow('DB_LOCAL_PORT');
    expect(() => parseEnvironment({ ...local, NODE_ENV: 'production' })).toThrow('TLS');
  });
});
describe('HTTP', () => {
  const logger = createLogger('silent');
  it('health consulta a dependência e responde 200', async () => {
    let called = false;
    const app = createApp({ logger, healthRepository: { ping: async () => { called = true; } } });
    const result = await request(app).get('/health');
    expect(called).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'ok', database: 'up' });
  });
  it('indisponibilidade retorna 503 sem detalhes internos', async () => {
    const app = createApp({ logger, healthRepository: { ping: async () => { throw new Error('password=secret'); } } });
    const result = await request(app).get('/health');
    expect(result.status).toBe(503);
    expect(result.text).not.toContain('secret');
  });
  it('rota ausente retorna o contrato de erro', async () => {
    const result = await request(createApp({ logger, healthRepository: { ping: async () => {} } })).get('/inexistente');
    expect(result.status).toBe(404);
    expect(result.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });
});
