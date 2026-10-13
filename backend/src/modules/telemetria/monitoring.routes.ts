import { Router } from 'express';
import type { AuthService } from '../auth/auth.service';
import { requireRoles, requireSession } from '../auth/auth.middleware';
import { mutationGuard } from '../../shared/mutation-guard';
import type { MonitoringService } from './monitoring.service';

export function createMonitoringRouter(service: MonitoringService, auth: AuthService, origin: string) {
  const router = Router();
  router.use(requireSession(auth), requireRoles('administrador', 'operador', 'leitor'));
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/painel', (req, res, next) => { void service.panel(req.query, req.auth!).then(data => res.json(data)).catch(next); });
  router.get('/alertas', (req, res, next) => { void service.alerts(req.query, req.auth!).then(data => res.json(data)).catch(next); });
  router.post('/alertas/:id/reconhecer', mutationGuard(origin), (req, res, next) => {
    void Promise.resolve().then(() => service.acknowledge(String(req.params.id), req.body, { actor: req.auth!, ip: req.ip ?? null }))
      .then(data => res.json({ dados: data })).catch(next);
  });
  return router;
}
