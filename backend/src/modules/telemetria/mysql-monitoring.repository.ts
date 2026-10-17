import type { RowDataPacket } from 'mysql2/promise';
import type { Database } from '../../db/mysql';
import { HttpError } from '../../shared/http-error';
import type { MonitoringRepository } from './monitoring.repository';

export function createMysqlMonitoringRepository(db: Database): MonitoringRepository {
  return {
    panel: company => db.withConnection(async c => {
      const [rows] = await c.execute<RowDataPacket[]>(`SELECT v.*,s.nome AS setor,u.id AS unidade_id,u.nome AS unidade,
        a.temp_min_ideal,a.temp_max_ideal,a.umid_min_ideal,a.umid_max_ideal,a.temp_tolerancia,a.umid_tolerancia
        FROM vw_ambiente_estado v JOIN ambiente a ON a.id=v.ambiente_id
        JOIN setor s ON s.id=a.setor_id AND s.empresa_id=a.empresa_id
        JOIN unidade u ON u.id=s.unidade_id AND u.empresa_id=s.empresa_id
        JOIN empresa e ON e.id=u.empresa_id
        WHERE v.empresa_id=? AND s.ativo=1 AND u.ativo=1 AND e.ativo=1 ORDER BY u.id,s.id,a.id`, [company]);
      return rows;
    }),
    alerts: (company, page) => db.withConnection(async c => {
      const status = page.situacao === 'todos' ? '' : page.situacao === 'aberto' ? ' AND al.encerrado_em IS NULL' : ' AND al.encerrado_em IS NOT NULL';
      const from = `FROM alerta al JOIN ambiente a ON a.id=al.ambiente_id WHERE a.empresa_id=?${status}${page.ambiente_id ? ' AND al.ambiente_id=?' : ''}`;
      const params = page.ambiente_id ? [company, page.ambiente_id] : [company];
      const [[count]] = await c.execute<RowDataPacket[]>(`SELECT COUNT(*) total ${from}`, params);
      const [rows] = await c.query<RowDataPacket[]>(`SELECT al.*,a.nome AS ambiente ${from} ORDER BY al.ocorrido_em DESC,al.id DESC LIMIT ? OFFSET ?`, [...params, page.tamanho, (page.pagina - 1) * page.tamanho]);
      return { dados: rows, total: Number(count.total) };
    }),
    acknowledge: (id, company, context) => db.withConnection(async c => {
      await c.beginTransaction();
      try {
        // Mesma ordem de travas das mutações de cadastro e ingestão.
        const [[tenant]] = await c.execute<RowDataPacket[]>('SELECT ativo FROM empresa WHERE id=? FOR UPDATE', [company]);
        const [[actor]] = await c.execute<RowDataPacket[]>('SELECT perfil,ativo,empresa_id FROM usuario WHERE id=? FOR SHARE', [context.actor.id]);
        if (!tenant?.ativo || !actor?.ativo || actor.empresa_id !== company || !['administrador', 'operador'].includes(actor.perfil)) throw new HttpError(403, 'ACESSO_NEGADO', 'Permissão não está mais ativa.');
        const [[before]] = await c.execute<RowDataPacket[]>('SELECT al.* FROM alerta al JOIN ambiente a ON a.id=al.ambiente_id WHERE al.id=? AND a.empresa_id=? FOR UPDATE', [id, company]);
        if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Alerta não encontrado.');
        if (before.reconhecido_em) { await c.commit(); return before; }
        await c.execute('UPDATE alerta SET reconhecido_por=?,reconhecido_em=UTC_TIMESTAMP(3) WHERE id=?', [context.actor.id, id]);
        const [[after]] = await c.execute<RowDataPacket[]>('SELECT * FROM alerta WHERE id=?', [id]);
        await c.execute('INSERT INTO auditoria (empresa_id,usuario_id,acao,entidade,entidade_id,antes,depois,ip) VALUES (?,?,?,?,?,?,?,?)', [company, context.actor.id, 'reconhecer', 'alerta', id, JSON.stringify(before), JSON.stringify(after), context.ip]);
        await c.commit(); return after;
      } catch (error) { await c.rollback(); throw error; }
    }),
  };
}
