import type { ControlDevice, ControlRepository } from './control.service';
import type { Database } from '../../db/mysql';
import type { RowDataPacket } from 'mysql2/promise';
import { HttpError } from '../../shared/http-error';
export function createMysqlControlRepository(db: Database): ControlRepository {
  async function device(id: number, company: number) {
    const [[row]] = await db.withConnection(c => c.execute<(RowDataPacket & ControlDevice)[]>(`SELECT d.id,d.device_id,d.led_aceso,d.limite_led,d.controle_recebido_em,d.controle_comando_id,d.status_conexao,d.em_manutencao,
      (d.ativo AND a.ativo AND s.ativo AND u.ativo AND e.ativo) ativo FROM dispositivo d
      JOIN ambiente a ON a.id=d.ambiente_id AND a.empresa_id=d.empresa_id
      JOIN setor s ON s.id=a.setor_id JOIN unidade u ON u.id=s.unidade_id JOIN empresa e ON e.id=d.empresa_id
      WHERE d.id=? AND d.empresa_id=?`, [id, company]));
    if (!row) throw new HttpError(404, 'NAO_ENCONTRADO', 'Dispositivo não encontrado.');
    return row;
  }
  return { device, async audit(company: number, actor: number, id: number, data: unknown, ip: string | null) { await db.withConnection(c => c.execute('INSERT INTO auditoria(empresa_id,usuario_id,acao,entidade,entidade_id,depois,ip) VALUES (?,?,?,?,?,?,?)', [company, actor, 'solicitar_comando', 'dispositivo', id, JSON.stringify(data), ip])); } };
}
