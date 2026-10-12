import type { RequestHandler } from 'express';
import { HttpError } from './http-error';

export function mutationGuard(origin: string): RequestHandler {
  return (req, _res, next) => {
    if (req.get('sec-fetch-site') === 'cross-site' || (req.get('origin') && req.get('origin') !== origin)) return next(new HttpError(403, 'ORIGEM_INVALIDA', 'Origem não autorizada.'));
    if (!req.is('application/json')) return next(new HttpError(415, 'TIPO_INVALIDO', 'Envie Content-Type application/json.'));
    next();
  };
}
