import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Environment } from '../../config/env';
import { HttpError } from '../../shared/http-error';
import { requireSession } from './auth.middleware';
import { hashToken, type AuthService } from './auth.service';
import { createAuthController } from './auth.controller';

export function createAuthRouter(service: AuthService, env: Environment) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const mutation: RequestHandler = (req, _res, next) => {
    if (req.get('sec-fetch-site') === 'cross-site' || (req.get('origin') && req.get('origin') !== env.PUBLIC_ORIGIN)) return next(new HttpError(403, 'ORIGEM_INVALIDA', 'Origem não autorizada.'));
    if (!req.is('application/json')) return next(new HttpError(415, 'TIPO_INVALIDO', 'Envie Content-Type application/json.'));
    next();
  };
  const limited = { erro: { codigo: 'LIMITE_TENTATIVAS', mensagem: 'Muitas tentativas. Tente novamente mais tarde.', campos: [] } };
  const options = { windowMs: 15 * 60000, standardHeaders: 'draft-8' as const, legacyHeaders: false, message: limited };
  const ipLimit = rateLimit({ ...options, limit: env.AUTH_IP_LIMIT });
  const emailLimit = rateLimit({ ...options, limit: env.AUTH_EMAIL_LIMIT, keyGenerator: req => hashToken(req.body.email) });
  const validate: RequestHandler = (req, _res, next) => {
    const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(255), senha: z.string().min(1).max(1024) }).strict().safeParse(req.body);
    if (!parsed.success) return next(new HttpError(400, 'VALIDACAO', 'Informe e-mail e senha válidos.', parsed.error.issues.map(i => i.path.join('.'))));
    req.body = parsed.data;
    next();
  };
  const controller = createAuthController(service, env);
  router.post('/login', mutation, ipLimit, validate, emailLimit, controller.login);
  router.get('/me', requireSession(service), controller.me);
  router.post('/logout', mutation, requireSession(service), controller.logout);
  return router;
}
