import fs from 'node:fs';
import path from 'node:path';
import mqtt, { type IClientOptions } from 'mqtt';
import type { Logger } from 'pino';
import { backendRoot } from '../../config/env';
import type { MqttEnvironment } from '../../config/mqtt';

export interface IncomingMessage { topic: string; payload: Buffer; receivedAt: Date; retained: boolean }
export function mqttOptions(config: MqttEnvironment): IClientOptions {
  return {
    protocolVersion: 4, clean: false, clientId: config.MQTT_CLIENT_ID,
    username: config.MQTT_USERNAME || undefined, password: config.MQTT_PASSWORD || undefined,
    reconnectPeriod: config.MQTT_RECONNECT_MS, connectTimeout: 10000, keepalive: 30,
    rejectUnauthorized: true, resubscribe: false,
    ...(config.MQTT_CA_FILE ? { ca: fs.readFileSync(path.resolve(backendRoot, config.MQTT_CA_FILE)) } : {}),
  };
}

export function startMqttConsumer(config: MqttEnvironment, consume: (message: IncomingMessage) => Promise<unknown>, logger: Logger) {
  const client = mqtt.connect(config.MQTT_URL, mqttOptions(config));
  let subscribed = false; let stopping = false;
  let processing: Promise<unknown> = Promise.resolve();
  const topics = ['dados', 'status', 'porta'].map(suffix => `${config.MQTT_TOPIC_PREFIX}/+/${suffix}`);
  client.on('connect', () => {
    client.subscribe(topics, { qos: 1 }, (error, granted) => {
      subscribed = !error && !!granted && granted.length === topics.length && granted.every(item => item.qos === 1);
      if (subscribed) logger.info({ event: 'mqtt_subscribed' }, 'Assinaturas MQTT ativas');
      else { logger.error({ event: 'mqtt_subscription_failed' }, 'Broker não concedeu as assinaturas QoS 1'); client.stream.destroy(); }
    });
  });
  client.on('close', () => { subscribed = false; });
  client.on('error', () => { logger.warn({ event: 'mqtt_connection_error' }, 'Falha MQTT; reconexão automática habilitada'); });
  // MQTT.js só envia PUBACK de QoS 1 após este callback. Não consumir no evento message.
  client.handleMessage = (packet, callback) => {
    if (stopping) { callback(new Error('Consumidor encerrando')); return; }
    processing = consume({ topic: packet.topic, payload: Buffer.from(packet.payload), receivedAt: new Date(), retained: !!packet.retain });
    void processing.then(() => callback()).catch(() => {
      logger.error({ event: 'mqtt_persistence_failed' }, 'Transação não confirmada; aguardando reentrega');
      callback(new Error('Persistência indisponível'));
      client.stream.destroy();
    });
  };
  return {
    status: () => ({ connected: client.connected, subscribed }),
    async ready(timeout = 15000) {
      const deadline = Date.now() + timeout;
      while (!subscribed && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      if (!subscribed) throw new Error('MQTT indisponível ou assinatura recusada.');
    },
    async stop() {
      stopping = true;
      await new Promise<void>(resolve => client.end(true, {}, () => resolve()));
      await processing.catch(() => {});
    },
  };
}
