// Smoke test da Fase 0: autenticação e PINGRESP, sem consumir/publicar telemetria.
const { backendRequire, loadSettings, connectionOptions } = require('./mqtt-settings');
const mqtt = backendRequire('mqtt');

async function check(settings, protocol, url) {
  const options = connectionOptions(settings, protocol);
  await new Promise((resolve, reject) => {
    const client = mqtt.connect(url, {
      ...options, reconnectPeriod: 0,
      connectTimeout: 10000, keepalive: 2, clean: true,
      clientId: `setup-${require('node:crypto').randomUUID()}`
    });
    let finished = false;
    const timer = setTimeout(() => finish(new Error('Tempo limite aguardando autenticação e PINGRESP.')), 15000);
    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      client.end(true, {}, () => error ? reject(error) : resolve());
    }
    client.on('error', () => finish(new Error(`Falha em ${protocol}: verifique host, porta, certificado e credenciais.`)));
    client.on('close', () => { if (!finished) finish(new Error('Broker encerrou a conexão antes do PINGRESP.')); });
    client.on('packetreceive', packet => { if (packet.cmd === 'pingresp') finish(); });
  });
  console.log(`Perfil ${settings.profile}, ${protocol.toUpperCase()}: autenticação e PINGRESP confirmados.`);
}

(async () => {
  const settings = loadSettings();
  await check(settings, 'mqtts', settings.tlsUrl);
  await check(settings, 'wss', settings.wssUrl);
})().catch(error => {
  console.error(`Falha na verificação MQTT: ${error.code || error.message}`);
  process.exitCode = 1;
});
