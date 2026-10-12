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

export function createApp(dependencies: { healthRepository: HealthRepository; logger: Logger; auth?: { service: AuthService; env: Environment } }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', createHealthController(createHealthService(dependencies.healthRepository)));
  if (dependencies.auth) app.use('/api/v1/auth', createAuthRouter(dependencies.auth.service, dependencies.auth.env));
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
