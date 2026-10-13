import { z } from 'zod';
import type { Principal } from '../auth/auth.repository';
import { companyId } from '../auth/auth.scope';
import { parse, paramId } from '../cadastros/cadastro.validation';
import { HttpError } from '../../shared/http-error';
import type { HistoryRepository, Reading } from './history.repository';
import { DAY, HOUR, RAW_RETENTION_DAYS, floorHour } from '../maintenance/maintenance.service';

const timestamp = z.string().datetime({ offset: true }).transform(value => new Date(value));
const periodSchema = z.object({ de: timestamp, ate: timestamp }).strict();
const pageSchema = periodSchema.extend({ pagina: z.coerce.number().int().min(1).max(1000000).default(1), tamanho: z.coerce.number().int().min(1).max(500).default(20) });
export function validatePeriod<T extends { de: Date; ate: Date }>(period: T, days: number): T {
  const duration = period.ate.getTime() - period.de.getTime();
  if (duration <= 0 || duration > days * 86400000) throw new HttpError(400, 'PERIODO_INVALIDO', `Informe de < ate e no máximo ${days} dias.${days === 31 ? ' Para períodos maiores, use /serie.' : ''}`, ['de', 'ate']);
  return period;
}
export const csvHeader = 'data_hora_utc,temperatura_c,umidade_pct,dispositivo_id,leitura_id\r\n';
export function csvReading(row: Reading) {
  // Só campos numéricos vindos do schema e data ISO; nenhum texto de cadastro/fórmula.
  return `${row.medido_em.toISOString()},${row.temperatura_c},${row.umidade_pct},${row.dispositivo_id},${row.id}\r\n`;
}
export function createHistoryService(repository: HistoryRepository, clock = () => new Date()) {
  return {
    async history(id: string, query: unknown, actor: Principal) {
      const company = companyId(actor); const room = parse(paramId, id); const page = validatePeriod(parse(pageSchema, query), 31);
      await repository.assertRoom(room, company);
      return { ...await repository.history(room, company, page), pagina: page.pagina, tamanho: page.tamanho };
    },
    async series(id: string, query: unknown, actor: Principal) {
      const company = companyId(actor); const room = parse(paramId, id); const period = validatePeriod(parse(periodSchema, query), 366);
      const retentionBoundary = floorHour(new Date(+clock() - RAW_RETENTION_DAYS * DAY));
      if (period.de < retentionBoundary && (+period.de % HOUR !== 0 || +period.ate % HOUR !== 0)) {
        throw new HttpError(400, 'HORAS_COMPLETAS_OBRIGATORIAS', 'Séries anteriores à retenção de 90 dias exigem início e fim em horas completas UTC; o resumo não permite recortar minutos.', ['de', 'ate']);
      }
      await repository.assertRoom(room, company);
      return { fonte: 'leituras_brutas_e_resumos', granularidade: 'hora', dados: await repository.series(room, company, period) };
    },
    async export(id: string, query: unknown, actor: Principal) {
      const company = companyId(actor); const room = parse(paramId, id); const period = validatePeriod(parse(periodSchema, query), 31);
      await repository.assertRoom(room, company);
      return repository.exportRows(room, company, period);
    },
  };
}
export type HistoryService = ReturnType<typeof createHistoryService>;
