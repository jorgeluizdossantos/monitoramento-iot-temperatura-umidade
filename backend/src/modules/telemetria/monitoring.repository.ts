import type { WriteContext } from '../cadastros/cadastro.repository';
export type MonitoringRow = Record<string, unknown>;
export interface AlertPage { pagina: number; tamanho: number; situacao: 'aberto' | 'encerrado' | 'todos'; ambiente_id?: number }
export interface MonitoringRepository {
  panel(company: number): Promise<MonitoringRow[]>;
  alerts(company: number, page: AlertPage): Promise<{ dados: MonitoringRow[]; total: number }>;
  acknowledge(id: string, company: number, context: WriteContext): Promise<MonitoringRow>;
}
