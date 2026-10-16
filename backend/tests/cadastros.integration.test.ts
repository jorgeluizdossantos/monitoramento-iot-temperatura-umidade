import { createPendingService } from '../src/modules/telemetria/pending.service';
import { createMysqlPendingRepository } from '../src/modules/telemetria/mysql-pending.repository';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import * as argon2 from 'argon2';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/env';
import { createDatabase } from '../src/db/mysql';
import { createApp } from '../src/app';
import { createLogger } from '../src/shared/logger';
import { createMysqlHealthRepository } from '../src/modules/health/mysql-health.repository';
import { createMysqlAuthRepository } from '../src/modules/auth/mysql-auth.repository';
import { createAuthService } from '../src/modules/auth/auth.service';
import { createCadastroService } from '../src/modules/cadastros/cadastro.service';
import { createMysqlCadastroRepository, createMysqlBootstrapRepository } from '../src/modules/cadastros/mysql-cadastro.repository';
import type { CadastroRepository } from '../src/modules/cadastros/cadastro.repository';

const env = loadEnvironment();
if (env.DB_TARGET !== 'local' || env.NODE_ENV !== 'test') throw new Error('Integração exige NODE_ENV=test e DB_TARGET=local.');
const db = createDatabase(env);
const sql = (query: string, values: (string | number | null)[] = []) => db.withConnection(c => c.execute(query, values));
const suffix = randomUUID();
const password = 'senha-cadastros-teste-123';
const companies: number[] = [];
let rootId: number;
let root: string; let adminA: string; let adminB: string; let reader: string; let operator: string;
let app: ReturnType<typeof createApp>;
let repository: CadastroRepository;
let unitA: number; let unitB: number; let sectorA: number; let sectorB: number; let roomA: number; let roomB: number; let deviceA: number;
let readerId: number;
const email = (label: string) => `${label}-${suffix}@example.com`;
const send = (method: 'get' | 'post' | 'patch' | 'delete', path: string, cookie: string) => request(app)[method](`/api/v1${path}`).set('Cookie', cookie);
async function login(address: string, secret = password) {
  const response = await request(app).post('/api/v1/auth/login').send({ email: address, senha: secret });
  expect(response.status).toBe(200);
  return response.headers['set-cookie'][0].split(';')[0];
}
async function create(path: string, body: object, cookie = adminA) {
  const response = await send('post', path, cookie).send(body);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.dados;
}
beforeAll(async () => {
  const hash = await argon2.hash(password);
  const [insert] = await sql("INSERT INTO usuario (nome,email,senha_hash,perfil) VALUES (?,?,?,'superadmin')", [`Fixture ${suffix}`, email('root'), hash]);
  rootId = (insert as ResultSetHeader).insertId;
  repository = createMysqlCadastroRepository(db);
  app = createApp({ logger: createLogger('silent'), healthRepository: createMysqlHealthRepository(db), auth: { service: await createAuthService(createMysqlAuthRepository(db), 8), env: { ...env, AUTH_IP_LIMIT: 1000, AUTH_EMAIL_LIMIT: 100 } }, cadastros: createCadastroService(repository), pending: createPendingService(createMysqlPendingRepository(db)) });
  root = await login(email('root'));
  for (const label of ['a', 'b']) {
    const company = await create('/empresas', { nome: `${label}-${suffix}`, administrador: { nome: `Admin ${label}`, email: email(label), senha: password } }, root);
    companies.push(company.id);
  }
  adminA = await login(email('a')); adminB = await login(email('b'));
  unitA = (await create('/unidades', { nome: 'Unidade A', fuso_horario: 'America/Bahia' })).id;
  unitB = (await create('/unidades', { nome: 'Unidade B' }, adminB)).id;
  sectorA = (await create('/setores', { nome: 'Setor A', unidade_id: unitA })).id;
  sectorB = (await create('/setores', { nome: 'Setor B', unidade_id: unitB }, adminB)).id;
  roomA = (await create('/ambientes', { nome: 'Sala A', setor_id: sectorA, temp_min_ideal: 10, temp_max_ideal: 30 })).id;
  roomB = (await create('/ambientes', { nome: 'Sala B', setor_id: sectorB }, adminB)).id;
  deviceA = (await create('/dispositivos', { ambiente_id: roomA, device_id: `esp-${suffix}`, sensor: 'DHT22' })).id;
  readerId = (await create('/usuarios', { nome: 'Leitor', email: email('reader'), senha: password, perfil: 'leitor' })).id;
  await create('/usuarios', { nome: 'Operador', email: email('operator'), senha: password, perfil: 'operador' });
  reader = await login(email('reader')); operator = await login(email('operator'));
}, 30000);
afterAll(async () => {
  try {
    for (const id of companies) {
      await sql('DELETE FROM auditoria WHERE empresa_id=?', [id]);
      for (const table of ['dispositivo', 'ambiente', 'setor', 'unidade', 'usuario']) await sql(`DELETE FROM ${table} WHERE empresa_id=?`, [id]);
      await sql('DELETE FROM empresa WHERE id=?', [id]);
    }
    if (rootId) { await sql('DELETE FROM auditoria WHERE usuario_id=?', [rootId]); await sql('DELETE FROM usuario WHERE id=?', [rootId]); }
  } finally { await db.close(); }
});

