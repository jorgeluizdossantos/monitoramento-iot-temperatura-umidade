import { z } from 'zod';
import { companyId } from '../auth/auth.scope';
import type { Principal } from '../auth/auth.repository';
import type { WriteContext } from '../cadastros/cadastro.repository';
import { parse } from '../cadastros/cadastro.validation';
import { HttpError } from '../../shared/http-error';
import type { MonitoringRepository } from './monitoring.repository';

const alertPage = z.object({ pagina: z.coerce.number().int().min(1).max(1000000).default(1), tamanho: z.coerce.number().int().min(1).max(500).default(20), situacao: z.enum(['aberto', 'encerrado', 'todos']).default('aberto') }).strict();
// IDs de alerta são BIGINT: mantê-los como texto evita arredondamento em JavaScript.
const alertId = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => BigInt(value) <= 18446744073709551615n);
export function createMonitoringService(repository: MonitoringRepository) {
  return {
    async panel(query: unknown, actor: Principal) {
      const company = companyId(actor); parse(z.object({}).strict(), query);
      return { dados: await repository.panel(company) };
    },
    async alerts(query: unknown, actor: Principal) {
      const company = companyId(actor); const page = parse(alertPage, query);
      return { ...await repository.alerts(company, page), pagina: page.pagina, tamanho: page.tamanho };
    },
    acknowledge(id: string, body: unknown, context: WriteContext) {
      const company = companyId(context.actor);
      if (!['administrador', 'operador'].includes(context.actor.perfil)) throw new HttpError(403, 'ACESSO_NEGADO', 'Reconhecimento exige operador ou administrador.');
      parse(z.object({}).strict(), body);
      return repository.acknowledge(parse(alertId, id), company, context);
    },
  };
}
export type MonitoringService = ReturnType<typeof createMonitoringService>;
