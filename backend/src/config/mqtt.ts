import { z } from 'zod';

export function parseMqttEnvironment(input: NodeJS.ProcessEnv, production: boolean) {
  const result = z.object({
    MQTT_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    MQTT_URL: z.string().default('mqtt://127.0.0.1:18884'),
    MQTT_CLIENT_ID: z.string().regex(/^[a-zA-Z0-9_-]{3,64}$/).default('stma-backend-local'),
    MQTT_TOPIC_PREFIX: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/).default('engeasier'),
    MQTT_DEVICE_IDS: z.string().default('').transform(v => v.split(',').map(s => s.trim()).filter(Boolean)).pipe(z.array(z.string().regex(/^[a-z0-9_-]{3,64}$/)).max(100)),
    MQTT_USERNAME: z.string().optional(), MQTT_PASSWORD: z.string().optional(), MQTT_CA_FILE: z.string().optional(),
    MQTT_PUBLISH_USERNAME: z.string().optional(), MQTT_PUBLISH_PASSWORD: z.string().optional(),
    MQTT_RECONNECT_MS: z.coerce.number().int().min(1000).max(60000).default(3000),
    MQTT_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(2160).default(168),
    MQTT_FUTURE_TOLERANCE_SECONDS: z.coerce.number().int().min(0).max(300).default(60),
  }).safeParse(input);
  if (!result.success) throw new Error(`Configuração MQTT inválida: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const config = result.data;
  let url: URL;
  try { url = new URL(config.MQTT_URL); } catch { throw new Error('MQTT_URL inválida.'); }
  const websocket = url.protocol === 'wss:';
  if (!url.hostname || url.port === '0' || !['mqtt:', 'mqtts:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (!websocket && url.pathname && url.pathname !== '/')) throw new Error('MQTT_URL deve conter mqtt(s)://host:porta ou wss://host:porta/caminho; credenciais em campos separados.');
  if (config.MQTT_ENABLED && url.protocol === 'mqtt:' && (production || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('MQTT sem TLS permitido somente em loopback de desenvolvimento/teste.');
  if (config.MQTT_ENABLED && production && (!config.MQTT_USERNAME || !config.MQTT_PASSWORD)) throw new Error('MQTT de produção exige autenticação.');
  if (!!config.MQTT_USERNAME !== !!config.MQTT_PASSWORD) throw new Error('Preencha MQTT_USERNAME e MQTT_PASSWORD juntos.');
  if (!!config.MQTT_PUBLISH_USERNAME !== !!config.MQTT_PUBLISH_PASSWORD) throw new Error('Preencha MQTT_PUBLISH_USERNAME e MQTT_PUBLISH_PASSWORD juntos.');
  return config;
}
export type MqttEnvironment = ReturnType<typeof parseMqttEnvironment>;
