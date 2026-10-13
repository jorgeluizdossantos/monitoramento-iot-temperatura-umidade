import { Router } from 'express';
import type { AuthService } from '../auth/auth.service';
import { requireRoles, requireSession } from '../auth/auth.middleware';
import { companyId } from '../auth/auth.scope';
import { HttpError } from '../../shared/http-error';

export function createStreamHub() {
  const clients = new Set<{ company: number; notify: () => void; close: () => void }>();
  return {
    subscribe(company: number, notify: () => void, close: () => void) {
      if (clients.size >= 500 || [...clients].filter(client => client.company === company).length >= 50) throw new HttpError(503, 'STREAM_OCUPADO', 'Limite de conexões simultâneas atingido.');
      const client = { company, notify, close }; clients.add(client);
      return () => { clients.delete(client); };
    },
    publish(company: number) { for (const client of clients) if (client.company === company) client.notify(); },
    close() { for (const client of [...clients]) client.close(); clients.clear(); },
    size: () => clients.size,
  };
}
export type StreamHub = ReturnType<typeof createStreamHub>;

export function createStreamRouter(hub: StreamHub, auth: AuthService, heartbeatMs = 25000) {
  const router = Router();
  router.get('/stream', requireSession(auth), requireRoles('administrador', 'operador', 'leitor'), (req, res, next) => {
    const company = companyId(req.auth);
    let closed = false; let checking = false; let dirty = false;
    const timer: { heartbeat?: ReturnType<typeof setInterval> } = {};
    let unsubscribe = () => {};
    const close = () => {
      if (closed) return; closed = true; clearInterval(timer.heartbeat); unsubscribe(); res.end();
    };
    const send = async (changed: boolean) => {
      if (changed) dirty = true;
      if (checking || closed) return;
      checking = true;
      try {
        do {
          const invalidate = dirty; dirty = false;
          const current = await auth.authenticate(req.sessionToken);
          if (current.empresa_id !== company || !['administrador', 'operador', 'leitor'].includes(current.perfil)) { close(); return; }
          if (closed) return;
          // Só um aviso: o cliente consulta novamente as APIs autorizadas. Não há fila ilimitada.
          const text = invalidate ? 'event: atualizar\ndata: {"reconsultar":true}\n\n' : ': heartbeat\n\n';
          if (!res.write(text)) { close(); return; }
        } while (dirty && !closed);
      } catch { close(); }
      finally { checking = false; }
    };
    try { unsubscribe = hub.subscribe(company, () => { void send(true); }, close); }
    catch (error) { next(error); return; }
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders(); res.write('retry: 3000\n\n');
    res.once('close', close);
    timer.heartbeat = setInterval(() => { void send(false); }, heartbeatMs);
    timer.heartbeat.unref();
    void send(true);
  });
  return router;
}
