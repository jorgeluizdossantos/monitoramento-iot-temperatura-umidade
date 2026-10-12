import { z } from 'zod';
import type { Principal } from '../auth/auth.repository';
import { HttpError } from '../../shared/http-error';
import { parse, pageSchema } from '../cadastros/cadastro.validation';
import type { Cadastro, Fields, WriteContext } from '../cadastros/cadastro.repository';

export const adoptionSchema = z.object({ ambiente_id: z.number().int().positive().max(4294967295), sensor: z.enum(['DHT11', 'DHT22', 'SHT31', 'OUTRO']), nome: z.string().trim().min(1).max(120).optional() }).strict();
export const pendingPageSchema = pageSchema.omit({ incluir_inativos: true }).extend({ situacao: z.enum(['pendente', 'adotado', 'ignorado']).default('pendente') });
export type PendingPage = z.output<typeof pendingPageSchema>;
export type Adoption = z.output<typeof adoptionSchema>;
export interface PendingRepository {
  list(page: PendingPage): Promise<{ dados: Fields[]; total: number; pagina: number; tamanho: number }>;
  adopt(id: number, data: Adoption, context: WriteContext): Promise<Cadastro>;
}
function authorize(actor: Principal) {
  if (actor.perfil !== 'superadmin' || actor.empresa_id !== null) throw new HttpError(403, 'ACESSO_NEGADO', 'A fila global exige superadmin.');
}
export function createPendingService(repository: PendingRepository) {
  return {
    async list(query: unknown, actor: Principal) { authorize(actor); return repository.list(parse(pendingPageSchema, query)); },
    async adopt(id: number, body: unknown, context: WriteContext) { authorize(context.actor); return repository.adopt(id, parse(adoptionSchema, body), context); },
  };
}
export type PendingService = ReturnType<typeof createPendingService>;
