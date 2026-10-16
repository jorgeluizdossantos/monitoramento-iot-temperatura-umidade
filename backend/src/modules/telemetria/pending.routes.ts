import { Router } from 'express';
import type { AuthService } from '../auth/auth.service';
import { requireRoles, requireSession } from '../auth/auth.middleware';
import { mutationGuard } from '../../shared/mutation-guard';
import { parse, paramId } from '../cadastros/cadastro.validation';
import type { PendingService } from './pending.service';

export function createPendingRouter(service: PendingService, auth: AuthService, origin: string) {
  const router = Router();
  router.use(requireSession(auth), requireRoles('superadmin'));
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/', (req, res, next) => { void service.list(req.query, req.auth!).then(result => res.json(result)).catch(next); });
  router.get('/destinos', (req, res, next) => { void service.destinations(req.query, req.auth!).then(result => res.json(result)).catch(next); });
  router.post('/:id/adotar', mutationGuard(origin), (req, res, next) => {
    void Promise.resolve().then(() => service.adopt(parse(paramId, req.params.id), req.body, { actor: req.auth!, ip: req.ip ?? null }))
      .then(device => res.location(`/api/v1/dispositivos/${device.id}`).status(201).json({ dados: device })).catch(next);
  });
  return router;
}
