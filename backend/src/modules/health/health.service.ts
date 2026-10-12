import type { HealthRepository } from './health.repository';

export function createHealthService(repository: HealthRepository) {
  return {
    async check() {
      await repository.ping();
      return { status: 'ok', database: 'up' } as const;
    },
  };
}
