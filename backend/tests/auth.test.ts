import { beforeAll, expect, it, vi } from 'vitest';
import request from 'supertest';
import * as argon2 from 'argon2';
import express, { type ErrorRequestHandler } from 'express';
import { createApp } from '../src/app';
import { createLogger } from '../src/shared/logger';
import { parseEnvironment } from '../src/config/env';
import { createAuthService, hashToken, type AuthService } from '../src/modules/auth/auth.service';
import { companyId, requireRoles } from '../src/modules/auth/auth.middleware';
import type { AuthRepository } from '../src/modules/auth/auth.repository';
import { HttpError } from '../src/shared/http-error';

const env = parseEnvironment({ DB_LOCAL_HOST: 'localhost', DB_LOCAL_PORT: '3306', DB_LOCAL_NAME: 'test', DB_LOCAL_USER: 'test', DB_LOCAL_PASSWORD: 'test' });
const user = { id: 1, empresa_id: 7, nome: 'Teste', email: 'test@example.com', perfil: 'leitor' as const, senha_hash: '' };
const repository: AuthRepository = { findUser: vi.fn(async email => email === user.email ? user : null), createSession: vi.fn(async () => true), findSession: vi.fn(async () => user), revokeSession: vi.fn(async () => {}) };
let service: AuthService;
beforeAll(async () => { user.senha_hash = await argon2.hash('senha-de-teste'); service = await createAuthService(repository, 8); });
const app = (overrides = {}) => createApp({ logger: createLogger('silent'), healthRepository: { ping: async () => {} }, auth: { service, env: { ...env, ...overrides } } });

it('credenciais erradas e e-mail inexistente produzem o mesmo 401', async () => {
  const server = app();
  const a = await request(server).post('/api/v1/auth/login').send({ email: user.email, senha: 'errada' });
  const b = await request(server).post('/api/v1/auth/login').send({ email: 'missing@example.com', senha: 'errada' });
  expect(a.status).toBe(401); expect(b.status).toBe(401); expect(a.body).toEqual(b.body);
});
it('login emite cookie protegido e persiste somente hash; não devolve senha/token no JSON', async () => {
  const result = await request(app()).post('/api/v1/auth/login').send({ email: user.email.toUpperCase(), senha: 'senha-de-teste' });
  expect(result.status).toBe(200);
  const cookie = result.headers['set-cookie'][0];
  expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Lax');
  const token = cookie.split(';')[0].split('=')[1];
  expect(vi.mocked(repository.createSession).mock.lastCall?.[0].tokenHash).toBe(hashToken(token));
  expect(result.body.usuario).not.toHaveProperty('senha_hash'); expect(result.text).not.toContain(token);
});
it('rejeita token ausente e inválido antes de consultar banco', async () => {
  vi.mocked(repository.findSession).mockClear();
  expect((await request(app()).get('/api/v1/auth/me')).status).toBe(401);
  expect((await request(app()).get('/api/v1/auth/me').set('Cookie', 'stma_session=forged')).status).toBe(401);
  expect(repository.findSession).not.toHaveBeenCalled();
});
it('rejeita origem externa, formulário e tentativa de injetar empresa/perfil', async () => {
  const server = app();
  expect((await request(server).post('/api/v1/auth/login').set('Origin', 'https://other.example').send({})).status).toBe(403);
  expect((await request(server).post('/api/v1/auth/logout').type('form').send('a=b')).status).toBe(415);
  expect((await request(server).post('/api/v1/auth/login').send({ email: user.email, senha: 'senha-de-teste', empresa_id: 9, perfil: 'administrador' })).status).toBe(400);
});
it('limita por e-mail normalizado independentemente da grafia', async () => {
  const server = app({ AUTH_EMAIL_LIMIT: 1 });
  expect((await request(server).post('/api/v1/auth/login').send({ email: user.email, senha: 'wrong' })).status).toBe(401);
  expect((await request(server).post('/api/v1/auth/login').send({ email: user.email.toUpperCase(), senha: 'wrong' })).status).toBe(429);
});
it('limita por IP mesmo alternando o e-mail', async () => {
  const server = app({ AUTH_IP_LIMIT: 1 });
  await request(server).post('/api/v1/auth/login').send({ email: user.email, senha: 'wrong' });
  const result = await request(server).post('/api/v1/auth/login').send({ email: 'other@example.com', senha: 'wrong' });
  expect(result.status).toBe(429); expect(result.headers['retry-after']).toBeDefined();
});
it('superadmin não ganha escopo de empresa implícito', () => {
  expect(companyId(user)).toBe(7);
  expect(() => companyId({ ...user, perfil: 'superadmin', empresa_id: null })).toThrow('vínculo');
});
it.each(['superadmin', 'administrador', 'operador', 'leitor'] as const)('guarda exige permissão explícita para %s', async perfil => {
  const fixture = express();
  fixture.use((req, _res, next) => { req.auth = { ...user, perfil, empresa_id: perfil === 'superadmin' ? null : 7 }; next(); });
  fixture.post('/administrar', requireRoles('administrador'), (_req, res) => { res.status(204).end(); });
  fixture.post('/operar', requireRoles('administrador', 'operador'), (_req, res) => { res.status(204).end(); });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => { res.status(error instanceof HttpError ? error.status : 500).end(); };
  fixture.use(errors);
  expect((await request(fixture).post('/administrar')).status).toBe(perfil === 'administrador' ? 204 : 403);
  expect((await request(fixture).post('/operar')).status).toBe(['administrador', 'operador'].includes(perfil) ? 204 : 403);
});
it('produção recusa cookie sem Secure e origem sem HTTPS', () => {
  const production = { NODE_ENV: 'production', DB_TARGET: 'aiven', DB_AIVEN_HOST: 'example.aivencloud.com', DB_AIVEN_PORT: '25060', DB_AIVEN_NAME: 'stma_db', DB_AIVEN_USER: 'test', DB_AIVEN_PASSWORD: 'test', DB_AIVEN_CA_FILE: 'certs/ca.pem', PUBLIC_ORIGIN: 'https://stma.example.com' };
  expect(parseEnvironment(production).SESSION_COOKIE_SECURE).toBe(true);
  expect(() => parseEnvironment({ ...production, SESSION_COOKIE_SECURE: 'false' })).toThrow('Secure');
  expect(() => parseEnvironment({ ...production, PUBLIC_ORIGIN: 'http://stma.example.com' })).toThrow('HTTPS');
  expect(() => parseEnvironment({ ...production, PUBLIC_ORIGIN: 'https://stma.example.com/path' })).toThrow('origem');
});
