import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { DemoService } from './demo.service';

export function createDemoRouter(service: DemoService) {
  const router = Router();
  router.use(rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { erro: { codigo: 'LIMITE_DEMO', mensagem: 'Aguarde antes de consultar novamente.', campos: [] } } }));
  router.get('/painel', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    void service.panel(req.query).then(data => res.json(data)).catch(next);
  });
  return router;
}
