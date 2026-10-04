const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveSettings, loadSettings, connectionOptions } = require('./mqtt-settings');
const credentials = { MQTT_USERNAME: 'test', MQTT_PASSWORD: 'test-only' };
const base = { ...credentials, MQTT_TLS_URL: 'mqtts://broker.example:8883', MQTT_WSS_URL: 'wss://web.example:8084/custom-mqtt' };

test('endpoints independentes aceitam outro host, porta e caminho WSS', () => {
  const settings = resolveSettings(base);
  assert.equal(settings.wssUrl, base.MQTT_WSS_URL);
  assert.equal(settings.tlsUrl, base.MQTT_TLS_URL);
});
test('configuração original do HiveMQ continua aceita', () => {
  const settings = resolveSettings({ ...credentials, MQTT_HOST: 'cluster.example', MQTT_TLS_PORT: '8883', MQTT_WSS_PORT: '8884' });
  assert.equal(settings.wssUrl, 'wss://cluster.example:8884/mqtt');
});
test('WSS na porta padrão 443 funciona com proxy TLS', () => {
  const settings = resolveSettings({ ...base, MQTT_WSS_URL: 'wss://web.example:443/mqtt' });
  assert.equal(settings.wssUrl, 'wss://web.example/mqtt');
});
test('URL incompleta não usa fallback parcial para outro broker', () => {
  assert.throws(() => resolveSettings({ ...base, MQTT_WSS_URL: '', MQTT_HOST: 'legacy.example', MQTT_WSS_PORT: '8884' }), /MQTT_WSS_URL/);
});
test('rejeita protocolos sem TLS, URLs com segredos e portas inválidas', () => {
  for (const value of ['mqtt://host:1883', 'mqtts://user:password@host:8883', 'mqtts://host:99999', 'mqtts://host:8883/topic']) {
    assert.throws(() => resolveSettings({ ...base, MQTT_TLS_URL: value }), /MQTT_TLS_URL/);
  }
  for (const value of ['ws://host:9001/mqtt', 'wss://host:8884/mqtt?token=secret']) {
    assert.throws(() => resolveSettings({ ...base, MQTT_WSS_URL: value }), /MQTT_WSS_URL/);
  }
});
test('credenciais são obrigatórias e não aparecem nas mensagens de validação', () => {
  assert.throws(() => resolveSettings({ ...base, MQTT_PASSWORD: '' }), /MQTT_PASSWORD/);
  assert.throws(() => resolveSettings({ ...base, MQTT_TLS_URL: 'mqtts://test:secret@host:8883' }), error => !error.message.includes('secret'));
});
test('perfil inexistente e tentativa de sair da raiz falham sem fallback', () => {
  assert.throws(() => loadSettings({ MQTT_PROFILE: 'perfil-inexistente-de-teste' }), /não haverá fallback/);
  assert.throws(() => loadSettings({ MQTT_PROFILE: '../other' }), /MQTT_PROFILE inválido/);
});
test('MQTT 3.1.1 e validação de certificado ativos nos dois transportes', () => {
  const settings = resolveSettings(base);
  for (const transport of ['mqtts', 'wss']) {
    const options = connectionOptions(settings, transport);
    assert.equal(options.protocolVersion, 4);
    assert.equal(options.rejectUnauthorized, true);
    if (transport === 'wss') assert.equal(options.wsOptions.rejectUnauthorized, true);
  }
});
