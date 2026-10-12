import { randomUUID } from 'node:crypto';
import mqtt from 'mqtt';
import { loadEnvironment } from '../config/env';
import { mqttOptions } from '../modules/telemetria/mqtt-consumer';

async function main() {
  // Comandos explícitos de conexão também exigem todas as regras de segurança MQTT.
  process.env.MQTT_ENABLED = 'true';
  const config = loadEnvironment().mqtt;
  // Nunca reutilizar o client ID da ingestão: isso desconectaria o consumidor real.
  const client = await mqtt.connectAsync(config.MQTT_URL, { ...mqttOptions(config), clean: true, clientId: `check-${randomUUID()}`, reconnectPeriod: 0 });
  try {
    const granted = await client.subscribeAsync(['dados', 'status', 'porta'].map(kind => `${config.MQTT_TOPIC_PREFIX}/+/${kind}`), { qos: 1 });
    if (!granted || granted.some(item => item.qos !== 1)) throw new Error('Assinatura recusada.');
    console.log(JSON.stringify({ connected: true, qos: 1, tls: config.MQTT_URL.startsWith('mqtts:'), subscriptions: granted.length }));
  } finally { await client.endAsync(true); }
}
void main().catch(() => { console.error('MQTT_CHECK_FAILED: confira endpoint, TLS, credenciais e permissão de assinatura.'); process.exitCode = 1; });
