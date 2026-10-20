import { expect, it, vi } from 'vitest';
import { createControlService, type ControlDevice } from '../src/modules/telemetria/control.service';
import type { Principal } from '../src/modules/auth/auth.repository';
const actor: Principal = { id: 1, empresa_id: 2, nome: 'Teste', email: 'test@example.com', perfil: 'operador' };
const device: ControlDevice = { device_id: 'esp32-001', led_aceso: false, limite_led: null, controle_recebido_em: new Date(), controle_comando_id: null, status_conexao: 'online', ativo: 1, em_manutencao: 0 };
function setup(row = device) { const repository = { device: vi.fn(async () => row), audit: vi.fn(async () => {}) }; const publish = vi.fn(async () => {}); return { repository, publish, service: createControlService(repository, publish, ['esp32-001']) }; }
it('comando usa empresa da sessão, audita intenção e publica UUID com validade', async () => {
  const { service, repository, publish } = setup();
  const result = await service.send(3, { tipo: 'led', valor: true }, actor, null);
  expect(repository.device).toHaveBeenCalledWith(3, 2);
  expect(repository.audit).toHaveBeenCalledOnce();
  expect(publish.mock.calls[0]).toEqual(['esp32-001', expect.stringMatching(new RegExp(`^${result.comando_id}\\|[0-9]+\\|led\\|L$`))]);
});
it('recusa leitor, valores inválidos, automático e estado vencido', async () => {
  await expect(setup().service.send(3, { tipo: 'led', valor: true }, { ...actor, perfil: 'leitor' }, null)).rejects.toMatchObject({ status: 403 });
  await expect(setup().service.send(3, { tipo: 'limite', valor: 51 }, actor, null)).rejects.toMatchObject({ status: 400 });
  await expect(setup({ ...device, limite_led: 28 }).service.send(3, { tipo: 'led', valor: true }, actor, null)).rejects.toMatchObject({ status: 409 });
  await expect(setup({ ...device, controle_recebido_em: new Date(0) }).service.send(3, { tipo: 'limite', valor: null }, actor, null)).rejects.toMatchObject({ status: 409 });
  // Expressões booleanas podem retornar "0" no MySQL remoto com bigNumberStrings.
  await expect(setup({ ...device, ativo: '0' }).service.send(3, { tipo: 'led', valor: true }, actor, null)).rejects.toMatchObject({ status: 409 });
});
it('falha do broker não anuncia confirmação de execução', async () => {
  const { service, publish } = setup(); publish.mockRejectedValueOnce(new Error('offline'));
  await expect(service.send(3, { tipo: 'led', valor: true }, actor, null)).rejects.toMatchObject({ status: 503 });
});
