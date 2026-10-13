import cron from 'node-cron';
import type { Logger } from 'pino';
import type { MaintenanceService } from './maintenance.service';

export function startMaintenanceScheduler(service: MaintenanceService, logger: Logger) {
  let stopping = false;
  const active = new Map<string, Promise<void>>();
  function run(name: keyof MaintenanceService) {
    if (stopping || active.has(name)) return Promise.resolve();
    const started = Date.now();
    const task = Promise.resolve().then(() => service[name](() => !stopping)).then(result => {
      logger.info({ job: name, ...result, durationMs: Date.now() - started }, 'Rotina de manutenção concluída');
    }).catch(() => {
      // Erros SQL podem conter valores/credenciais; não os serializar no log.
      logger.error({ job: name, durationMs: Date.now() - started }, 'Falha na manutenção; confira banco, permissões e capacidade do resumo');
    }).finally(() => { active.delete(name); });
    active.set(name, task);
    return task;
  }
  const tasks = [
    cron.schedule('0 * * * *', () => run('summarize'), { timezone: 'UTC', noOverlap: true }),
    cron.schedule('* * * * *', () => run('offline'), { timezone: 'UTC', noOverlap: true }),
    cron.schedule('0 3 * * *', () => run('purge'), { timezone: 'America/Bahia', noOverlap: true }),
    cron.schedule('30 3 * * *', () => run('sessions'), { timezone: 'America/Bahia', noOverlap: true }),
  ];
  // Recuperação após reinício; exclusões ocorrem somente na agenda diária.
  void run('summarize');
  return {
    async stop() {
      stopping = true;
      await Promise.all(tasks.map(task => task.destroy()));
      await Promise.all(active.values());
    },
  };
}
