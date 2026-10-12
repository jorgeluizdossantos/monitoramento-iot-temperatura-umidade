import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import mqtt from 'mqtt';
import { z } from 'zod';
import { loadEnvironment } from '../config/env';
import { mqttOptions } from '../modules/telemetria/mqtt-consumer';

async function main() {
  const { values } = parseArgs({ options: { device: { type: 'string' }, temperature: { type: 'string', default: '22.5' }, humidity: { type: 'string', default: '55' }, timestamp: { type: 'string' } } });
  const data = z.object({ device: z.string().regex(/^[a-z0-9_-]{3,64}$/), temperature: z.coerce.number().min(-50).max(100), humidity: z.coerce.number().min(0).max(100), timestamp: z.string().datetime({ offset: true }).optional() }).parse(values);
  // Comandos explícitos de conexão também exigem todas as regras de segurança MQTT.
  process.env.MQTT_ENABLED = 'true';
  const config = loadEnvironment().mqtt;
  const client = await mqtt.connectAsync(config.MQTT_URL, { ...mqttOptions(config), clean: true, clientId: `publisher-${randomUUID()}`, reconnectPeriod: 0, username: config.MQTT_PUBLISH_USERNAME || config.MQTT_USERNAME || undefined, password: config.MQTT_PUBLISH_PASSWORD || config.MQTT_PASSWORD || undefined });
  const timestamp = data.timestamp ?? new Date().toISOString();
  try {
    await client.publishAsync(`${config.MQTT_TOPIC_PREFIX}/${data.device}/dados`, JSON.stringify({ id: data.device, temperatura: data.temperature, umidade: data.humidity, timestamp }), { qos: 1, retain: false });
    console.log(JSON.stringify({ published: true, deviceId: data.device, timestamp, qos: 1, note: 'Broker confirmou recebimento; confira persistência no banco.' }));
  } finally { await client.endAsync(true); }
}
void main().catch(() => { console.error('MQTT_PUBLISH_FAILED: confira argumentos, conexão e credencial com permissão de publicação.'); process.exitCode = 1; });
