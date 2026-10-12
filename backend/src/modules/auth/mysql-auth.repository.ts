import type { RowDataPacket } from 'mysql2/promise';
import type { Database } from '../../db/mysql';
import type { AuthRepository, AuthUser, Principal } from './auth.repository';

const columns = 'u.id,u.empresa_id,u.nome,u.email,u.perfil';
const active = 'u.ativo=1 AND (u.empresa_id IS NULL OR e.ativo=1)';
export function createMysqlAuthRepository(db: Database): AuthRepository {
  return {
    findUser: email => db.withConnection(async c => {
      const [rows] = await c.execute<(RowDataPacket & AuthUser)[]>(`SELECT ${columns},u.senha_hash FROM usuario u LEFT JOIN empresa e ON e.id=u.empresa_id WHERE u.email=? AND ${active}`, [email]);
      return rows[0] ?? null;
    }),
    createSession: session => db.withConnection(async c => {
      await c.beginTransaction();
      try {
        // Revalida o usuário antes de persistir a sessão e mantém login/rotação atômicos.
        const [rows] = await c.execute<RowDataPacket[]>(`SELECT u.id FROM usuario u LEFT JOIN empresa e ON e.id=u.empresa_id WHERE u.id=? AND ${active} FOR UPDATE`, [session.usuarioId]);
        if (!rows.length) { await c.rollback(); return false; }
        await c.execute('INSERT INTO sessao (usuario_id,token_hash,expira_em,ip,user_agent) VALUES (?,?,?,?,?)', [session.usuarioId, session.tokenHash, session.expiresAt, session.ip, session.userAgent]);
        await c.execute('UPDATE usuario SET ultimo_login_em=UTC_TIMESTAMP(3) WHERE id=?', [session.usuarioId]);
        if (session.previousHash) await c.execute('UPDATE sessao SET revogada_em=COALESCE(revogada_em,UTC_TIMESTAMP(3)) WHERE token_hash=?', [session.previousHash]);
        await c.commit();
        return true;
      } catch (error) { await c.rollback(); throw error; }
    }),
    findSession: tokenHash => db.withConnection(async c => {
      const [rows] = await c.execute<(RowDataPacket & Principal)[]>(`SELECT ${columns} FROM sessao s JOIN usuario u ON u.id=s.usuario_id LEFT JOIN empresa e ON e.id=u.empresa_id WHERE s.token_hash=? AND s.revogada_em IS NULL AND s.expira_em>UTC_TIMESTAMP(3) AND ${active}`, [tokenHash]);
      return rows[0] ?? null;
    }),
    revokeSession: tokenHash => db.withConnection(async c => {
      await c.execute('UPDATE sessao SET revogada_em=COALESCE(revogada_em,UTC_TIMESTAMP(3)) WHERE token_hash=?', [tokenHash]);
    }),
  };
}
