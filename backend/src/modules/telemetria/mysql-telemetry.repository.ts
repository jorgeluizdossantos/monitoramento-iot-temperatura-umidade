import type { RowDataPacket } from 'mysql2/promise';
import type { Database } from '../../db/mysql';
import { persistAlertEpisodes } from './mysql-alert-episodes';
import type { IngestionResult, TelemetryRepository } from './telemetry.repository';

export function createMysqlTelemetryRepository(db: Database, onCommitted?: (company: number) => void): TelemetryRepository {
  return {
    ingest: message => db.withConnection(async c => {
      await c.beginTransaction();
      try {
        // Primeiro descobre o escopo; depois usa leituras com trava para obter o estado atual.
        const [[scope]] = await c.execute<RowDataPacket[]>('SELECT empresa_id FROM dispositivo WHERE device_id=?', [message.deviceId]);
        if (scope) await c.execute('SELECT id FROM empresa WHERE id=? FOR UPDATE', [scope.empresa_id]);
        const [[device]] = await c.execute<RowDataPacket[]>(`SELECT d.id,d.empresa_id,d.ambiente_id,d.ultima_leitura_em,a.temp_min_ideal,a.temp_max_ideal,a.temp_tolerancia,a.umid_min_ideal,a.umid_max_ideal,a.umid_tolerancia,
          (d.ativo AND a.ativo AND s.ativo AND u.ativo AND e.ativo) AS enabled
          FROM dispositivo d JOIN ambiente a ON a.id=d.ambiente_id AND a.empresa_id=d.empresa_id
          JOIN setor s ON s.id=a.setor_id AND s.empresa_id=a.empresa_id
          JOIN unidade u ON u.id=s.unidade_id AND u.empresa_id=s.empresa_id
          JOIN empresa e ON e.id=d.empresa_id WHERE d.device_id=? FOR UPDATE`, [message.deviceId]);
        let result: IngestionResult;
        if (!device) {
          // Só persiste a mensagem já normalizada, nunca JSON arbitrário do publicador.
          const normalized = JSON.stringify(message);
          await c.execute(`INSERT INTO dispositivo_pendente (device_id,primeiro_contato_em,ultimo_contato_em,ultimo_payload)
            VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE qtd_mensagens=LEAST(qtd_mensagens+1,4294967295),
            ultimo_contato_em=GREATEST(ultimo_contato_em,VALUES(ultimo_contato_em)),ultimo_payload=VALUES(ultimo_payload)`,
          [message.deviceId, message.receivedAt, message.receivedAt, normalized]);
          result = 'pending';
        } else if (Number(device.enabled) !== 1) result = 'inactive';
        else if (message.kind === 'dados') {
          const [[existing]] = await c.execute<RowDataPacket[]>('SELECT temperatura_c,umidade_pct FROM leitura_telemetria WHERE dispositivo_id=? AND medido_em=? FOR UPDATE', [device.id, message.measuredAt]);
          if (existing) result = Number(existing.temperatura_c) === message.temperature && Number(existing.umidade_pct) === message.humidity ? 'duplicate' : 'conflict';
          else {
            await c.execute('INSERT INTO leitura_telemetria (dispositivo_id,ambiente_id,temperatura_c,umidade_pct,medido_em,recebido_em) VALUES (?,?,?,?,?,?)', [device.id, device.ambiente_id, message.temperature, message.humidity, message.measuredAt, message.receivedAt]);
            // Histórico atrasado é preservado; o estado atual nunca retrocede.
            if (!device.ultima_leitura_em || message.measuredAt > device.ultima_leitura_em) {
              const [[inserted]] = await c.execute<RowDataPacket[]>('SELECT id FROM leitura_telemetria WHERE dispositivo_id=? AND medido_em=?', [device.id, message.measuredAt]);
              const decimal = (value: unknown) => value === null ? null : Number(value);
              await persistAlertEpisodes(c, {
                device: device.id, room: device.ambiente_id, reading: String(inserted.id), measuredAt: message.measuredAt,
                temperature: message.temperature, humidity: message.humidity,
                tempMin: decimal(device.temp_min_ideal), tempMax: decimal(device.temp_max_ideal), tempTolerance: decimal(device.temp_tolerancia),
                humidityMin: decimal(device.umid_min_ideal), humidityMax: decimal(device.umid_max_ideal), humidityTolerance: decimal(device.umid_tolerancia),
              });
              await c.execute(`UPDATE dispositivo SET ultima_leitura_em=?,ultima_temperatura_c=?,ultima_umidade_pct=?,
                ultimo_contato_em=GREATEST(COALESCE(ultimo_contato_em,?),?),status_conexao='online' WHERE id=?`,
              [message.measuredAt, message.temperature, message.humidity, message.receivedAt, message.receivedAt, device.id]);
            }
            result = 'stored';
          }
        } else if (message.kind === 'porta') {
          const [[last]] = await c.execute<RowDataPacket[]>('SELECT aberta,ocorrido_em FROM evento_porta WHERE dispositivo_id=? ORDER BY ocorrido_em DESC,id DESC LIMIT 1 FOR UPDATE', [device.id]);
          if (last && message.measuredAt <= last.ocorrido_em) result = 'stale';
          else if (last && !!last.aberta === message.open) result = 'unchanged';
          else {
            await c.execute('INSERT INTO evento_porta (dispositivo_id,ambiente_id,aberta,ocorrido_em,recebido_em) VALUES (?,?,?,?,?)', [device.id, device.ambiente_id, message.open, message.measuredAt, message.receivedAt]);
            result = 'stored';
          }
        } else if (message.kind === 'controle') {
          await c.execute('UPDATE dispositivo SET led_aceso=?,limite_led=?,controle_recebido_em=?,controle_comando_id=? WHERE id=?', [message.led, message.limit, message.receivedAt, message.commandId, device.id]);
          result = 'stored';
        } else {
          if (message.status === 'online' && !message.retained) {
            await c.execute("UPDATE dispositivo SET status_conexao='online',ultimo_contato_em=GREATEST(COALESCE(ultimo_contato_em,?),?) WHERE id=?", [message.receivedAt, message.receivedAt, device.id]);
          } else if (message.status === 'offline') await c.execute("UPDATE dispositivo SET status_conexao='offline' WHERE id=?", [device.id]);
          result = message.retained && message.status === 'online' ? 'unchanged' : 'stored';
        }
        await c.commit();
        return { result, company: device?.empresa_id as number | undefined };
      } catch (error) { await c.rollback(); throw error; }
    }).then(({ result, company }) => {
      // Notificação é posterior ao commit e não pode transformar sucesso SQL em reentrega MQTT.
      if (result === 'stored' && company !== undefined) { try { onCommitted?.(company); } catch { /* SSE é sinal efêmero; reconectar exige consultar o painel. */ } }
      return result;
    }),
  };
}
