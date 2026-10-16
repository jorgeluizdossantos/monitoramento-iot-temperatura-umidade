import type { RowDataPacket } from 'mysql2/promise';
import type { Database } from '../../db/mysql';
import { HttpError } from '../../shared/http-error';
import { createMysqlCadastroTransaction } from '../cadastros/mysql-cadastro.repository';
import type { PendingRepository } from './pending.service';

export function createMysqlPendingRepository(db: Database): PendingRepository {
  return {
    destinations: (companyId, page) => db.withConnection(async c => {
      // Consulta restrita ao comissionamento: não retorna leituras nem usuários.
      const from = `FROM ambiente a JOIN setor s ON s.id=a.setor_id AND s.empresa_id=a.empresa_id
        JOIN unidade u ON u.id=s.unidade_id AND u.empresa_id=s.empresa_id JOIN empresa e ON e.id=a.empresa_id
        WHERE e.id=? AND e.ativo=1 AND u.ativo=1 AND s.ativo=1 AND a.ativo=1`;
      const [[count]] = await c.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total ${from}`, [companyId]);
      const [rows] = await c.query<RowDataPacket[]>(`SELECT a.id,a.nome,s.nome AS setor_nome,u.nome AS unidade_nome,e.nome AS empresa_nome ${from} ORDER BY a.id LIMIT ? OFFSET ?`, [companyId, page.tamanho, (page.pagina - 1) * page.tamanho]);
      return { dados: rows, total: Number(count.total), pagina: page.pagina, tamanho: page.tamanho };
    }),
    list: page => db.withConnection(async c => {
      const [[count]] = await c.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM dispositivo_pendente WHERE situacao=?', [page.situacao]);
      const [rows] = await c.query<RowDataPacket[]>('SELECT id,device_id,primeiro_contato_em,ultimo_contato_em,qtd_mensagens,ultimo_payload,situacao FROM dispositivo_pendente WHERE situacao=? ORDER BY id LIMIT ? OFFSET ?', [page.situacao, page.tamanho, (page.pagina - 1) * page.tamanho]);
      return { dados: rows, total: Number(count.total), pagina: page.pagina, tamanho: page.tamanho };
    }),
    adopt: (id, data, context) => db.withConnection(async c => {
      await c.beginTransaction();
      try {
        const [[scope]] = await c.execute<RowDataPacket[]>('SELECT empresa_id FROM ambiente WHERE id=?', [data.ambiente_id]);
        if (!scope) throw new HttpError(404, 'NAO_ENCONTRADO', 'Ambiente não encontrado.');
        const tx = createMysqlCadastroTransaction(c);
        await tx.lockCompany(scope.empresa_id, true);
        const [[actor]] = await c.execute<RowDataPacket[]>("SELECT id FROM usuario WHERE id=? AND perfil='superadmin' AND empresa_id IS NULL AND ativo=1 FOR SHARE", [context.actor.id]);
        if (!actor) throw new HttpError(403, 'ACESSO_NEGADO', 'Superadmin inativo.');
        const [[room]] = await c.execute<RowDataPacket[]>(`SELECT a.id FROM ambiente a JOIN setor s ON s.id=a.setor_id AND s.empresa_id=a.empresa_id JOIN unidade u ON u.id=s.unidade_id AND u.empresa_id=s.empresa_id
          WHERE a.id=? AND a.empresa_id=? AND a.ativo=1 AND s.ativo=1 AND u.ativo=1 FOR UPDATE`, [data.ambiente_id, scope.empresa_id]);
        if (!room) throw new HttpError(409, 'VINCULO_INATIVO', 'O ambiente exige uma hierarquia ativa.');
        const [[pending]] = await c.execute<RowDataPacket[]>('SELECT id,device_id,situacao FROM dispositivo_pendente WHERE id=? FOR UPDATE', [id]);
        if (!pending) throw new HttpError(404, 'NAO_ENCONTRADO', 'Pendência não encontrada.');
        if (pending.situacao !== 'pendente') throw new HttpError(409, 'PENDENCIA_RESOLVIDA', 'Pendência já resolvida.');
        const deviceId = await tx.insert('dispositivo', { ...data, empresa_id: scope.empresa_id, device_id: pending.device_id });
        const device = (await tx.find('dispositivo', deviceId, scope.empresa_id))!;
        await c.execute("UPDATE dispositivo_pendente SET situacao='adotado' WHERE id=?", [id]);
        await tx.audit({ empresaId: scope.empresa_id, usuarioId: context.actor.id, acao: 'criar', entidade: 'dispositivo', entidadeId: deviceId, antes: null, depois: device, ip: context.ip });
        await tx.audit({ empresaId: scope.empresa_id, usuarioId: context.actor.id, acao: 'adotar', entidade: 'dispositivo_pendente', entidadeId: id, antes: pending, depois: { ...pending, situacao: 'adotado', dispositivo_id: deviceId, ambiente_id: data.ambiente_id }, ip: context.ip });
        await c.commit();
        return device;
      } catch (error) {
        await c.rollback();
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (code === 'ER_DUP_ENTRY') throw new HttpError(409, 'DUPLICIDADE', 'Dispositivo já cadastrado; pendência não alterada.');
        if (code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT') throw new HttpError(409, 'CONCORRENCIA', 'Tente novamente após a operação concorrente.');
        throw error;
      }
    }),
  };
}
