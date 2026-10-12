import type { RequestHandler } from 'express';
import { parse } from 'cookie';
import { HttpError } from '../../shared/http-error';
import type { Principal, Role } from './auth.repository';
import type { AuthService } from './auth.service';

declare module 'express-serve-static-core' { interface Request { auth?: Principal; sessionToken?: string } }
export const cookieName = 'stma_session';
export const readToken = (header?: string) => parse(header ?? '')[cookieName];
export function requireSession(service: AuthService): RequestHandler {
  return (req, _res, next) => {
    const token = readToken(req.headers.cookie);
    void service.authenticate(token).then(principal => { req.auth = principal; req.sessionToken = token; next(); }).catch(next);
  };
}
export function requireRoles(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new HttpError(401, 'NAO_AUTENTICADO', 'Autenticação necessária.'));
    if (!roles.includes(req.auth.perfil)) return next(new HttpError(403, 'ACESSO_NEGADO', 'Perfil sem permissão para esta operação.'));
    next();
  };
}
// O repositório de cada recurso deve usar este escopo no WHERE, nunca o body/query.
export function companyId(principal?: Principal): number {
  if (!principal) throw new HttpError(401, 'NAO_AUTENTICADO', 'Autenticação necessária.');
  if (principal.empresa_id === null) throw new HttpError(403, 'ACESSO_NEGADO', 'Esta operação exige vínculo com uma empresa.');
  return principal.empresa_id;
}
