import type { RowDataPacket } from 'mysql2/promise';
import type { Database } from '../../db/mysql';
import type { DemoRepository, DemoRoom } from './demo.repository';

export function createMysqlDemoRepository(readonlyDatabase: Database): DemoRepository {
  return {
    panel: () => readonlyDatabase.withConnection(async c => {
      const [rows] = await c.execute<(DemoRoom & RowDataPacket)[]>(`SELECT e.nome empresa,u.nome unidade,s.nome setor,
        v.ambiente,v.estado,v.status_conexao,v.ultima_leitura_em,v.temperatura_c,v.umidade_pct
        FROM vw_ambiente_estado v JOIN ambiente a ON a.id=v.ambiente_id
        JOIN setor s ON s.id=a.setor_id AND s.empresa_id=a.empresa_id
        JOIN unidade u ON u.id=s.unidade_id AND u.empresa_id=s.empresa_id
        JOIN empresa e ON e.id=u.empresa_id
        WHERE e.eh_demo=1 AND e.ativo=1 AND u.ativo=1 AND s.ativo=1
        ORDER BY e.id,u.id,s.id,a.id,v.dispositivo_id LIMIT 100`);
      return rows;
    }),
  };
}
