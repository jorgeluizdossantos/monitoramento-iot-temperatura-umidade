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
        const [rows] = await c.query<(Reading & RowDataPacket)[]>(`SELECT ${columns} ${from} ORDER BY l.medido_em DESC,l.id DESC LIMIT ? OFFSET ?`, [...args, page.tamanho, (page.pagina - 1) * page.tamanho]);
        await c.commit(); return { dados: rows, total: Number(count.total) };
      } catch (error) { await c.rollback(); throw error; }
    }),
    series: (room, company, period) => db.withConnection(async c => {
      const [rows] = await c.execute<(HourPoint & RowDataPacket)[]>(`SELECT DATE_FORMAT(l.medido_em,'%Y-%m-%dT%H:00:00.000Z') hora_ref,
        COUNT(*) qtd_leituras,ROUND(AVG(l.temperatura_c),1) temp_media,MIN(l.temperatura_c) temp_min,MAX(l.temperatura_c) temp_max,
        ROUND(AVG(l.umidade_pct),1) umid_media,MIN(l.umidade_pct) umid_min,MAX(l.umidade_pct) umid_max
        ${from} GROUP BY hora_ref ORDER BY hora_ref`, [room, company, period.de, period.ate]);
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
