import type { Principal } from '../auth/auth.repository';

export const resources = ['empresa', 'unidade', 'setor', 'ambiente', 'usuario', 'dispositivo'] as const;
export type Resource = typeof resources[number];
export type Fields = Record<string, unknown>;
export interface Cadastro extends Fields { id: number; ativo: boolean; empresa_id?: number | null }
export interface Page { pagina: number; tamanho: number; incluir_inativos: boolean }
export interface PageResult { dados: Cadastro[]; pagina: number; tamanho: number; total: number }
export interface Audit { empresaId: number | null; usuarioId: number | null; acao: string; entidade: Resource | 'dispositivo_pendente'; entidadeId: number; antes: Fields | null; depois: Fields; ip: string | null }
export interface WriteContext { actor: Principal; ip: string | null }

export interface CadastroReader {
  find(resource: Resource, id: number, empresaId: number | null): Promise<Cadastro | null>;
  list(resource: Resource, empresaId: number | null, page: Page): Promise<PageResult>;
}
export interface CadastroTransaction extends CadastroReader {
  lockCompany(id: number, requireActive: boolean): Promise<void>;
  insert(resource: Resource, fields: Fields): Promise<number>;
  update(resource: Resource, id: number, empresaId: number | null, fields: Fields): Promise<void>;
  countActiveAdmins(empresaId: number): Promise<number>;
  revokeUserSessions(usuarioId: number): Promise<void>;
  audit(entry: Audit): Promise<void>;
}
export interface CadastroRepository extends CadastroReader {
  transaction<T>(work: (tx: CadastroTransaction) => Promise<T>): Promise<T>;
}
