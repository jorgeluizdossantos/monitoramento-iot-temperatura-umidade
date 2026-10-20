import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import mqtt, { type MqttClient } from 'mqtt';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/env';
import { parseMqttEnvironment } from '../src/config/mqtt';
import { createDatabase } from '../src/db/mysql';
import { createLogger } from '../src/shared/logger';
import { startMqttConsumer } from '../src/modules/telemetria/mqtt-consumer';
import { createTelemetryService } from '../src/modules/telemetria/telemetry.service';
import { createMysqlTelemetryRepository } from '../src/modules/telemetria/mysql-telemetry.repository';
import { createPendingService } from '../src/modules/telemetria/pending.service';
import { createMysqlPendingRepository } from '../src/modules/telemetria/mysql-pending.repository';
import { createApp } from '../src/app';
import { createAuthService } from '../src/modules/auth/auth.service';
import { createMysqlAuthRepository } from '../src/modules/auth/mysql-auth.repository';
import { createMysqlHealthRepository } from '../src/modules/health/mysql-health.repository';

const env = loadEnvironment();
if (env.NODE_ENV !== 'test' || env.DB_TARGET !== 'local') throw new Error('MQTT E2E exige MySQL local e NODE_ENV=test.');
const db = createDatabase(env); const logger = createLogger('silent');
const suffix = randomUUID(); const deviceId = `e2e-${suffix}`; const unknown = `new-${suffix}`;
const config = parseMqttEnvironment({ MQTT_ENABLED: 'true', MQTT_CLIENT_ID: `consumer-${suffix}`, MQTT_TOPIC_PREFIX: `test-${suffix.slice(0, 20)}`, MQTT_RECONNECT_MS: '1000' }, false);
const committedCompanies: number[] = [];
const repo = createMysqlTelemetryRepository(db, companyId => { committedCompanies.push(companyId); });
let failure: 'before' | 'after' | null = null; let attempts = 0; const results: string[] = [];
const consume = createTelemetryService({ ingest: async message => {
  attempts++;
  if (failure === 'before') { failure = null; throw new Error('simulated-db-outage'); }
  const result = await repo.ingest(message);
  if (failure === 'after') { failure = null; throw new Error('simulated-ack-loss'); }
  results.push(result); return result;
} }, config, logger);
let consumer: ReturnType<typeof startMqttConsumer>;
let publisher: MqttClient; let secondPublisher: MqttClient;
let company: number; let room: number; let device: number; let adopted: number;
const userIds: number[] = []; let rootCookie: string; let adminCookie: string;
let app: ReturnType<typeof createApp>;
const sql = (query: string, values: (string | number | Date)[] = []) => db.withConnection(c => c.execute(query, values));
const insert = async (query: string, values: (string | number)[]) => (await sql(query, values))[0] as ResultSetHeader;
const topic = (id: string, kind = 'dados') => `${config.MQTT_TOPIC_PREFIX}/${id}/${kind}`;
const baseTime = Date.now() - 60000;
const payload = (offset: number, id = deviceId) => JSON.stringify({ id, temperatura: 22, umidade: 55, timestamp: new Date(baseTime + offset).toISOString() });
const publish = (body: string, id = deviceId, kind = 'dados', retained = false, client = publisher) => client.publishAsync(topic(id, kind), body, { qos: 1, retain: retained });
async function until(test: () => Promise<boolean> | boolean, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await test()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('Condição MQTT não observada no prazo.');
}
async function count(id = device) { const [[row]] = await db.withConnection(c => c.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM leitura_telemetria WHERE dispositivo_id=?', [id])); return Number(row.total); }
beforeAll(async () => {
  company = (await insert('INSERT INTO empresa (nome) VALUES (?)', [`mqtt-${suffix}`])).insertId;
  const unit = (await insert('INSERT INTO unidade (empresa_id,nome) VALUES (?,?)', [company, 'Unidade MQTT'])).insertId;
  const sector = (await insert('INSERT INTO setor (empresa_id,unidade_id,nome) VALUES (?,?,?)', [company, unit, 'Setor MQTT'])).insertId;
  room = (await insert('INSERT INTO ambiente (empresa_id,setor_id,nome) VALUES (?,?,?)', [company, sector, 'Sala MQTT'])).insertId;
  device = (await insert('INSERT INTO dispositivo (empresa_id,ambiente_id,device_id,sensor) VALUES (?,?,?,?)', [company, room, deviceId, 'DHT22'])).insertId;
  const hash = await argon2.hash('e2e-password-123');
  userIds.push((await insert("INSERT INTO usuario (nome,email,senha_hash,perfil) VALUES (?,?,?,'superadmin')", ['Root MQTT', `root-${suffix}@example.com`, hash])).insertId);
  userIds.push((await insert("INSERT INTO usuario (empresa_id,nome,email,senha_hash,perfil) VALUES (?,?,?,?,'administrador')", [company, 'Admin MQTT', `admin-${suffix}@example.com`, hash])).insertId);
  app = createApp({ logger, healthRepository: createMysqlHealthRepository(db), auth: { service: await createAuthService(createMysqlAuthRepository(db), 8), env }, pending: createPendingService(createMysqlPendingRepository(db)) });
  for (const role of ['root', 'admin']) {
    const response = await request(app).post('/api/v1/auth/login').send({ email: `${role}-${suffix}@example.com`, senha: 'e2e-password-123' });
    expect(response.status).toBe(200);
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    if (role === 'root') rootCookie = cookie; else adminCookie = cookie;
  }
  publisher = await mqtt.connectAsync(config.MQTT_URL, { clientId: `publisher-${suffix}`, reconnectPeriod: 0, connectTimeout: 5000 });
  secondPublisher = await mqtt.connectAsync('mqtt://127.0.0.1:18885', { clientId: `publisher-${suffix}`, reconnectPeriod: 0, connectTimeout: 5000 });
  consumer = startMqttConsumer(config, consume, logger); await consumer.ready();
}, 30000);
afterAll(async () => {
  try {
    await consumer?.stop();
    await publisher?.endAsync(true); await secondPublisher?.endAsync(true);
    // Remove as sessões persistentes exclusivas deste teste em ambos os brokers.
    for (const url of [config.MQTT_URL, 'mqtt://127.0.0.1:18885']) {
      const cleanup = await mqtt.connectAsync(url, { clientId: config.MQTT_CLIENT_ID, clean: true, reconnectPeriod: 0, connectTimeout: 3000 });
      await cleanup.endAsync(true);
    }
  } finally {
    try {
      for (const id of [device, adopted].filter(Boolean)) { await sql('DELETE FROM alerta WHERE dispositivo_id=?', [id]); await sql('DELETE FROM evento_porta WHERE dispositivo_id=?', [id]); await sql('DELETE FROM leitura_telemetria WHERE dispositivo_id=?', [id]); }
      if (company) {
        await sql('DELETE FROM auditoria WHERE empresa_id=?', [company]);
        for (const table of ['dispositivo', 'ambiente', 'setor', 'unidade']) await sql(`DELETE FROM ${table} WHERE empresa_id=?`, [company]);
      }
      for (const id of userIds) await sql('DELETE FROM usuario WHERE id=?', [id]);
      if (company) await sql('DELETE FROM empresa WHERE id=?', [company]);
      await sql('DELETE FROM dispositivo_pendente WHERE device_id=?', [unknown]);
    } finally { await db.close(); }
  }
}, 15000);
it('publicação QoS 1 chega ao MySQL e reenvio não duplica', async () => {
  await publish(payload(0)); await until(async () => await count() === 1);
  await publish(payload(0)); await until(() => results.includes('duplicate'));
  expect(await count()).toBe(1);
});
it('payload inválido é descartado; ID desconhecido vai à fila global', async () => {
  const previous = attempts;
  await publish('{'); await publish(payload(1000, unknown), unknown);
  await until(() => results.includes('pending'));
  expect(attempts).toBe(previous + 1); expect(await count()).toBe(1);
});
it('somente superadmin lista/adota; adoção é auditada e habilita novas leituras', async () => {
  expect((await request(app).get('/api/v1/dispositivos-pendentes').set('Cookie', adminCookie)).status).toBe(403);
  const list = await request(app).get('/api/v1/dispositivos-pendentes?tamanho=500').set('Cookie', rootCookie);
  expect(list.status).toBe(200);
  const pending = list.body.dados.find((row: { device_id: string }) => row.device_id === unknown);
  expect(pending).toBeDefined();
  const url = `/api/v1/dispositivos-pendentes/${pending.id}/adotar`;
  expect((await request(app).post(url).set('Cookie', adminCookie).send({ ambiente_id: room, sensor: 'DHT22' })).status).toBe(403);
  expect((await request(app).post(url).set('Cookie', rootCookie).send({ ambiente_id: 4294967295, sensor: 'DHT22' })).status).toBe(404);
  const response = await request(app).post(url).set('Cookie', rootCookie).send({ ambiente_id: room, sensor: 'DHT22' });
  expect(response.status).toBe(201); adopted = response.body.dados.id;
  expect(response.body.dados.empresa_id).toBe(company);
  expect((await request(app).post(url).set('Cookie', rootCookie).send({ ambiente_id: room, sensor: 'DHT22' })).status).toBe(409);
  expect(await count(adopted)).toBe(0);
  await publish(payload(2000, unknown), unknown); await until(async () => await count(adopted) === 1);
  const [audits] = await sql('SELECT acao FROM auditoria WHERE empresa_id=? ORDER BY id', [company]);
  expect((audits as RowDataPacket[]).map(row => row.acao)).toEqual(['criar', 'adotar']);
});
it('falha antes do commit impede ACK e broker reentrega após reconexão', async () => {
  const previous = attempts; failure = 'before';
  await publish(payload(3000)); await until(async () => await count() === 2);
  expect(attempts).toBeGreaterThanOrEqual(previous + 2);
}, 15000);
it('queda após commit e antes do ACK não duplica a leitura', async () => {
  const previous = results.filter(result => result === 'duplicate').length; failure = 'after';
  await publish(payload(4000)); await until(() => results.filter(result => result === 'duplicate').length > previous);
  expect(await count()).toBe(3);
}, 15000);
it('sessão persistente entrega mensagem publicada enquanto consumidor estava fora', async () => {
  await consumer.stop(); await publish(payload(5000));
  consumer = startMqttConsumer(config, consume, logger); await consumer.ready();
  await until(async () => await count() === 4);
}, 20000);
it('troca de broker altera só configuração e preserva serviço/repositório', async () => {
  await consumer.stop();
  consumer = startMqttConsumer({ ...config, MQTT_URL: 'mqtt://127.0.0.1:18885' }, consume, logger); await consumer.ready();
  await publish(payload(6000), deviceId, 'dados', false, secondPublisher);
  await until(async () => await count() === 5);
}, 20000);
it('LWT do broker marca offline; porta grava somente mudança de estado', async () => {
  const client = await mqtt.connectAsync('mqtt://127.0.0.1:18885', { clientId: `device-${suffix}`, reconnectPeriod: 0, will: { topic: topic(deviceId, 'status'), payload: 'offline', qos: 1, retain: false } });
  try {
    await client.publishAsync(topic(deviceId, 'status'), 'online', { qos: 1 });
    await client.publishAsync(topic(deviceId, 'porta'), 'Porta Fechada', { qos: 1 });
    await client.publishAsync(topic(deviceId, 'porta'), 'Porta Fechada', { qos: 1 });
    await client.publishAsync(topic(deviceId, 'porta'), 'Porta Aberta', { qos: 1 });
    await until(async () => { const [[row]] = await db.withConnection(c => c.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM evento_porta WHERE dispositivo_id=?', [device])); return Number(row.total) === 2; });
  } finally { await client.endAsync(true); }
  await until(async () => { const [[row]] = await db.withConnection(c => c.execute<RowDataPacket[]>('SELECT status_conexao FROM dispositivo WHERE id=?', [device])); return row.status_conexao === 'offline'; });
});

it('broker real abre e fecha episódio; commit notifica apenas a empresa do dispositivo', async () => {
  await sql('UPDATE ambiente SET temp_max_ideal=21,temp_tolerancia=2 WHERE id=?', [room]);
  const previous = committedCompanies.length;
  await publish(payload(7000), deviceId, 'dados', false, secondPublisher);
  await until(async () => {
    const [rows] = await sql('SELECT id FROM alerta WHERE dispositivo_id=? AND encerrado_em IS NULL', [device]);
    return (rows as RowDataPacket[]).length === 1;
  });
  const normal = JSON.parse(payload(8000)) as { temperatura: number };
  normal.temperatura = 20;
  await publish(JSON.stringify(normal), deviceId, 'dados', false, secondPublisher);
  await until(async () => {
    const [rows] = await sql('SELECT severidade,encerrado_em FROM alerta WHERE dispositivo_id=?', [device]);
    return !!(rows as RowDataPacket[])[0]?.encerrado_em;
  });
  expect(committedCompanies.slice(previous)).toEqual([company, company]);
});
it('publica comando não retido e persiste o UUID confirmado pelo dispositivo', async () => {
  const commandId=randomUUID(); const commandTopic=topic(deviceId,'acionar');
  await secondPublisher.subscribeAsync(commandTopic,{qos:1});
  const received=new Promise<{payload:string;retained:boolean}>(resolve=>{
    const handler=(name:string,payload:Buffer,packet:{retain?:boolean})=>{if(name!==commandTopic)return;secondPublisher.off('message',handler);resolve({payload:payload.toString(),retained:!!packet.retain});};
    secondPublisher.on('message',handler);
  });
  const payload=`${commandId}|${Math.floor(Date.now()/1000)+15}|led|L`;
  await consumer.publishCommand(deviceId,payload);
  expect(await received).toEqual({payload,retained:false});
  await secondPublisher.publishAsync(topic(deviceId,'controle'),JSON.stringify({id:deviceId,led:true,limite:null,comando_id:commandId}),{qos:1,retain:false});
  await until(async()=>{const [[row]]=await db.withConnection(c=>c.execute<RowDataPacket[]>('SELECT led_aceso,controle_comando_id FROM dispositivo WHERE id=?',[device]));return !!row.led_aceso&&row.controle_comando_id===commandId;});
  await secondPublisher.unsubscribeAsync(commandTopic);
});
