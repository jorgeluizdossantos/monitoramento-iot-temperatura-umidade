import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Database } from '../../db/mysql';
import { HttpError } from '../../shared/http-error';
import type { Cadastro, CadastroRepository, CadastroTransaction, Fields, Resource } from './cadastro.repository';
import { createHash } from 'node:crypto';
import type { BootstrapRepository } from './bootstrap.service';

// Identificadores SQL vêm exclusivamente desta lista; valores sempre usam placeholders.
const columns: Record<Resource, string[]> = {
  empresa: ['nome', 'cnpj', 'ativo'],
  unidade: ['empresa_id', 'nome', 'endereco', 'fuso_horario', 'ativo'],
  setor: ['empresa_id', 'unidade_id', 'nome', 'descricao', 'ativo'],
  ambiente: ['empresa_id', 'setor_id', 'nome', 'descricao', 'temp_min_ideal', 'temp_max_ideal', 'umid_min_ideal', 'umid_max_ideal', 'temp_tolerancia', 'umid_tolerancia', 'ativo'],
  usuario: ['empresa_id', 'nome', 'email', 'senha_hash', 'perfil', 'ativo'],
  dispositivo: ['empresa_id', 'ambiente_id', 'device_id', 'nome', 'modelo_placa', 'sensor', 'intervalo_leitura_seg', 'offline_apos_seg', 'em_manutencao', 'ativo'],
};
function projection(resource: Resource) {
  return ['id', ...columns[resource].filter(c => c !== 'senha_hash'), 'criado_em', 'atualizado_em'].map(c => `\`${c}\``).join(',');
}
function scope(resource: Resource, empresaId: number | null) {
  return resource === 'empresa' ? { sql: '1=1', values: [] } : { sql: 'empresa_id <=> ?', values: [empresaId] };
}
function normalize(row: RowDataPacket): Cadastro {
  const result = { ...row };
  for (const key of ['ativo', 'em_manutencao']) if (key in result) result[key] = !!result[key];
  for (const key of ['temp_min_ideal', 'temp_max_ideal', 'umid_min_ideal', 'umid_max_ideal', 'temp_tolerancia', 'umid_tolerancia']) if (result[key] != null) result[key] = Number(result[key]);
  return result as Cadastro;
}
function writable(resource: Resource, fields: Fields) {
  const names = Object.keys(fields);
  if (!names.length || names.some(name => !columns[resource].includes(name))) throw new Error('Campos fora do contrato de persistência.');
  return names;
}
function sqlValue(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  throw new Error('Valor fora do contrato de persistência.');
}
function mapError(error: unknown): never {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === 'ER_DUP_ENTRY') throw new HttpError(409, 'DUPLICIDADE', 'Já existe cadastro com um dos identificadores informados.');
  if (code === 'ER_NO_REFERENCED_ROW_2') throw new HttpError(404, 'NAO_ENCONTRADO', 'Vínculo não encontrado.');
  if (code === 'ER_CHECK_CONSTRAINT_VIOLATED') throw new HttpError(400, 'VALIDACAO', 'Dados incompatíveis com as regras do cadastro.');
  if (code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT') throw new HttpError(409, 'CONCORRENCIA', 'Operação concorrente. Tente novamente.');
  throw error;
}
function session(c: PoolConnection): CadastroTransaction {
  return {
    async find(resource, id, empresaId) {
      const filter = scope(resource, empresaId);
      const [rows] = await c.execute<RowDataPacket[]>(`SELECT ${projection(resource)} FROM \`${resource}\` WHERE id=? AND ${filter.sql}`, [id, ...filter.values]);
      return rows[0] ? normalize(rows[0]) : null;
    },
    async list(resource, empresaId, page) {
      const filter = scope(resource, empresaId);
      const where = `${filter.sql}${page.incluir_inativos ? '' : ' AND ativo=1'}`;
      const [counts] = await c.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM \`${resource}\` WHERE ${where}`, filter.values);
      // query também faz escape de parâmetros; LIMIT numérico é validado antes da persistência.
      const [rows] = await c.query<RowDataPacket[]>(`SELECT ${projection(resource)} FROM \`${resource}\` WHERE ${where} ORDER BY id LIMIT ? OFFSET ?`, [...filter.values, page.tamanho, (page.pagina - 1) * page.tamanho]);
      return { dados: rows.map(normalize), pagina: page.pagina, tamanho: page.tamanho, total: Number(counts[0].total) };
    },
    async lockCompany(id, requireActive) {
      const [rows] = await c.execute<RowDataPacket[]>('SELECT ativo FROM empresa WHERE id=? FOR UPDATE', [id]);
      if (!rows.length) throw new HttpError(404, 'NAO_ENCONTRADO', 'Empresa não encontrada.');
      if (requireActive && !rows[0].ativo) throw new HttpError(409, 'VINCULO_INATIVO', 'Empresa inativa.');
    },
    async insert(resource, fields) {
      const names = writable(resource, fields);
      const [result] = await c.execute<ResultSetHeader>(`INSERT INTO \`${resource}\` (${names.map(n => `\`${n}\``).join(',')}) VALUES (${names.map(() => '?').join(',')})`, names.map(n => sqlValue(fields[n])));
      return result.insertId;
    },
    async update(resource, id, empresaId, fields) {
      const names = writable(resource, fields); const filter = scope(resource, empresaId);
      await c.execute(`UPDATE \`${resource}\` SET ${names.map(n => `\`${n}\`=?`).join(',')} WHERE id=? AND ${filter.sql}`, [...names.map(n => sqlValue(fields[n])), id, ...filter.values]);
    },
    async countActiveAdmins(empresaId) {
      const [rows] = await c.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM usuario WHERE empresa_id=? AND perfil='administrador' AND ativo=1", [empresaId]);
      return Number(rows[0].total);
    },
    async revokeUserSessions(usuarioId) { await c.execute('UPDATE sessao SET revogada_em=COALESCE(revogada_em,UTC_TIMESTAMP(3)) WHERE usuario_id=?', [usuarioId]); },
    async audit(entry) {
      await c.execute('INSERT INTO auditoria (empresa_id,usuario_id,acao,entidade,entidade_id,antes,depois,ip) VALUES (?,?,?,?,?,?,?,?)', [entry.empresaId, entry.usuarioId, entry.acao, entry.entidade, entry.entidadeId, entry.antes ? JSON.stringify(entry.antes) : null, JSON.stringify(entry.depois), entry.ip]);
    },
  };
}
export { session as createMysqlCadastroTransaction };
export function createMysqlCadastroRepository(db: Database): CadastroRepository {
  return {
    find: (resource, id, empresaId) => db.withConnection(c => session(c).find(resource, id, empresaId)),
    list: (resource, empresaId, page) => db.withConnection(c => session(c).list(resource, empresaId, page)),
    transaction: work => db.withConnection(async c => {
      await c.beginTransaction();
      try { const result = await work(session(c)); await c.commit(); return result; }
      catch (error) { await c.rollback(); return mapError(error); }
    }),
  };
}

export function createMysqlBootstrapRepository(db: Database): BootstrapRepository {
  return {
    createFirstSuperadmin: account => db.withConnection(async c => {
      const [[database]] = await c.query<RowDataPacket[]>('SELECT DATABASE() AS name');
      const lock = `stma-bootstrap-${createHash('sha256').update(String(database.name)).digest('hex').slice(0, 32)}`;
      const [[acquired]] = await c.execute<RowDataPacket[]>('SELECT GET_LOCK(?,10) AS acquired', [lock]);
      if (Number(acquired.acquired) !== 1) throw new HttpError(409, 'CONCORRENCIA', 'Outro provisionamento está em execução.');
      try {
        await c.beginTransaction();
        try {
          const [[existing]] = await c.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM usuario WHERE perfil='superadmin'");
          if (Number(existing.total) > 0) throw new HttpError(409, 'SUPERADMIN_EXISTENTE', 'Já existe um superadmin. Nenhuma conta foi alterada.');
          const tx = session(c);
          const id = await tx.insert('usuario', { ...account, perfil: 'superadmin', empresa_id: null });
          const user = (await tx.find('usuario', id, null))!;
          await tx.audit({ empresaId: null, usuarioId: null, acao: 'bootstrap', entidade: 'usuario', entidadeId: id, antes: null, depois: user, ip: null });
          await c.commit();
          return id;
        } catch (error) { await c.rollback(); return mapError(error); }
      } finally { await c.execute('SELECT RELEASE_LOCK(?)', [lock]); }
    }),
  };
}
