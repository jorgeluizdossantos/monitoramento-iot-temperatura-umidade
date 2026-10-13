import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { HealthRepository } from './modules/health/health.repository';
import { createHealthService } from './modules/health/health.service';
import { createHealthController } from './modules/health/health.controller';
import type { Environment } from './config/env';
import type { AuthService } from './modules/auth/auth.service';
import { createAuthRouter } from './modules/auth/auth.routes';
import { HttpError } from './shared/http-error';
import type { CadastroService } from './modules/cadastros/cadastro.service';
import { createCadastroRouter } from './modules/cadastros/cadastro.routes';
import type { PendingService } from './modules/telemetria/pending.service';
import { createPendingRouter } from './modules/telemetria/pending.routes';
import type { MonitoringService } from './modules/telemetria/monitoring.service';
import { createMonitoringRouter } from './modules/telemetria/monitoring.routes';
import type { HistoryService } from './modules/telemetria/history.service';
import { createHistoryRouter } from './modules/telemetria/history.routes';
import { createStreamRouter, type StreamHub } from './modules/stream/stream';

export function createApp(dependencies: { healthRepository: HealthRepository; logger: Logger; auth?: { service: AuthService; env: Environment }; cadastros?: CadastroService; pending?: PendingService; monitoring?: MonitoringService; history?: HistoryService; stream?: StreamHub }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', createHealthController(createHealthService(dependencies.healthRepository)));
  if (dependencies.auth) app.use('/api/v1/auth', createAuthRouter(dependencies.auth.service, dependencies.auth.env));
  if (dependencies.cadastros && dependencies.auth) app.use('/api/v1', createCadastroRouter(dependencies.cadastros, dependencies.auth.service, dependencies.auth.env));
  if (dependencies.pending && dependencies.auth) app.use('/api/v1/dispositivos-pendentes', createPendingRouter(dependencies.pending, dependencies.auth.service, dependencies.auth.env.PUBLIC_ORIGIN));
  if (dependencies.monitoring && dependencies.auth) app.use('/api/v1', createMonitoringRouter(dependencies.monitoring, dependencies.auth.service, dependencies.auth.env.PUBLIC_ORIGIN));
  if (dependencies.history && dependencies.auth) app.use('/api/v1', createHistoryRouter(dependencies.history, dependencies.auth.service));
  if (dependencies.stream && dependencies.auth) app.use('/api/v1', createStreamRouter(dependencies.stream, dependencies.auth.service));
  app.use((_req, res) => { res.status(404).json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Rota não encontrada.', campos: [] } }); });
  const handleError: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ erro: { codigo: error.codigo, mensagem: error.message, campos: error.campos } });
      return;
    }
    const parserStatus = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
    if (parserStatus === 400 || parserStatus === 413) {
      res.status(parserStatus).json({ erro: { codigo: 'REQUISICAO_INVALIDA', mensagem: 'JSON inválido ou corpo acima do limite.', campos: [] } });
      return;
    }
    // Não serializar erros de banco: podem conter SQL, dados ou credenciais.
    dependencies.logger.error({ event: 'request_failed', method: req.method }, 'Falha ao atender requisição');
    res.status(503).json({ erro: { codigo: 'SERVICO_INDISPONIVEL', mensagem: 'Serviço temporariamente indisponível.', campos: [] } });
  };
  app.use(handleError);
  return app;
}
