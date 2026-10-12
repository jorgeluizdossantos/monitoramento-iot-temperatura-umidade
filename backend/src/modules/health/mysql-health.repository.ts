import type { Database } from '../../db/mysql';
import type { HealthRepository } from './health.repository';

export function createMysqlHealthRepository(database: Database): HealthRepository {
  return {
    async ping() {
      await database.withConnection(async connection => { await connection.execute('SELECT 1'); });
    },
  };
}
