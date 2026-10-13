import type { MaintenanceRepository } from './maintenance.repository';

export const HOUR = 3600000;
export const DAY = 24 * HOUR;
export const RAW_RETENTION_DAYS = 90;
export const floorHour = (date: Date) => new Date(Math.floor(+date / HOUR) * HOUR);

export function createMaintenanceService(repository: MaintenanceRepository, clock = () => new Date()) {
  return {
    // Repara também atrasos recentes. A hora em andamento fica nas leituras brutas.
    summarize: () => {
      const until = floorHour(clock());
      return repository.summarize(new Date(+until - 48 * HOUR), until);
    },
    offline: () => repository.markOffline(clock()),
    purge: (continuing = () => true) => repository.purgeReadings(floorHour(new Date(+clock() - RAW_RETENTION_DAYS * DAY)), continuing),
    sessions: (continuing = () => true) => repository.cleanSessions(new Date(+clock() - 30 * DAY), continuing),
  };
}
export type MaintenanceService = ReturnType<typeof createMaintenanceService>;
