import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import * as argon2 from 'argon2';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/env';
import { createDatabase } from '../src/db/mysql';
import { createApp } from '../src/app';
import { createLogger } from '../src/shared/logger';
import { createMysqlHealthRepository } from '../src/modules/health/mysql-health.repository';
import { createMysqlAuthRepository } from '../src/modules/auth/mysql-auth.repository';
import { createAuthService, hashToken, type AuthService } from '../src/modules/auth/auth.service';
import { companyId, requireRoles, requireSession } from '../src/modules/auth/auth.middleware';
import { HttpError } from '../src/shared/http-error';

const env = loadEnvironment();
if (env.NODE_ENV !== 'test' || env.DB_TARGET !== 'local') throw new Error('Integração exige MySQL local e NODE_ENV=test.');
const db = createDatabase(env);
const companies: number[] = [];
const users: number[] = [];
const suffix = randomUUID();
const email = `auth-${suffix}@example.com`;
const password = 'senha-exclusiva-dos-testes';
let service: AuthService;
let app: ReturnType<typeof createApp>;
const sql = (query: string, values: unknown[] = []) => db.withConnection(c => c.execute(query, values));
beforeAll(async () => {
  for (const name of ['A', 'B']) {
    const [result] = await sql('INSERT INTO empresa (nome) VALUES (?)', [`auth-${name}-${suffix}`]);
    companies.push((result as ResultSetHeader).insertId);
  }
  const hash = await argon2.hash(password);
  const [result] = await sql('INSERT INTO usuario (empresa_id,nome,email,senha_hash,perfil) VALUES (?,?,?,?,?)', [companies[0], 'Usuário de teste', email, hash, 'leitor']);
  users.push((result as ResultSetHeader).insertId);
  service = await createAuthService(createMysqlAuthRepository(db), 8);
  app = createApp({ logger: createLogger('silent'), healthRepository: createMysqlHealthRepository(db), auth: { service, env: { ...env, AUTH_IP_LIMIT: 100, AUTH_EMAIL_LIMIT: 100 } } });
});
afterAll(async () => {
  try {
    // Limpeza restrita aos IDs criados por esta execução; sessões têm ON DELETE CASCADE.
    for (const id of users) await sql('DELETE FROM usuario WHERE id=?', [id]);
    for (const id of companies) await sql('DELETE FROM empresa WHERE id=?', [id]);
  } finally { await db.close(); }
});
async function login(previous?: string) {
  const req = request(app).post('/api/v1/auth/login').send({ email, senha: password });
  if (previous) req.set('Cookie', previous);
  const result = await req;
  expect(result.status).toBe(200);
  return result.headers['set-cookie'][0].split(';')[0];
}
it('sessão real guarda SHA-256, atualiza login e retorna escopo do banco', async () => {
  const cookie = await login();
  const token = cookie.split('=')[1];
  const [rows] = await sql('SELECT s.token_hash,u.ultimo_login_em FROM sessao s JOIN usuario u ON u.id=s.usuario_id WHERE s.token_hash=?', [hashToken(token)]);
  expect((rows as RowDataPacket[])[0].token_hash).not.toBe(token);
  expect((rows as RowDataPacket[])[0].ultimo_login_em).not.toBeNull();
  const result = await request(app).get(`/api/v1/auth/me?empresa_id=${companies[1]}&perfil=administrador`).set('Cookie', cookie);
  expect(result.status).toBe(200); expect(result.body.usuario.empresa_id).toBe(companies[0]); expect(result.body.usuario.perfil).toBe('leitor');
});
it('logout revoga sessão no banco e apaga cookie', async () => {
  const cookie = await login();
  const result = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).send({});
  expect(result.status).toBe(204); expect(result.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
  expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
  const [rows] = await sql('SELECT revogada_em FROM sessao WHERE token_hash=?', [hashToken(cookie.split('=')[1])]);
  expect((rows as RowDataPacket[])[0].revogada_em).not.toBeNull();
});
it('novo login troca token e revoga o cookie anterior', async () => {
  const old = await login(); const fresh = await login(old);
  expect(fresh).not.toBe(old);
  expect((await request(app).get('/api/v1/auth/me').set('Cookie', old)).status).toBe(401);
  expect((await request(app).get('/api/v1/auth/me').set('Cookie', fresh)).status).toBe(200);
});
it('sessão expirada, usuário inativo e empresa inativa são recusados', async () => {
  const expired = await login();
  await sql('UPDATE sessao SET expira_em=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE token_hash=?', [hashToken(expired.split('=')[1])]);
  expect((await request(app).get('/api/v1/auth/me').set('Cookie', expired)).status).toBe(401);
  const cookie = await login();
  try {
    await sql('UPDATE usuario SET ativo=0 WHERE id=?', [users[0]]);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
    await sql('UPDATE usuario SET ativo=1 WHERE id=?', [users[0]]);
    await sql('UPDATE empresa SET ativo=0 WHERE id=?', [companies[0]]);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email, senha: password })).status).toBe(401);
  } finally { await sql('UPDATE usuario SET ativo=1 WHERE id=?', [users[0]]); await sql('UPDATE empresa SET ativo=1 WHERE id=?', [companies[0]]); }
});
it('guarda real bloqueia escrita do leitor e consulta parametrizada não revela outra empresa', async () => {
  // Endpoints exclusivos do teste: cadastros reais pertencem à Fase 3.
  const fixture = express();
  fixture.use(requireSession(service));
  fixture.get('/recurso/:id', (req, res, next) => {
    void sql('SELECT id,nome FROM empresa WHERE id=? AND id=?', [req.params.id, companyId(req.auth)]).then(([rows]) => {
      const resource = (rows as RowDataPacket[])[0];
      if (!resource) throw new HttpError(404, 'NAO_ENCONTRADO', 'Recurso não encontrado.');
      res.json(resource);
    }).catch(next);
  });
  fixture.post('/recurso', requireRoles('administrador'), (_req, res) => { res.status(204).end(); });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => { res.status(error instanceof HttpError ? error.status : 500).json({ erro: { codigo: error.codigo } }); };
  fixture.use(errors);
  const cookie = await login();
  expect((await request(fixture).get(`/recurso/${companies[0]}`).set('Cookie', cookie)).status).toBe(200);
  expect((await request(fixture).get(`/recurso/${companies[1]}`).set('Cookie', cookie)).status).toBe(404);
  expect((await request(fixture).post('/recurso').set('Cookie', cookie)).status).toBe(403);
  try {
    await sql("UPDATE usuario SET perfil='administrador' WHERE id=?", [users[0]]);
    expect((await request(fixture).post('/recurso').set('Cookie', cookie)).status).toBe(204);
  } finally { await sql("UPDATE usuario SET perfil='leitor' WHERE id=?", [users[0]]); }
});
