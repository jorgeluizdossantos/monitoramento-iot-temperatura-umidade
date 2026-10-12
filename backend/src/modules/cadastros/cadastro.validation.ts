import { z } from 'zod';
import { HttpError } from '../../shared/http-error';
import type { Fields, Resource } from './cadastro.repository';

const id = z.number().int().positive().max(4294967295);
const nome = z.string().trim().min(1).max(120);
const description = z.string().trim().max(255).nullable();
const decimal = (min: number, max: number) => z.number().finite().min(min).max(max).refine(v => Math.abs(v * 10 - Math.round(v * 10)) < 1e-8, 'Use no máximo uma casa decimal.').nullable();
export const accountSchema = z.object({ nome, email: z.string().trim().toLowerCase().email().max(255), senha: z.string().min(12).max(128) }).strict();
const schemas = {
  empresa: z.object({ nome, cnpj: z.string().regex(/^[0-9A-Z]{12}[0-9]{2}$/).nullable().optional(), ativo: z.boolean().optional() }).strict(),
  unidade: z.object({ nome, endereco: description.optional(), fuso_horario: z.string().max(40).refine(value => { try { new Intl.DateTimeFormat('pt-BR', { timeZone: value }); return true; } catch { return false; } }, 'Fuso horário inválido.').optional(), ativo: z.boolean().optional() }).strict(),
  setor: z.object({ nome, unidade_id: id, descricao: description.optional(), ativo: z.boolean().optional() }).strict(),
  ambiente: z.object({ nome, setor_id: id, descricao: description.optional(), temp_min_ideal: decimal(-50, 100).optional(), temp_max_ideal: decimal(-50, 100).optional(), umid_min_ideal: decimal(0, 100).optional(), umid_max_ideal: decimal(0, 100).optional(), temp_tolerancia: decimal(0, 99.9).optional(), umid_tolerancia: decimal(0, 99.9).optional(), ativo: z.boolean().optional() }).strict(),
  usuario: accountSchema.extend({ perfil: z.enum(['administrador', 'operador', 'leitor']), ativo: z.boolean().optional() }).strict(),
  dispositivo: z.object({ ambiente_id: id, device_id: z.string().regex(/^[a-z0-9_-]{3,64}$/), nome: nome.nullable().optional(), modelo_placa: z.string().trim().min(1).max(30).optional(), sensor: z.enum(['DHT11', 'DHT22', 'SHT31', 'OUTRO']), intervalo_leitura_seg: z.number().int().min(2).max(3600).optional(), offline_apos_seg: z.number().int().min(10).max(86400).optional(), em_manutencao: z.boolean().optional(), ativo: z.boolean().optional() }).strict(),
};
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, 'VALIDACAO', 'Dados inválidos.', result.error.issues.map(issue => issue.path.join('.')));
  return result.data;
}
export function validateFields(resource: Resource, input: unknown, partial = false): Fields {
  const schema = schemas[resource];
  const fields = parse(partial ? schema.partial() : schema, input) as Fields;
  if (partial && !Object.keys(fields).length) throw new HttpError(400, 'VALIDACAO', 'Informe ao menos um campo.');
  return fields;
}
export const companyCreation = schemas.empresa.omit({ ativo: true }).extend({ administrador: accountSchema }).strict();
export const maintenanceSchema = z.object({ em_manutencao: z.boolean() }).strict();
export const pageSchema = z.object({
  pagina: z.coerce.number().int().min(1).max(1000000).default(1),
  tamanho: z.coerce.number().int().min(1).max(500).default(20),
  incluir_inativos: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
}).strict();
export const paramId = z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(id);

export function validateRanges(fields: Fields) {
  for (const prefix of ['temp', 'umid']) {
    const min = fields[`${prefix}_min_ideal`]; const max = fields[`${prefix}_max_ideal`];
    if (typeof min === 'number' && typeof max === 'number' && min > max) throw new HttpError(400, 'FAIXA_INVALIDA', 'O limite mínimo deve ser menor ou igual ao máximo.', [`${prefix}_min_ideal`, `${prefix}_max_ideal`]);
  }
}
