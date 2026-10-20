import { Router } from 'express';
import type { AuthService } from '../auth/auth.service';
import { requireRoles, requireSession } from '../auth/auth.middleware';
import { mutationGuard } from '../../shared/mutation-guard';
import { parse, paramId } from '../cadastros/cadastro.validation';
import type { ControlService } from './control.service';
export function createControlRouter(service: ControlService, auth: AuthService, origin: string) {
  const router = Router();
  // Este router compartilha /api/v1: a proteção deve alcançar somente suas rotas.
  router.use('/dispositivos/:id/controle', requireSession(auth), requireRoles('administrador', 'operador', 'leitor'), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/dispositivos/:id/controle', (req, res, next) => { void Promise.resolve().then(async () => res.json({ dados: await service.state(parse(paramId, String(req.params.id)), req.auth!) })).catch(next); });
  router.post('/dispositivos/:id/controle', requireRoles('administrador', 'operador'), mutationGuard(origin), (req, res, next) => { void Promise.resolve().then(async () => res.status(202).json(await service.send(parse(paramId, String(req.params.id)), req.body, req.auth!, req.ip ?? null))).catch(next); });
  return router;
}
