import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { HttpError } from '../../shared/http-error';
import type { AuthRepository, Principal } from './auth.repository';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const validToken = (token: string | undefined): token is string => !!token && /^[a-f0-9]{64}$/.test(token);
const unauthorized = () => new HttpError(401, 'NAO_AUTENTICADO', 'Sessão ausente, inválida ou expirada.');
export async function createAuthService(repository: AuthRepository, ttlHours: number) {
  // Um hash válido também é verificado quando o e-mail não existe.
  const dummyHash = await argon2.hash(randomBytes(32), { type: argon2.argon2id });
  return {
    async login(email: string, password: string, metadata: { ip: string | null; userAgent: string | null; previousToken?: string }) {
      const user = await repository.findUser(email);
      const matches = await argon2.verify(user?.senha_hash ?? dummyHash, password);
      const denied = () => new HttpError(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.');
      if (!user || !matches) throw denied();
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + ttlHours * 3600000);
      const saved = await repository.createSession({ usuarioId: user.id, passwordSnapshot: user.senha_hash, tokenHash: hashToken(token), expiresAt, ip: metadata.ip, userAgent: metadata.userAgent, previousHash: validToken(metadata.previousToken) ? hashToken(metadata.previousToken) : undefined });
      if (!saved) throw denied();
      const principal: Principal = { id: user.id, empresa_id: user.empresa_id, nome: user.nome, email: user.email, perfil: user.perfil };
      return { token, expiresAt, principal };
    },
    async authenticate(token: string | undefined) {
      if (!validToken(token)) throw unauthorized();
      const principal = await repository.findSession(hashToken(token));
      if (!principal) throw unauthorized();
      return principal;
    },
    async logout(token: string) { await repository.revokeSession(hashToken(token)); },
  };
}
export type AuthService = Awaited<ReturnType<typeof createAuthService>>;
