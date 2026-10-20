import { z } from 'zod';
import { request } from '../../shared/api/client';
const decimal = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).transform(Number).pipe(z.number().finite()).nullable();
export const demoSchema = z.object({ demonstracao: z.literal(true), dados: z.array(z.object({
  empresa: z.string(), unidade: z.string(), setor: z.string(), ambiente: z.string(),
  estado: z.enum(['normal', 'atencao', 'critico', 'sem_dados']),
  status_conexao: z.enum(['online', 'offline', 'desconhecido']).nullable(),
  ultima_leitura_em: z.string().datetime({ offset: true }).nullable(), temperatura_c: decimal, umidade_pct: decimal,
})) });
export type DemoRoom = z.infer<typeof demoSchema>['dados'][number];
export const loadDemo = (signal: AbortSignal) => request('/demo/painel', demoSchema, { signal });
