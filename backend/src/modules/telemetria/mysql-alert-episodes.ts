import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { advanceEpisode, classifyReading, type Severity } from './alert-policy';

export interface EpisodeInput {
  device: number; room: number; reading: string; measuredAt: Date;
  temperature: number; humidity: number;
  tempMin: number | null; tempMax: number | null; tempTolerance: number | null;
  humidityMin: number | null; humidityMax: number | null; humidityTolerance: number | null;
}
/** Usa a conexão/transação da ingestão, que já detém a trava do dispositivo. */
export async function persistAlertEpisodes(c: PoolConnection, input: EpisodeInput) {
  for (const [type, value, min, max, tolerance] of [
    ['temperatura', input.temperature, input.tempMin, input.tempMax, input.tempTolerance],
    ['umidade', input.humidity, input.humidityMin, input.humidityMax, input.humidityTolerance],
  ] as const) {
    const violation = classifyReading(value, { min, max, tolerance });
    const [open] = await c.execute<RowDataPacket[]>('SELECT * FROM alerta WHERE dispositivo_id=? AND tipo=? AND encerrado_em IS NULL ORDER BY id FOR UPDATE', [input.device, type]);
    let retained = false;
    for (const episode of open) {
      // Mudança direta de lado ou de ambiente termina o episódio anterior.
      if (!retained && violation && episode.ambiente_id === input.room && episode.sentido === violation.direction) {
        const next = advanceEpisode({ severity: episode.severidade as Severity, extreme: Number(episode.valor_extremo) }, violation);
        await c.execute('UPDATE alerta SET severidade=?,valor_extremo=? WHERE id=?', [next.severity, next.extreme, episode.id]);
        retained = true;
      } else {
        await c.execute('UPDATE alerta SET encerrado_em=? WHERE id=?', [input.measuredAt, episode.id]);
      }
    }
    if (violation && !retained) {
      await c.execute(`INSERT INTO alerta (ambiente_id,dispositivo_id,leitura_id,tipo,sentido,severidade,valor,valor_extremo,limite_violado,ocorrido_em)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [input.room, input.device, input.reading, type, violation.direction, violation.severity, value, value, violation.limit, input.measuredAt]);
    }
  }
}
