// Porta da aplicação: não expõe Express, mysql2 ou um ORM.
export interface HealthRepository {
  ping(): Promise<void>;
}
