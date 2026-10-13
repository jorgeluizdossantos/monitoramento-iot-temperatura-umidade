import { loadEnvironment } from './config/env';
import { createDatabase } from './db/mysql';
import { createMysqlHealthRepository } from './modules/health/mysql-health.repository';
import { createLogger } from './shared/logger';
import { createApp } from './app';
import { createAuthService } from './modules/auth/auth.service';
import { createMysqlAuthRepository } from './modules/auth/mysql-auth.repository';
import { createMysqlCadastroRepository } from './modules/cadastros/mysql-cadastro.repository';
import { createCadastroService } from './modules/cadastros/cadastro.service';
import { createMysqlTelemetryRepository } from './modules/telemetria/mysql-telemetry.repository';
import { createTelemetryService } from './modules/telemetria/telemetry.service';
import { startMqttConsumer } from './modules/telemetria/mqtt-consumer';
import { createMysqlPendingRepository } from './modules/telemetria/mysql-pending.repository';
import { createPendingService } from './modules/telemetria/pending.service';
import { createMonitoringService } from './modules/telemetria/monitoring.service';
import { createMysqlMonitoringRepository } from './modules/telemetria/mysql-monitoring.repository';
import { createHistoryService } from './modules/telemetria/history.service';
import { createMysqlHistoryRepository } from './modules/telemetria/mysql-history.repository';
import { createStreamHub } from './modules/stream/stream';
import { createMysqlMaintenanceRepository } from './modules/maintenance/mysql-maintenance.repository';
import { createMaintenanceService } from './modules/maintenance/maintenance.service';
import { startMaintenanceScheduler } from './modules/maintenance/scheduler';

async function main() {
  const env = loadEnvironment();
  const logger = createLogger(env.LOG_LEVEL);
  const database = createDatabase(env);
  const healthRepository = createMysqlHealthRepository(database);
  try { await healthRepository.ping(); }
  catch { await database.close(); throw new Error('Banco indisponível; confira o perfil e a conexão.'); }
  const authService = await createAuthService(createMysqlAuthRepository(database), env.SESSION_TTL_HOURS);
  const cadastros = createCadastroService(createMysqlCadastroRepository(database));
  const pending = createPendingService(createMysqlPendingRepository(database));
  const monitoring = createMonitoringService(createMysqlMonitoringRepository(database));
  const history = createHistoryService(createMysqlHistoryRepository(database));
  const stream = createStreamHub();
  const maintenance = env.JOBS_ENABLED ? startMaintenanceScheduler(createMaintenanceService(createMysqlMaintenanceRepository(database, stream.publish)), logger) : undefined;
  const consumer = env.mqtt.MQTT_ENABLED ? startMqttConsumer(env.mqtt, createTelemetryService(createMysqlTelemetryRepository(database, stream.publish), env.mqtt, logger), logger) : undefined;
  const server = createApp({ healthRepository, logger, auth: { service: authService, env }, cadastros, pending, monitoring, history, stream }).listen(env.PORT, () => {
    logger.info({ port: env.PORT, databaseTarget: env.DB_TARGET }, 'Backend STMA iniciado');
  });
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    stream.close();
    const deadline = setTimeout(() => process.exit(1), 30000).unref();
    const httpClosed = new Promise<void>(resolve => server.close(() => resolve()));
    void Promise.all([httpClosed, consumer?.stop(), maintenance?.stop()]).then(() => database.close()).then(() => clearTimeout(deadline)).catch(() => { process.exitCode = 1; });
  }
  server.on('error', () => { logger.error('Falha ao abrir porta HTTP'); process.exitCode = 1; stop(); });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

void main().catch(() => { console.error('Não foi possível iniciar o backend. Verifique configuração, certificado e banco.'); process.exitCode = 1; });
