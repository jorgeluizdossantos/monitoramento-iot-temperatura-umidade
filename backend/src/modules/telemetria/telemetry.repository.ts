interface BaseMessage { deviceId: string; receivedAt: Date; retained: boolean }
export type TelemetryMessage =
  | (BaseMessage & { kind: 'controle'; led: boolean; limit: number | null; commandId: string | null })
  | (BaseMessage & { kind: 'dados'; measuredAt: Date; temperature: number; humidity: number; timestampSource: 'device' | 'receipt' })
  | (BaseMessage & { kind: 'porta'; measuredAt: Date; open: boolean })
  | (BaseMessage & { kind: 'status'; status: 'online' | 'offline' });
export type IngestionResult = 'stored' | 'duplicate' | 'conflict' | 'pending' | 'inactive' | 'unchanged' | 'stale';
export interface TelemetryRepository { ingest(message: TelemetryMessage): Promise<IngestionResult> }
