export interface Period { de: Date; ate: Date }
export interface HistoryPage extends Period { pagina: number; tamanho: number }
export interface Reading { id: string; dispositivo_id: number; medido_em: Date; recebido_em: Date; temperatura_c: string; umidade_pct: string }
export interface HourPoint { hora_ref: string; qtd_leituras: number; temp_media: string; temp_min: string; temp_max: string; umid_media: string; umid_min: string; umid_max: string }
export interface HistoryRepository {
  assertRoom(room: number, company: number): Promise<void>;
  history(room: number, company: number, page: HistoryPage): Promise<{ dados: Reading[]; total: number }>;
  series(room: number, company: number, period: Period): Promise<HourPoint[]>;
  exportRows(room: number, company: number, period: Period): AsyncGenerator<Reading[]>;
}
