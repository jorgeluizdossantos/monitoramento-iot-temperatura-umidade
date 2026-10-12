import * as argon2 from 'argon2';
import { HttpError } from '../../shared/http-error';
import type { Principal } from '../auth/auth.repository';
import { companyId } from '../auth/auth.scope';
import type { Cadastro, CadastroRepository, CadastroTransaction, Fields, Page, Resource, WriteContext } from './cadastro.repository';
import { companyCreation, maintenanceSchema, parse, validateFields, validateRanges } from './cadastro.validation';

const notFound = () => new HttpError(404, 'NAO_ENCONTRADO', 'Cadastro não encontrado.');
const denied = () => new HttpError(403, 'ACESSO_NEGADO', 'Perfil sem permissão para esta operação.');
function authorize(resource: Resource, actor: Principal, write: boolean, maintenance = false): number | null {
  if (resource === 'empresa') { if (actor.perfil !== 'superadmin') throw denied(); return null; }
  const tenant = companyId(actor);
  if (resource === 'usuario' || write) {
    if (actor.perfil !== 'administrador' && !(maintenance && actor.perfil === 'operador')) throw denied();
  }
  return tenant;
}
async function checkActor(tx: CadastroTransaction, context: WriteContext) {
  const current = await tx.find('usuario', context.actor.id, context.actor.empresa_id);
  if (!current?.ativo || current.perfil !== context.actor.perfil) throw denied();
}
const parents: Partial<Record<Resource, { resource: Resource; field: string }>> = {
  setor: { resource: 'unidade', field: 'unidade_id' },
  ambiente: { resource: 'setor', field: 'setor_id' },
  dispositivo: { resource: 'ambiente', field: 'ambiente_id' },
};
async function checkParents(tx: CadastroTransaction, resource: Resource, data: Fields, tenant: number) {
  let current = parents[resource]; let record = data;
  while (current) {
    const parent = await tx.find(current.resource, Number(record[current.field]), tenant);
    if (!parent) throw notFound();
    if (data.ativo !== false && !parent.ativo) throw new HttpError(409, 'VINCULO_INATIVO', 'O cadastro exige uma hierarquia ativa.');
    record = parent; current = parents[current.resource];
  }
}
async function passwordFields(fields: Fields): Promise<Fields> {
  if (!('senha' in fields)) return fields;
  const { senha, ...rest } = fields;
  return { ...rest, senha_hash: await argon2.hash(String(senha), { type: argon2.argon2id }) };
}
async function recordAudit(tx: CadastroTransaction, context: WriteContext, resource: Resource, before: Cadastro | null, after: Cadastro, passwordChanged = false) {
  await tx.audit({ empresaId: resource === 'empresa' ? after.id : after.empresa_id ?? null, usuarioId: context.actor.id, acao: !before ? 'criar' : before.ativo && !after.ativo ? 'desativar' : !before.ativo && after.ativo ? 'reativar' : 'editar', entidade: resource, entidadeId: after.id, antes: before, depois: passwordChanged ? { ...after, senha_alterada: true } : after, ip: context.ip });
}

export function createCadastroService(repository: CadastroRepository) {
  return {
    list(resource: Resource, actor: Principal, page: Page) { return repository.list(resource, authorize(resource, actor, false), page); },
    async get(resource: Resource, id: number, actor: Principal) {
      const row = await repository.find(resource, id, authorize(resource, actor, false));
      if (!row) throw notFound();
      return row;
    },
    async create(resource: Resource, input: unknown, context: WriteContext) {
      const tenant = authorize(resource, context.actor, true);
      if (resource === 'empresa') {
        const { administrador, ...company } = parse(companyCreation, input);
        const admin = await passwordFields({ ...administrador, perfil: 'administrador' });
        return repository.transaction(async tx => {
          await checkActor(tx, context);
          const id = await tx.insert('empresa', company);
          const companyRow = (await tx.find('empresa', id, null))!;
          const userId = await tx.insert('usuario', { ...admin, empresa_id: id });
          const user = (await tx.find('usuario', userId, id))!;
          await recordAudit(tx, context, 'empresa', null, companyRow);
          await recordAudit(tx, context, 'usuario', null, user, true);
          return { ...companyRow, administrador: user };
        });
      }
      const data = validateFields(resource, input);
      if (resource === 'ambiente') validateRanges(data);
      const fields = await passwordFields(data);
      return repository.transaction(async tx => {
        // Uma trava por empresa serializa mutações da hierarquia e a proteção do último administrador.
        await tx.lockCompany(tenant!, true);
        await checkActor(tx, context);
        await checkParents(tx, resource, fields, tenant!);
        const id = await tx.insert(resource, { ...fields, empresa_id: tenant });
        const after = (await tx.find(resource, id, tenant))!;
        await recordAudit(tx, context, resource, null, after, 'senha' in data);
        return after;
      });
    },
    async update(resource: Resource, id: number, input: unknown, context: WriteContext, maintenance = false) {
      const tenant = authorize(resource, context.actor, true, maintenance && resource === 'dispositivo');
      const data: Fields = maintenance ? parse(maintenanceSchema, input) : validateFields(resource, input, true);
      const fields = await passwordFields(data);
      return repository.transaction(async tx => {
        await tx.lockCompany(resource === 'empresa' ? id : tenant!, resource !== 'empresa');
        await checkActor(tx, context);
        const before = await tx.find(resource, id, tenant);
        if (!before) throw notFound();
        const merged = { ...before, ...fields };
        if (resource === 'ambiente') validateRanges(merged);
        if (resource !== 'empresa') await checkParents(tx, resource, merged, tenant!);
        if (resource === 'usuario' && before.ativo && before.perfil === 'administrador' && (!merged.ativo || merged.perfil !== 'administrador') && await tx.countActiveAdmins(tenant!) <= 1) {
          throw new HttpError(409, 'ULTIMO_ADMINISTRADOR', 'Mantenha ao menos um administrador ativo na empresa.');
        }
        await tx.update(resource, id, tenant, fields);
        if (resource === 'usuario' && ('senha' in data || 'email' in data || data.ativo === false)) await tx.revokeUserSessions(id);
        const after = (await tx.find(resource, id, tenant))!;
        await recordAudit(tx, context, resource, before, after, 'senha' in data);
        return after;
      });
    },
  };
}
export type CadastroService = ReturnType<typeof createCadastroService>;
