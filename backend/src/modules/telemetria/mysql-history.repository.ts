import type { RowDataPacket } from 'mysql2/promise';
import type { Database } from '../../db/mysql';
import { HttpError } from '../../shared/http-error';
import type { HistoryRepository, Reading, HourPoint } from './history.repository';

const from = 'FROM leitura_telemetria l JOIN ambiente a ON a.id=l.ambiente_id WHERE l.ambiente_id=? AND a.empresa_id=? AND l.medido_em>=? AND l.medido_em<?';
const columns = 'l.id,l.dispositivo_id,l.medido_em,l.recebido_em,l.temperatura_c,l.umidade_pct';
export function createMysqlHistoryRepository(db: Database): HistoryRepository {
  return {
    assertRoom: (room, company) => db.withConnection(async c => {
      const [rows] = await c.execute<RowDataPacket[]>('SELECT id FROM ambiente WHERE id=? AND empresa_id=?', [room, company]);
      if (!rows.length) throw new HttpError(404, 'NAO_ENCONTRADO', 'Ambiente não encontrado.');
    }),
    history: (room, company, page) => db.withConnection(async c => {
      await c.beginTransaction();
      try {
        const args = [room, company, page.de, page.ate];
        const [[count]] = await c.execute<RowDataPacket[]>(`SELECT COUNT(*) total ${from}`, args);
        // O deslocamento percorre o índice; só a página final carrega o registro completo.
        const [rows] = await c.query<(Reading & RowDataPacket)[]>(`SELECT ${columns} FROM leitura_telemetria l
          JOIN (SELECT l.id ${from} ORDER BY l.medido_em DESC,l.id DESC LIMIT ? OFFSET ?) page ON page.id=l.id
          ORDER BY l.medido_em DESC,l.id DESC`, [...args, page.tamanho, (page.pagina - 1) * page.tamanho]);
        await c.commit(); return { dados: rows, total: Number(count.total) };
      } catch (error) { await c.rollback(); throw error; }
    }),
    series: (room, company, period) => db.withConnection(async c => {
      const [rows] = await c.execute<(HourPoint & RowDataPacket)[]>(`SELECT DATE_FORMAT(l.medido_em,'%Y-%m-%dT%H:00:00.000Z') hora_ref,
        COUNT(*) qtd_leituras,ROUND(AVG(l.temperatura_c),1) temp_media,MIN(l.temperatura_c) temp_min,MAX(l.temperatura_c) temp_max,
        ROUND(AVG(l.umidade_pct),1) umid_media,MIN(l.umidade_pct) umid_min,MAX(l.umidade_pct) umid_max
        ${from} GROUP BY hora_ref
        UNION ALL
        SELECT DATE_FORMAT(h.hora_ref,'%Y-%m-%dT%H:00:00.000Z') hora_ref,
          h.qtd_leituras,h.temp_media,h.temp_min,h.temp_max,h.umid_media,h.umid_min,h.umid_max
        FROM leitura_hora h JOIN ambiente a ON a.id=h.ambiente_id
        WHERE h.ambiente_id=? AND a.empresa_id=? AND h.hora_ref>=? AND TIMESTAMPADD(HOUR,1,h.hora_ref)<=?
          AND NOT EXISTS (SELECT 1 FROM leitura_telemetria raw WHERE raw.ambiente_id=h.ambiente_id
            AND raw.medido_em>=h.hora_ref AND raw.medido_em<TIMESTAMPADD(HOUR,1,h.hora_ref))
        ORDER BY hora_ref`, [room, company, period.de, period.ate, room, company, period.de, period.ate]);
      return rows.map(row => ({ ...row, qtd_leituras: Number(row.qtd_leituras) }));
    }),
    async *exportRows(room, company, period) {
      const args = [room, company, period.de, period.ate];
      const maximum = await db.withConnection(async c => {
        const [[row]] = await c.execute<RowDataPacket[]>(`SELECT MAX(l.id) maximum ${from}`, args);
        return row.maximum as string | null;
      });
      if (!maximum) return;
      let cursor: Reading | undefined;
      while (true) {
        const previous: Reading | undefined = cursor;
        const rows: Reading[] = await db.withConnection(async c => {
          const [batch] = await c.execute<(Reading & RowDataPacket)[]>(`SELECT ${columns} ${from} AND l.id<=?
            ${previous ? 'AND (l.medido_em>? OR (l.medido_em=? AND l.id>?))' : ''}
            ORDER BY l.medido_em,l.id LIMIT 500`, [...args, maximum, ...(previous ? [previous.medido_em, previous.medido_em, previous.id] : [])]);
          return batch;
        });
        if (!rows.length) return;
        yield rows;
        cursor = rows.at(-1)!;
      }
    },
  };
}