it('cria a hierarquia real; listas e detalhes são isolados por empresa', async () => {
  for (const [path, id] of [['unidades', unitA], ['setores', sectorA], ['ambientes', roomA], ['dispositivos', deviceA], ['usuarios', readerId]] as const) {
    expect((await send('get', `/${path}/${id}`, adminA)).status).toBe(200);
    expect((await send('get', `/${path}/${id}`, adminB)).status).toBe(404);
    expect((await send('patch', `/${path}/${id}`, adminB).send({ nome: 'invasão' })).status).toBe(404);
    expect((await send('delete', `/${path}/${id}`, adminB).send({})).status).toBe(404);
    const list = await send('get', `/${path}`, adminB);
    expect(list.status).toBe(200);
    expect(list.body.dados.every((row: { empresa_id: number }) => row.empresa_id === companies[1])).toBe(true);
    expect(list.body.dados.some((row: { id: number }) => row.id === id)).toBe(false);
  }
});
it('POST e PATCH recusam pais de outra empresa em todos os níveis', async () => {
  for (const [path, id, body] of [
    ['setores', sectorA, { nome: 'Inválido', unidade_id: unitB }],
    ['ambientes', roomA, { nome: 'Inválido', setor_id: sectorB }],
    ['dispositivos', deviceA, { ambiente_id: roomB, device_id: `bad-${suffix}`, sensor: 'DHT22' }],
  ] as const) {
    expect((await send('post', `/${path}`, adminA).send(body)).status).toBe(404);
    expect((await send('patch', `/${path}/${id}`, adminA).send(body)).status).toBe(404);
  }
});
it('o próprio MySQL impede vínculos cruzados de setor, ambiente e dispositivo', async () => {
  await expect(sql('INSERT INTO setor (empresa_id,unidade_id,nome) VALUES (?,?,?)', [companies[0], unitB, 'inválido'])).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  await expect(sql('INSERT INTO ambiente (empresa_id,setor_id,nome) VALUES (?,?,?)', [companies[0], sectorB, 'inválido'])).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  await expect(sql('INSERT INTO dispositivo (empresa_id,ambiente_id,device_id,sensor) VALUES (?,?,?,?)', [companies[0], roomB, `bad-${suffix}`, 'DHT22'])).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
});
it('perfis bloqueiam cadastros e permitem somente manutenção ao operador', async () => {
  expect((await request(app).get('/api/v1/unidades')).status).toBe(401);
  for (const cookie of [reader, operator]) {
    expect((await send('get', '/ambientes', cookie)).status).toBe(200);
    expect((await send('post', '/unidades', cookie).send({ nome: 'negado' })).status).toBe(403);
    expect((await send('patch', `/dispositivos/${deviceA}`, cookie).send({ em_manutencao: true })).status).toBe(403);
    expect((await send('get', '/usuarios', cookie)).status).toBe(403);
  }
  expect((await send('get', '/empresas', adminA)).status).toBe(403);
  expect((await send('get', '/unidades', root)).status).toBe(403);
  expect((await send('post', '/usuarios', root).send({})).status).toBe(403);
  expect((await send('patch', `/dispositivos/${deviceA}/manutencao`, reader).send({ em_manutencao: true })).status).toBe(403);
  expect((await send('patch', `/dispositivos/${deviceA}/manutencao`, operator).send({ em_manutencao: true, ambiente_id: roomB })).status).toBe(400);
  const result = await send('patch', `/dispositivos/${deviceA}/manutencao`, operator).send({ em_manutencao: true });
  expect(result.status).toBe(200); expect(result.body.dados.em_manutencao).toBe(true);
});
it('valida PATCH de faixa contra valores persistidos; mantém null opcional', async () => {
  expect((await send('patch', `/ambientes/${roomA}`, adminA).send({ temp_min_ideal: 40 })).status).toBe(400);
  expect((await send('patch', `/ambientes/${roomA}`, adminA).send({ temp_max_ideal: null })).status).toBe(200);
  expect((await send('patch', `/ambientes/${roomA}`, adminA).send({ temp_max_ideal: 30 })).status).toBe(200);
});
it('duplica identificadores com 409; criação de empresa/admin é atômica', async () => {
  expect((await send('post', '/unidades', adminA).send({ nome: 'Unidade A' })).status).toBe(409);
  expect((await send('post', '/usuarios', adminB).send({ nome: 'Duplicado', email: email('reader'), senha: password, perfil: 'leitor' })).status).toBe(409);
  expect((await send('post', '/dispositivos', adminB).send({ ambiente_id: roomB, device_id: `esp-${suffix}`, sensor: 'DHT22' })).status).toBe(409);
  const name = `rollback-${suffix}`;
  const response = await send('post', '/empresas', root).send({ nome: name, administrador: { nome: 'Duplicado', email: email('reader'), senha: password } });
  expect(response.status).toBe(409);
  const [rows] = await sql('SELECT id FROM empresa WHERE nome=?', [name]);
  expect(rows).toHaveLength(0);
});
it('DELETE e PATCH desativam sem cascata; listagem oculta inativos e reativação funciona', async () => {
  const response = await send('delete', `/unidades/${unitA}`, adminA).send({});
  expect(response.status).toBe(200); expect(response.body.dados.ativo).toBe(false);
  expect((await send('get', '/unidades', adminA)).body.dados.some((row: { id: number }) => row.id === unitA)).toBe(false);
  expect((await send('get', '/unidades?incluir_inativos=true', adminA)).body.dados.some((row: { id: number }) => row.id === unitA)).toBe(true);
  expect((await send('get', `/setores/${sectorA}`, adminA)).body.dados.ativo).toBe(true);
  expect((await send('post', '/setores', adminA).send({ nome: 'Pai inativo', unidade_id: unitA })).status).toBe(409);
  expect((await send('post', '/ambientes', adminA).send({ nome: 'Avô inativo', setor_id: sectorA })).status).toBe(409);
  expect((await send('patch', `/unidades/${unitA}`, adminA).send({ ativo: true })).status).toBe(200);
  for (const [path, id] of [['dispositivos', deviceA], ['ambientes', roomA], ['setores', sectorA], ['usuarios', readerId]] as const) {
    expect((await send('delete', `/${path}/${id}`, adminA).send({})).body.dados.ativo).toBe(false);
    expect((await send('get', `/${path}/${id}`, adminA)).status).toBe(200);
    expect((await send('patch', `/${path}/${id}`, adminA).send({ ativo: true })).status).toBe(200);
  }
  reader = await login(email('reader'));
});
it('não permite alterar autoridade; paginação e origem são validadas', async () => {
  expect((await send('post', '/unidades', adminA).send({ nome: 'forjado', empresa_id: companies[1] })).status).toBe(400);
  expect((await send('patch', `/usuarios/${readerId}`, adminA).send({ perfil: 'superadmin' })).status).toBe(400);
  expect((await send('patch', `/usuarios/${readerId}`, adminA).send({ senha_hash: 'forjado' })).status).toBe(400);
  expect((await send('post', '/unidades', adminA).set('Origin', 'https://evil.example').send({ nome: 'forjado' })).status).toBe(403);
  expect((await send('post', '/unidades', adminA).type('form').send('nome=forjado')).status).toBe(415);
  expect((await send('get', '/unidades?tamanho=501', adminA)).status).toBe(400);
  expect((await send('get', '/unidades?empresa_id=1', adminA)).status).toBe(400);
  const page = await send('get', '/usuarios?pagina=1&tamanho=1', adminA);
  expect(page.body.dados).toHaveLength(1); expect(page.body.total).toBeGreaterThan(1);
  expect((await send('get', '/unidades/1%20OR%201=1', adminA)).status).toBe(400);
});
it('edição de senha revoga sessões e hash/segredo não aparecem em respostas ou auditoria', async () => {
  const newPassword = 'nova-senha-cadastros-123';
  const [previous] = await sql('SELECT senha_hash FROM usuario WHERE id=?', [readerId]);
  const result = await send('patch', `/usuarios/${readerId}`, adminA).send({ senha: newPassword });
  expect(result.status).toBe(200); expect(result.text).not.toContain('senha_hash'); expect(result.text).not.toContain(newPassword);
  expect((await send('get', '/auth/me', reader)).status).toBe(401);
  expect((await request(app).post('/api/v1/auth/login').send({ email: email('reader'), senha: password })).status).toBe(401);
  reader = await login(email('reader'), newPassword);
  const [rows] = await sql('SELECT senha_hash FROM usuario WHERE id=?', [readerId]);
  expect(await argon2.verify((rows as RowDataPacket[])[0].senha_hash, newPassword)).toBe(true);
  // Um login iniciado antes da troca não pode abrir sessão depois dela com a senha antiga.
  expect(await createMysqlAuthRepository(db).createSession({ usuarioId: readerId, passwordSnapshot: (previous as RowDataPacket[])[0].senha_hash, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60000), ip: null, userAgent: null })).toBe(false);
  const [audits] = await sql('SELECT antes,depois,usuario_id,ip FROM auditoria WHERE empresa_id=? AND entidade=? AND entidade_id=?', [companies[0], 'usuario', readerId]);
  const serialized = JSON.stringify(audits);
  expect(serialized).not.toContain(newPassword); expect(serialized).not.toContain('senha_hash'); expect(serialized).not.toContain('$argon2');
  expect(serialized).toContain('senha_alterada');
  expect((audits as RowDataPacket[]).every(row => row.usuario_id && row.ip)).toBe(true);
});
it('duas desativações concorrentes mantêm ao menos um administrador ativo', async () => {
  const second = await create('/usuarios', { nome: 'Segundo admin', email: email('second'), senha: password, perfil: 'administrador' });
  const me = await send('get', '/auth/me', adminA);
  const firstId = me.body.usuario.id;
  const results = await Promise.all([
    send('patch', `/usuarios/${firstId}`, adminA).send({ ativo: false }),
    send('patch', `/usuarios/${second.id}`, adminA).send({ ativo: false }),
  ]);
  expect(results.filter(r => r.status === 200)).toHaveLength(1);
  expect(results.some(r => [401, 403, 409].includes(r.status))).toBe(true);
  const [[counts]] = await db.withConnection(c => c.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM usuario WHERE empresa_id=? AND ativo=1 AND perfil='administrador'", [companies[0]]));
  expect(Number(counts.total)).toBe(1);
  const [first] = await sql('SELECT ativo FROM usuario WHERE id=?', [firstId]);
  const survivor = (first as RowDataPacket[])[0].ativo ? email('a') : email('second');
  adminA = await login(survivor);
  const survivorId = (await send('get', '/auth/me', adminA)).body.usuario.id;
  expect((await send('delete', `/usuarios/${survivorId}`, adminA).send({})).status).toBe(409);
  expect((await send('patch', `/usuarios/${survivorId}`, adminA).send({ perfil: 'leitor' })).status).toBe(409);
});
it('falha de auditoria desfaz alteração e não deixa cadastro parcial', async () => {
  const failing: CadastroRepository = { ...repository, transaction: work => repository.transaction(tx => work({ ...tx, audit: async () => { throw new Error('audit-unavailable'); } })) };
  const principal = (await send('get', '/auth/me', adminA)).body.usuario;
  await expect(createCadastroService(failing).update('unidade', unitA, { nome: 'não deve persistir' }, { actor: principal, ip: null })).rejects.toThrow('audit-unavailable');
  expect((await send('get', `/unidades/${unitA}`, adminA)).body.dados.nome).toBe('Unidade A');
});
it('superadmin desativa e reativa empresa; sessões da empresa ficam bloqueadas enquanto inativa', async () => {
  expect((await send('delete', `/empresas/${companies[1]}`, root).send({})).body.dados.ativo).toBe(false);
  expect((await send('get', '/auth/me', adminB)).status).toBe(401);
  expect((await send('get', `/empresas/${companies[1]}`, root)).status).toBe(200);
  expect((await send('patch', `/empresas/${companies[1]}`, root).send({ ativo: true, nome: `editada-${suffix}` })).status).toBe(200);
  expect((await send('get', '/auth/me', adminB)).status).toBe(200);
});
it('bootstrap recusa sobrescrever superadmin existente', async () => {
  await expect(createMysqlBootstrapRepository(db).createFirstSuperadmin({ nome: 'Não criar', email: email('bootstrap'), senha_hash: 'never-used' })).rejects.toMatchObject({ codigo: 'SUPERADMIN_EXISTENTE' });
  const [rows] = await sql('SELECT id FROM usuario WHERE email=?', [email('bootstrap')]);
  expect(rows).toHaveLength(0);
});
it('todas as seis entidades geraram auditoria com antes/depois e ator correto', async () => {
  const [rows] = await sql('SELECT entidade,acao,antes,depois,usuario_id FROM auditoria WHERE empresa_id=?', [companies[0]]);
  expect(new Set((rows as RowDataPacket[]).map(row => row.entidade))).toEqual(new Set(['empresa', 'unidade', 'setor', 'ambiente', 'usuario', 'dispositivo']));
  expect((rows as RowDataPacket[]).filter(row => row.acao === 'criar').every(row => row.antes === null)).toBe(true);
  expect((rows as RowDataPacket[]).filter(row => row.acao === 'desativar').every(row => row.antes && row.depois && row.usuario_id)).toBe(true);
});

it('destinos de adoção exigem superadmin e filtram empresa e hierarquia ativa', async () => {
  const path = `/dispositivos-pendentes/destinos?empresa_id=${companies[0]}&tamanho=1`;
  expect((await send('get', path, adminA)).status).toBe(403);
  expect((await send('get', '/dispositivos-pendentes/destinos', root)).status).toBe(400);
  const response = await send('get', path, root);
  expect(response.status).toBe(200);
  expect(response.body.dados).toEqual([expect.objectContaining({id: roomA, unidade_nome:'Unidade A', setor_nome:'Setor A'})]);
  expect(response.body.dados[0]).not.toHaveProperty('temperatura');
  expect(response.body.dados.some((r: {id:number})=>r.id===roomB)).toBe(false);
  await sql('UPDATE unidade SET ativo=0 WHERE id=?', [unitA]);
  try { expect((await send('get', path, root)).body.total).toBe(0); }
  finally { await sql('UPDATE unidade SET ativo=1 WHERE id=?', [unitA]); }
});
