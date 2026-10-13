import { createHash } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Database } from '../../db/mysql';
import type { MaintenanceRepository, MaintenanceResult } from './maintenance.repository';
import { HOUR } from './maintenance.service';

const summarySql = `INSERT INTO leitura_hora
  (ambiente_id,hora_ref,qtd_leituras,temp_media,temp_min,temp_max,umid_media,umid_min,umid_max)
  SELECT r.* FROM (
    SELECT ambiente_id,TIMESTAMP(DATE_FORMAT(medido_em,'%Y-%m-%d %H:00:00')) hora_ref,
      COUNT(*) qtd_leituras,ROUND(AVG(temperatura_c),1) temp_media,MIN(temperatura_c) temp_min,MAX(temperatura_c) temp_max,
      ROUND(AVG(umidade_pct),1) umid_media,MIN(umidade_pct) umid_min,MAX(umidade_pct) umid_max
    FROM leitura_telemetria WHERE medido_em>=? AND medido_em<? %ROOM%
    GROUP BY ambiente_id,hora_ref
  ) r ON DUPLICATE KEY UPDATE qtd_leituras=r.qtd_leituras,temp_media=r.temp_media,temp_min=r.temp_min,
    temp_max=r.temp_max,umid_media=r.umid_media,umid_min=r.umid_min,umid_max=r.umid_max`;

export function createMysqlMaintenanceRepository(db: Database, onOffline: (company: number) => void = () => {}): MaintenanceRepository {
  async function locked(name: string, work: (c: PoolConnection) => Promise<number>): Promise<MaintenanceResult> {
    return db.withConnection(async c => {
      const [[database]] = await c.query<RowDataPacket[]>('SELECT DATABASE() name');
      const key = `stma:${createHash('sha256').update(String(database.name)).digest('hex').slice(0,32)}:${name}`;
      const [[lock]] = await c.execute<RowDataPacket[]>('SELECT GET_LOCK(?,0) acquired', [key]);
      if (lock.acquired !== null && Number(lock.acquired) === 0) return { skipped: true, affected: 0 };
      if (Number(lock.acquired) !== 1) throw new Error('MAINTENANCE_LOCK_FAILED');
      try { return { skipped: false, affected: await work(c) }; }
      finally {
        // GET_LOCK pertence à conexão, não à transação. Nunca devolver lock ao pool.
        try { await c.execute('SELECT RELEASE_LOCK(?)', [key]); }
        catch { c.destroy(); }
      }
    });
  }
  async function transaction<T>(c: PoolConnection, work: () => Promise<T>): Promise<T> {
    await c.beginTransaction();
    try { const result = await work(); await c.commit(); return result; }
    catch (error) { await c.rollback(); throw error; }
  }
  return {
    summarize: (from, until) => locked('telemetry', c => transaction(c, async () => {
      const [overflow] = await c.execute<RowDataPacket[]>(`SELECT ambiente_id FROM leitura_telemetria
        WHERE medido_em>=? AND medido_em<? GROUP BY ambiente_id,DATE_FORMAT(medido_em,'%Y-%m-%d %H') HAVING COUNT(*)>65535 LIMIT 1`, [from, until]);
      if (overflow.length) throw new Error('SUMMARY_CAPACITY_EXCEEDED');
      const [result] = await c.execute<ResultSetHeader>(summarySql.replace('%ROOM%', ''), [from, until]);
      if (result.warningStatus) throw new Error('SUMMARY_SQL_WARNING');
      return result.affectedRows;
    })),
    markOffline: now => locked('offline', async c => {
      const [companies] = await c.execute<RowDataPacket[]>(`SELECT DISTINCT empresa_id FROM dispositivo
        WHERE ativo=1 AND status_conexao='online' AND TIMESTAMPADD(SECOND,offline_apos_seg,ultimo_contato_em)<? ORDER BY empresa_id`, [now]);
      let affected = 0;
      for (const company of companies) {
        const count = await transaction(c, async () => {
          // Mesma ordem de bloqueio dos cadastros e da ingestão: empresa primeiro.
          await c.execute('SELECT id FROM empresa WHERE id=? FOR UPDATE', [company.empresa_id]);
          const [result] = await c.execute<ResultSetHeader>(`UPDATE dispositivo SET status_conexao='offline'
            WHERE empresa_id=? AND ativo=1 AND status_conexao='online'
            AND TIMESTAMPADD(SECOND,offline_apos_seg,ultimo_contato_em)<?`, [company.empresa_id, now]);
          return result.affectedRows;
        });
        affected += count;
        if (count) { try { onOffline(Number(company.empresa_id)); } catch { /* SQL já confirmado; observador não desfaz commit. */ } }
      }
      return affected;
    }),
    purgeReadings: (before, continuing) => locked('telemetry', async c => {
      let affected = 0;
      while (continuing()) {
        const [[hour]] = await c.execute<RowDataPacket[]>(`SELECT l.ambiente_id,a.empresa_id,
          TIMESTAMP(DATE_FORMAT(l.medido_em,'%Y-%m-%d %H:00:00')) hour_start
          FROM leitura_telemetria l JOIN ambiente a ON a.id=l.ambiente_id
          WHERE l.medido_em<? ORDER BY l.medido_em,l.id LIMIT 1`, [before]);
        if (!hour) break;
        const until = new Date(+hour.hour_start + HOUR);
        affected += await transaction(c, async () => {
          await c.execute('SELECT id FROM empresa WHERE id=? FOR UPDATE', [hour.empresa_id]);
          // Bloqueia a faixa inclusive contra inserções. O resumo e TODOS os lotes
          // desta hora confirmam juntos: um crash não deixa meia hora expurgada.
          const [readings] = await c.execute<RowDataPacket[]>(`SELECT id FROM leitura_telemetria WHERE ambiente_id=? AND medido_em>=? AND medido_em<? LIMIT 65536 FOR UPDATE`, [hour.ambiente_id, hour.hour_start, until]);
          if (readings.length > 65535) throw new Error('SUMMARY_CAPACITY_EXCEEDED');
          const [result] = await c.execute<ResultSetHeader>(summarySql.replace('%ROOM%', 'AND ambiente_id=?'), [hour.hour_start, until, hour.ambiente_id]);
          if (result.warningStatus) throw new Error('SUMMARY_SQL_WARNING');
          const [[summary]] = await c.execute<RowDataPacket[]>('SELECT qtd_leituras FROM leitura_hora WHERE ambiente_id=? AND hora_ref=?', [hour.ambiente_id, hour.hour_start]);
          if (!summary) throw new Error('SUMMARY_REQUIRED');
          let removed = 0;
          while (true) {
            const [batch] = await c.execute<ResultSetHeader>(`DELETE FROM leitura_telemetria
              WHERE ambiente_id=? AND medido_em>=? AND medido_em<? ORDER BY id LIMIT 10000`, [hour.ambiente_id, hour.hour_start, until]);
            removed += batch.affectedRows;
            if (batch.affectedRows < 10000) break;
          }
          if (removed !== Number(summary.qtd_leituras)) throw new Error('SUMMARY_COUNT_MISMATCH');
          return removed;
        });
      }
      return affected;
    }),
    cleanSessions: (before, continuing) => locked('sessions', async c => {
      let affected = 0;
      while (continuing()) {
        const [batch] = await c.execute<ResultSetHeader>(`DELETE FROM sessao WHERE expira_em<? OR revogada_em<? ORDER BY id LIMIT 10000`, [before, before]);
        affected += batch.affectedRows;
        if (batch.affectedRows < 10000) break;
      }
      return affected;
    }),
  };
}
