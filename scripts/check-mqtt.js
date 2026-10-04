// Smoke test da Fase 0: autenticação e PINGRESP, sem consumir/publicar telemetria.
const { backendRequire, required, fail } = require('./setup-utils');
const mqtt = backendRequire('mqtt');

async function check(protocol, portKey) {
  const host = required('MQTT_HOST');
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) throw new Error('MQTT_HOST deve conter somente o hostname do cluster.');
  const port = Number(required(portKey));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Porta inválida: ${portKey}`);
  const username = required('MQTT_USERNAME');
  const password = required('MQTT_PASSWORD');
  await new Promise((resolve, reject) => {
    const client = mqtt.connect(`${protocol}://${host}:${port}${protocol === 'wss' ? '/mqtt' : ''}`, {
      username, password, rejectUnauthorized: true, reconnectPeriod: 0,
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
  console.log(`${protocol.toUpperCase()}:${port}: autenticação e PINGRESP confirmados.`);
}

(async () => {
  await check('mqtts', 'MQTT_TLS_PORT');
  await check('wss', 'MQTT_WSS_PORT');
})().catch(fail);
