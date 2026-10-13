import { Router, type Response } from 'express';
import type { AuthService } from '../auth/auth.service';
import { requireRoles, requireSession } from '../auth/auth.middleware';
import { csvHeader, csvReading, type HistoryService } from './history.service';

async function writeChunk(res: Response, text: string) {
  if (res.destroyed) return;
  if (res.write(text)) return;
  await new Promise<void>(resolve => {
    const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
    res.once('drain', done); res.once('close', done);
  });
}
export function createHistoryRouter(service: HistoryService, auth: AuthService) {
  const router = Router();
  router.use(requireSession(auth), requireRoles('administrador', 'operador', 'leitor'));
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/ambientes/:id/leituras', (req, res, next) => { void service.history(String(req.params.id), req.query, req.auth!).then(data => res.json(data)).catch(next); });
  router.get('/ambientes/:id/serie', (req, res, next) => { void service.series(String(req.params.id), req.query, req.auth!).then(data => res.json(data)).catch(next); });
  router.get('/ambientes/:id/leituras.csv', (req, res, next) => {
    void (async () => {
      const rows = await service.export(String(req.params.id), req.query, req.auth!);
      res.type('text/csv; charset=utf-8').attachment('leituras.csv');
      await writeChunk(res, csvHeader);
      for await (const batch of rows) {
        if (res.destroyed) break;
        const current = await auth.authenticate(req.sessionToken);
        if (current.empresa_id !== req.auth!.empresa_id) { res.destroy(); break; }
        await writeChunk(res, batch.map(csvReading).join(''));
      }
      if (!res.destroyed) res.end();
    })().catch(error => { if (res.headersSent) res.destroy(); else next(error); });
  });
  return router;
}
