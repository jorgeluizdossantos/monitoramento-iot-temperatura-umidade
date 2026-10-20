import { expect, it } from 'vitest';
import { parseMqttEnvironment } from '../src/config/mqtt';
import { mqttOptions } from '../src/modules/telemetria/mqtt-consumer';
it('MVP usa WSS e lista explícita sem relaxar produção', () => {
  const input = { MQTT_ENABLED: 'true', MQTT_URL: 'wss://broker.hivemq.com:8884/mqtt', MQTT_DEVICE_IDS: 'esp32-001,esp32-002' };
  expect(parseMqttEnvironment(input, false).MQTT_DEVICE_IDS).toEqual(['esp32-001', 'esp32-002']);
  expect(() => parseMqttEnvironment(input, true)).toThrow('autenticação');
  expect(() => parseMqttEnvironment({ ...input, MQTT_URL: 'ws://broker.hivemq.com:8000/mqtt' }, false)).toThrow();
  expect(() => parseMqttEnvironment({ ...input, MQTT_DEVICE_IDS: '+' }, false)).toThrow();
});

it('MQTT é opcional e aceita TCP somente no desenvolvimento local', () => {
  expect(parseMqttEnvironment({}, true).MQTT_ENABLED).toBe(false);
  expect(parseMqttEnvironment({ MQTT_ENABLED: 'true' }, false).MQTT_URL).toBe('mqtt://127.0.0.1:18884');
  expect(() => parseMqttEnvironment({ MQTT_ENABLED: 'true' }, true)).toThrow('TLS');
  expect(() => parseMqttEnvironment({ MQTT_ENABLED: 'true', MQTT_URL: 'mqtt://broker.example.com:1883' }, false)).toThrow('TLS');
});
it('troca broker sem SDK do fornecedor e mantém TLS/sessão persistente', () => {
  for (const host of ['example.hivemq.cloud', 'example.emqx.cloud', 'mosquitto.example.com']) {
    const config = parseMqttEnvironment({ MQTT_ENABLED: 'true', MQTT_URL: `mqtts://${host}:8883`, MQTT_USERNAME: 'test', MQTT_PASSWORD: 'test' }, true);
    expect(mqttOptions(config)).toMatchObject({ protocolVersion: 4, clean: false, rejectUnauthorized: true, clientId: 'stma-backend-local' });
  }
});
it('recusa credenciais embutidas, tópico wildcard e produção sem autenticação', () => {
  expect(() => parseMqttEnvironment({ MQTT_URL: 'mqtts://secret:password@example.com' }, false)).toThrow('MQTT_URL');
  expect(() => parseMqttEnvironment({ MQTT_TOPIC_PREFIX: '#' }, false)).toThrow('MQTT_TOPIC_PREFIX');
  expect(() => parseMqttEnvironment({ MQTT_ENABLED: 'true', MQTT_URL: 'mqtts://example.com' }, true)).toThrow('autenticação');
  expect(() => parseMqttEnvironment({ MQTT_USERNAME: 'test' }, false)).toThrow('juntos');
});
