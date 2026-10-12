export type Role = 'superadmin' | 'administrador' | 'operador' | 'leitor';
export interface Principal { id: number; empresa_id: number | null; nome: string; email: string; perfil: Role }
export interface AuthUser extends Principal { senha_hash: string }
export interface NewSession { usuarioId: number; tokenHash: string; expiresAt: Date; ip: string | null; userAgent: string | null; previousHash?: string }
export interface AuthRepository {
  findUser(email: string): Promise<AuthUser | null>;
  createSession(session: NewSession): Promise<boolean>;
  findSession(tokenHash: string): Promise<Principal | null>;
  revokeSession(tokenHash: string): Promise<void>;
}
