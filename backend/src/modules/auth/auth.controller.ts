import type { RequestHandler } from 'express';
import type { Environment } from '../../config/env';
import { cookieName, readToken } from './auth.middleware';
import type { AuthService } from './auth.service';

export function createAuthController(service: AuthService, env: Environment) {
  const options = { httpOnly: true, secure: env.SESSION_COOKIE_SECURE, sameSite: 'lax' as const, path: '/' };
  const login: RequestHandler = (req, res, next) => {
    void service.login(req.body.email, req.body.senha, { ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 255) ?? null, previousToken: readToken(req.headers.cookie) }).then(result => {
      res.cookie(cookieName, result.token, { ...options, expires: result.expiresAt });
      res.json({ usuario: result.principal });
    }).catch(next);
  };
  const me: RequestHandler = (req, res) => { res.json({ usuario: req.auth }); };
  const logout: RequestHandler = (req, res, next) => {
    void service.logout(req.sessionToken!).then(() => { res.clearCookie(cookieName, options); res.status(204).end(); }).catch(next);
  };
  return { login, me, logout };
}
