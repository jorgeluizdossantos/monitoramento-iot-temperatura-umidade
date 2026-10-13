export interface MaintenanceResult {
  skipped: boolean;
  affected: number;
}

// A aplicação conhece operações de manutenção, não SQL nem o agendador.
export interface MaintenanceRepository {
  summarize(from: Date, until: Date): Promise<MaintenanceResult>;
  markOffline(now: Date): Promise<MaintenanceResult>;
  purgeReadings(before: Date, continuing: () => boolean): Promise<MaintenanceResult>;
  cleanSessions(before: Date, continuing: () => boolean): Promise<MaintenanceResult>;
}
