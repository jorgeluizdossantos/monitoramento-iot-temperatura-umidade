import { z } from 'zod';
import type { Logger } from 'pino';
import type { MqttEnvironment } from '../../config/mqtt';
import type { IncomingMessage } from './mqtt-consumer';
import type { TelemetryMessage, TelemetryRepository } from './telemetry.repository';

const deviceIdSchema = z.string().regex(/^[a-z0-9_-]{3,64}$/);
const identity = { id: deviceIdSchema.optional(), dispositivo: deviceIdSchema.optional() };
const dataSchema = z.object({ ...identity, temperatura: z.number().finite().min(-50).max(100), umidade: z.number().finite().min(0).max(100), timestamp: z.string().max(40).optional() }).strict();
const statusSchema = z.object({ ...identity, status: z.enum(['online', 'offline']) }).strict();
const doorSchema = z.object({ ...identity, aberta: z.boolean() }).strict();
const controlSchema = z.object({ id: deviceIdSchema, led: z.boolean(), limite: z.number().finite().min(0).max(50).nullable(), comando_id: z.string().uuid().nullable() }).strict();
export class InvalidMessage extends Error {}
function identityMatches(data: { id?: string; dispositivo?: string }, deviceId: string, required: boolean) {
  if ((required && !data.id && !data.dispositivo) || (data.id && data.id !== deviceId) || (data.dispositivo && data.dispositivo !== deviceId)) throw new InvalidMessage('device_id divergente');
}
export function normalizeMessage(incoming: IncomingMessage, config: MqttEnvironment): TelemetryMessage {
  const segments = incoming.topic.split('/');
  if (segments.length !== 3 || segments[0] !== config.MQTT_TOPIC_PREFIX || !deviceIdSchema.safeParse(segments[1]).success) throw new InvalidMessage('tópico inválido');
  if (!incoming.payload.length || incoming.payload.length > 32768) throw new InvalidMessage('tamanho inválido');
  const deviceId = segments[1]; const kind = segments[2]; const text = incoming.payload.toString('utf8').trim();
  if (config.MQTT_DEVICE_IDS.length && !config.MQTT_DEVICE_IDS.includes(deviceId)) throw new InvalidMessage('dispositivo fora da lista configurada');
  const base = { deviceId, receivedAt: incoming.receivedAt, retained: incoming.retained };
  const json = () => { try { return JSON.parse(text) as unknown; } catch { throw new InvalidMessage('JSON inválido'); } };
  if (kind === 'controle') {
    if (incoming.retained) throw new InvalidMessage('controle retido');
    const parsed = controlSchema.safeParse(json());
    if (!parsed.success) throw new InvalidMessage('controle inválido');
    identityMatches(parsed.data, deviceId, true);
    return { ...base, kind, led: parsed.data.led, limit: parsed.data.limite, commandId: parsed.data.comando_id };
  }
  if (kind === 'dados') {
    if (incoming.retained) throw new InvalidMessage('telemetria retida');
    const parsed = dataSchema.safeParse(json());
    if (!parsed.success) throw new InvalidMessage('campos inválidos');
    const data = parsed.data; identityMatches(data, deviceId, true);
    const validTimestamp = data.timestamp && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(data.timestamp) && z.string().datetime({ offset: true }).safeParse(data.timestamp).success;
    const timestamp = validTimestamp ? Date.parse(data.timestamp!) : NaN;
    const age = incoming.receivedAt.getTime() - timestamp;
    const plausible = Number.isFinite(timestamp) && age <= config.MQTT_MAX_AGE_HOURS * 3600000 && age >= -config.MQTT_FUTURE_TOLERANCE_SECONDS * 1000;
    return { ...base, kind, measuredAt: plausible ? new Date(timestamp) : incoming.receivedAt, timestampSource: plausible ? 'device' : 'receipt', temperature: Math.round(data.temperatura * 10) / 10, humidity: Math.round(data.umidade * 10) / 10 };
  }
  if (kind === 'status') {
    if (text === 'online' || text === 'offline') return { ...base, kind, status: text };
    const parsed = statusSchema.safeParse(json()); if (!parsed.success) throw new InvalidMessage('status inválido');
    identityMatches(parsed.data, deviceId, false);
    return { ...base, kind, status: parsed.data.status };
  }
  if (kind === 'porta') {
    if (incoming.retained) throw new InvalidMessage('porta retida');
    const states: Record<string, boolean> = { aberta: true, aberto: true, 'porta aberta': true, open: true, '1': true, fechada: false, fechado: false, 'porta fechada': false, closed: false, '0': false };
    const key = text.toLowerCase();
    if (Object.hasOwn(states, key)) return { ...base, kind, open: states[key], measuredAt: incoming.receivedAt };
    const parsed = doorSchema.safeParse(json()); if (!parsed.success) throw new InvalidMessage('porta inválida');
    identityMatches(parsed.data, deviceId, false);
    return { ...base, kind, open: parsed.data.aberta, measuredAt: incoming.receivedAt };
  }
  throw new InvalidMessage('tópico não suportado');
}
export function createTelemetryService(repository: TelemetryRepository, config: MqttEnvironment, logger: Logger) {
  return async (incoming: IncomingMessage) => {
    let message: TelemetryMessage;
    try { message = normalizeMessage(incoming, config); }
    catch (error) {
      if (!(error instanceof InvalidMessage)) throw error;
      logger.warn({ event: 'mqtt_message_rejected', reason: error.message }, 'Mensagem MQTT descartada');
      return 'rejected' as const;
    }
    const result = await repository.ingest(message);
    if (result === 'conflict') logger.warn({ event: 'mqtt_timestamp_conflict', deviceId: message.deviceId }, 'Valores divergentes para a mesma medição');
    else logger.debug({ event: 'mqtt_ingested', result, deviceId: message.deviceId, kind: message.kind }, 'Mensagem MQTT processada');
    return result;
  };
}
