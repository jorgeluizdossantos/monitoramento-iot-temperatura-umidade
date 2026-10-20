import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Principal } from '../auth/auth.repository';
import { companyId } from '../auth/auth.scope';
import { HttpError } from '../../shared/http-error';
import { parse } from '../cadastros/cadastro.validation';
export interface ControlDevice { device_id: string; led_aceso: boolean | number | null; limite_led: number | string | null; controle_recebido_em: Date | null; controle_comando_id: string | null; status_conexao: string; ativo: boolean | number | string; em_manutencao: boolean | number }
export interface ControlRepository { device(id: number, company: number): Promise<ControlDevice>; audit(company: number, actor: number, id: number, data: unknown, ip: string | null): Promise<void> }
export const commandSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('led'), valor: z.boolean() }).strict(),
  z.object({ tipo: z.literal('limite'), valor: z.number().finite().min(0).max(50).multipleOf(0.1).nullable() }).strict(),
]);

export function createControlService(repository: ControlRepository, publish: (device: string, payload: string) => Promise<void>, allowed: string[]) {
  return {
    async state(id: number, actor: Principal) { const row = await repository.device(id, companyId(actor)); return { led: row.led_aceso == null ? null : !!row.led_aceso, limite: row.limite_led == null ? null : Number(row.limite_led), recebido_em: row.controle_recebido_em, comando_id: row.controle_comando_id }; },
    async send(id: number, input: unknown, actor: Principal, ip: string | null) {
      const company = companyId(actor), command = parse(commandSchema, input);
      if (!['administrador', 'operador'].includes(actor.perfil)) throw new HttpError(403, 'ACESSO_NEGADO', 'Comando exige operador ou administrador.');
      const row = await repository.device(id, company);
      if (Number(row.ativo) !== 1 || Number(row.em_manutencao) !== 0 || row.status_conexao !== 'online' || !row.controle_recebido_em || Date.now() - new Date(row.controle_recebido_em).getTime() > 30000) throw new HttpError(409, 'DISPOSITIVO_INDISPONIVEL', 'Aguarde um estado recente do dispositivo ativo e fora de manutenção.');
      if (allowed.length && !allowed.includes(row.device_id)) throw new HttpError(409, 'DISPOSITIVO_NAO_CONFIGURADO', 'Dispositivo fora da configuração MQTT deste backend.');
      if (command.tipo === 'led' && row.limite_led != null) throw new HttpError(409, 'AUTOMATICO_ATIVO', 'Desative o automático antes do comando manual.');
      const commandId = randomUUID(), expires = Math.floor(Date.now() / 1000) + 15;
      const value = command.tipo === 'led' ? command.valor ? 'L' : 'l' : command.valor == null ? 'off' : command.valor.toFixed(1);
      await repository.audit(company, actor.id, id, { ...command, comando_id: commandId, expira_em: expires }, ip);
      try { await publish(row.device_id, `${commandId}|${expires}|${command.tipo}|${value}`); }
      catch { throw new HttpError(503, 'BROKER_INDISPONIVEL', 'Envio não confirmado. Confira o estado do dispositivo antes de tentar novamente.'); }
      return { comando_id: commandId };
    }
  };
}
export type ControlService = ReturnType<typeof createControlService>;
