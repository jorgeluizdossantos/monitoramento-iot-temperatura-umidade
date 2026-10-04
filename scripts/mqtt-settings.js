// Configuração do smoke test da Fase 0. Contrato a reutilizar na Fase 2.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.join(__dirname, '../backend/package.json'));
const root = path.join(__dirname, '..');

function required(env, key) {
  if (typeof env[key] !== 'string' || !env[key].trim()) throw new Error(`Preencha ${key} no perfil MQTT.`);
  return env[key];
}

function endpoint(value, protocol, key) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${key}: URL inválida.`); }
  if (url.protocol !== `${protocol}:` || !url.hostname || (protocol === 'mqtts' && !url.port) ||
      url.username || url.password || url.search || url.hash ||
      (protocol === 'mqtts' && url.pathname && url.pathname !== '/')) {
    throw new Error(`${key}: use ${protocol}://host:porta${protocol === 'wss' ? '/caminho' : ''}, sem credenciais, query ou fragmento.`);
  }
  return url.href;
}

function resolveSettings(env) {
  let tlsUrl = env.MQTT_TLS_URL;
  let wssUrl = env.MQTT_WSS_URL;
  // Compatibilidade com o .env original; nunca combinar meia configuração nova com antiga.
  if (!tlsUrl && !wssUrl) {
    const host = required(env, 'MQTT_HOST');
    if (!/^[a-zA-Z0-9.-]+$/.test(host)) throw new Error('MQTT_HOST inválido. Para IPv6, use as URLs completas.');
    tlsUrl = `mqtts://${host}:${required(env, 'MQTT_TLS_PORT')}`;
    wssUrl = `wss://${host}:${required(env, 'MQTT_WSS_PORT')}/mqtt`;
  }
  return {
    tlsUrl: endpoint(tlsUrl, 'mqtts', 'MQTT_TLS_URL'),
    wssUrl: endpoint(wssUrl, 'wss', 'MQTT_WSS_URL'),
    username: required(env, 'MQTT_USERNAME'),
    password: required(env, 'MQTT_PASSWORD'),
    caFile: env.MQTT_CA_FILE || null
  };
}

function loadSettings(env = process.env) {
  const profile = env.MQTT_PROFILE || 'default';
  if (!/^[a-zA-Z0-9_-]+$/.test(profile)) throw new Error('MQTT_PROFILE inválido. Use letras, números, hífen ou sublinhado.');
  const filename = profile === 'default' ? '.env' : `.env.${profile}.local`;
  const filepath = path.join(root, filename);
  if (profile !== 'default' && !fs.existsSync(filepath)) throw new Error(`Crie ${filename} na raiz do projeto; não haverá fallback para outro broker.`);
  const fromFile = fs.existsSync(filepath) ? backendRequire('dotenv').parse(fs.readFileSync(filepath)) : {};
  const settings = resolveSettings({ ...fromFile, ...env });
  return { ...settings, profile };
}

function connectionOptions(settings, transport) {
  const ca = settings.caFile ? fs.readFileSync(path.resolve(root, settings.caFile)) : undefined;
  return {
    username: settings.username, password: settings.password,
    protocolVersion: 4, // MQTT 3.1.1: base comum, sem extensões de fornecedor.
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
    ...(transport === 'wss' ? { wsOptions: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } } : {})
  };
}

module.exports = { backendRequire, resolveSettings, loadSettings, connectionOptions };
