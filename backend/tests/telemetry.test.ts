import { expect, it, vi } from 'vitest';
import { parseMqttEnvironment } from '../src/config/mqtt';
import { normalizeMessage, createTelemetryService } from '../src/modules/telemetria/telemetry.service';
import { createLogger } from '../src/shared/logger';
const config = parseMqttEnvironment({}, false);
const time = new Date('2026-10-12T10:00:00.000Z');
const message = (payload: unknown, suffix = 'dados', retained = false) => ({ topic: `engeasier/esp32-001/${suffix}`, payload: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)), receivedAt: time, retained });
const data = { id: 'esp32-001', temperatura: 23.46, umidade: 50.12, timestamp: time.toISOString() };
it('normaliza identidade, valores e horário sem tipos do driver', () => {
  expect(normalizeMessage(message(data), config)).toMatchObject({ kind: 'dados', deviceId: data.id, temperature: 23.5, humidity: 50.1, measuredAt: time, timestampSource: 'device' });
  expect(normalizeMessage(message({ dispositivo: data.id, temperatura: 20, umidade: 40 }), config)).toMatchObject({ timestampSource: 'receipt', measuredAt: time });
});
it.each([undefined, '', '1970-01-01T00:00:00Z', 'invalid', '2026-10-12T11:00:00Z'])('hora ausente/implausível %s usa recebimento', timestamp => {
  expect(normalizeMessage(message({ ...data, timestamp }), config)).toMatchObject({ timestampSource: 'receipt', measuredAt: time });
});
it('aceita offset explícito e rejeita identidades conflitantes, campos extras e valores impossíveis', () => {
  expect(normalizeMessage(message({ ...data, timestamp: '2026-10-12T07:00:00-03:00' }), config)).toMatchObject({ measuredAt: time, timestampSource: 'device' });
  for (const payload of [{ ...data, id: 'other-id' }, { ...data, dispositivo: 'other-id' }, { ...data, temperatura: -51 }, { ...data, umidade: 101 }, { ...data, temperatura: '20' }, { ...data, empresa_id: 2 }, { temperatura: 20, umidade: 40 }]) expect(() => normalizeMessage(message(payload), config)).toThrow();
});
it('não aceita JSON quebrado, tamanho excessivo, tópico extra ou telemetria retida', () => {
  expect(() => normalizeMessage(message('{'), config)).toThrow();
  expect(() => normalizeMessage(message('a'.repeat(32769)), config)).toThrow();
  expect(() => normalizeMessage({ ...message(data), topic: 'engeasier/esp32-001/dados/extra' }, config)).toThrow();
  expect(() => normalizeMessage(message(data, 'temperatura'), config)).toThrow();
  expect(() => normalizeMessage(message(data, 'dados', true), config)).toThrow();
});
it('status e porta aceitam os formatos documentados sem confiar em campo de empresa', () => {
  expect(normalizeMessage(message('offline', 'status', true), config)).toMatchObject({ kind: 'status', status: 'offline', retained: true });
  expect(normalizeMessage(message({ status: 'online', dispositivo: data.id }, 'status'), config)).toMatchObject({ status: 'online' });
  expect(normalizeMessage(message('ABERTA', 'porta'), config)).toMatchObject({ open: true });
  expect(normalizeMessage(message('Porta Aberta', 'porta'), config)).toMatchObject({ open: true });
  expect(normalizeMessage(message('Porta Fechada', 'porta'), config)).toMatchObject({ open: false });
  expect(normalizeMessage(message({ aberta: false }, 'porta'), config)).toMatchObject({ open: false });
  expect(() => normalizeMessage(message('maybe', 'status'), config)).toThrow();
  expect(() => normalizeMessage(message('ABERTA', 'porta', true), config)).toThrow();
});
it('mensagem inválida é descartada; falha de banco é propagada para impedir ACK', async () => {
  const ingest = vi.fn(async () => { throw new Error('database-failed'); });
  const consume = createTelemetryService({ ingest }, config, createLogger('silent'));
  expect(await consume(message('{'))).toBe('rejected'); expect(ingest).not.toHaveBeenCalled();
  await expect(consume(message(data))).rejects.toThrow('database-failed');
});
