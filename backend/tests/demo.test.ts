import { expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createLogger } from '../src/shared/logger';
import { createDemoService } from '../src/modules/demo/demo.service';
import { environmentForRole, parseDatabaseRoles } from '../src/config/database-roles';
import { parseEnvironment } from '../src/config/env';
import { runtimeGrants } from '../src/db/runtime-grants';

it('demonstração pública não recebe escopo, não escreve nem abre endpoints privados', async () => {
  const panel = vi.fn().mockResolvedValue([]);
  const app = createApp({ healthRepository: { ping: async () => {} }, logger: createLogger('silent'), demo: createDemoService({ panel }) });
  const response = await request(app).get('/api/v1/demo/painel');
  expect(response.status).toBe(200); expect(response.body).toEqual({ demonstracao: true, dados: [] });
  expect(response.headers['set-cookie']).toBeUndefined();
  expect((await request(app).get('/api/v1/demo/painel?empresa_id=1')).status).toBe(400);
  expect((await request(app).post('/api/v1/demo/painel').send({})).status).toBe(404);
  expect((await request(app).get('/api/v1/demo/usuarios')).status).toBe(404);
  expect(panel).toHaveBeenCalledTimes(1);
});
it('papéis não têm fallback e rejeitam pares incompletos ou mesma identidade', () => {
  expect(() => parseDatabaseRoles({DB_LOCAL_DEMO_USER:'demo'},'local','api')).toThrow();
  expect(() => parseDatabaseRoles({DB_LOCAL_DEMO_USER:'api',DB_LOCAL_DEMO_PASSWORD:'secret'},'local','api')).toThrow();
  const env = parseEnvironment({DB_LOCAL_HOST:'localhost',DB_LOCAL_PORT:'3306',DB_LOCAL_NAME:'stma_db',DB_LOCAL_USER:'api',DB_LOCAL_PASSWORD:'api-secret',DB_LOCAL_DEMO_USER:'demo',DB_LOCAL_DEMO_PASSWORD:'demo-secret'});
  expect(environmentForRole(env,'demo').database).toMatchObject({host:'localhost',user:'demo',password:'demo-secret'});
  expect(() => environmentForRole(env,'maintenance')).toThrow();
});
it('grants não concedem DDL, privilégio global ou exclusão de telemetria à API', () => {
  const api=runtimeGrants('stma_db','stma_api','api');
  expect(api.filter(sql=>sql.includes('DELETE'))).toEqual(["GRANT SELECT,INSERT,UPDATE,DELETE ON `stma_db`.`sessao` TO 'stma_api'@'%'"]);
  expect(runtimeGrants('stma_db','stma_demo','demo').every(sql=>sql.startsWith('GRANT SELECT ON'))).toBe(true);
  expect(runtimeGrants('stma_db','stma_jobs','maintenance').some(sql=>sql.includes('SELECT,DELETE ON `stma_db`.`leitura_telemetria`'))).toBe(true);
  expect(() => runtimeGrants('stma_db;DROP','user','api')).toThrow();
  expect(() => runtimeGrants('stma_db',"user'@'other",'api')).toThrow();
});
