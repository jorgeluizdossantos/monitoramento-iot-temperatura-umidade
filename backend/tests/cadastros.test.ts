import { expect, it, vi } from 'vitest';
import * as argon2 from 'argon2';
import { parse, pageSchema, validateFields, validateRanges } from '../src/modules/cadastros/cadastro.validation';
import { createBootstrapService } from '../src/modules/cadastros/bootstrap.service';

it('campos de autoridade e telemetria não podem ser atribuídos em massa', () => {
  expect(() => validateFields('unidade', { nome: 'Unidade', empresa_id: 123 })).toThrow('Dados inválidos');
  expect(() => validateFields('usuario', { nome: 'User', email: 'user@example.com', senha: 'senha-longa-123', perfil: 'superadmin' })).toThrow();
  expect(() => validateFields('dispositivo', { status_conexao: 'online' }, true)).toThrow();
  expect(() => validateFields('empresa', { eh_demo: true }, true)).toThrow();
});
it('campos do schema são validados sem arredondamento silencioso', () => {
  expect(() => validateFields('ambiente', { temp_min_ideal: 12.34 }, true)).toThrow();
  expect(() => validateFields('ambiente', { umid_min_ideal: -1 }, true)).toThrow();
  expect(() => validateFields('ambiente', { temp_max_ideal: 101 }, true)).toThrow();
  expect(() => validateFields('ambiente', { temp_tolerancia: 100 }, true)).toThrow();
  expect(() => validateFields('unidade', { fuso_horario: 'not/a/zone' }, true)).toThrow();
  expect(() => validateFields('dispositivo', { intervalo_leitura_seg: 1 }, true)).toThrow();
  expect(() => validateFields('dispositivo', { offline_apos_seg: 86401 }, true)).toThrow();
  expect(() => validateFields('dispositivo', { device_id: 'ESP32!' }, true)).toThrow();
  expect(() => validateFields('empresa', { cnpj: 'invalid' }, true)).toThrow();
  expect(validateFields('empresa', { cnpj: 'ABCDEFGHIJKL12' }, true).cnpj).toBe('ABCDEFGHIJKL12');
});
it('faixas opcionais aceitam null; combinação final deve manter mínimo <= máximo', () => {
  expect(() => validateRanges({ temp_min_ideal: null, temp_max_ideal: 20 })).not.toThrow();
  expect(() => validateRanges({ temp_min_ideal: 21, temp_max_ideal: 20 })).toThrow('limite mínimo');
  expect(() => validateRanges({ umid_min_ideal: 80, umid_max_ideal: 40 })).toThrow('limite mínimo');
  expect(() => validateFields('ambiente', {}, true)).toThrow('ao menos um campo');
});
it('paginação limita tamanho e rejeita parâmetros de empresa enviados pelo cliente', () => {
  expect(parse(pageSchema, {})).toEqual({ pagina: 1, tamanho: 20, incluir_inativos: false });
  expect(parse(pageSchema, { pagina: '2', tamanho: '500', incluir_inativos: 'true' })).toEqual({ pagina: 2, tamanho: 500, incluir_inativos: true });
  expect(() => parse(pageSchema, { tamanho: '501' })).toThrow();
  expect(() => parse(pageSchema, { pagina: '0' })).toThrow();
  expect(() => parse(pageSchema, { empresa_id: '2' })).toThrow();
});
it('bootstrap valida entrada e entrega apenas Argon2id ao repositório', async () => {
  const save = vi.fn(async () => 10);
  const bootstrap = createBootstrapService({ createFirstSuperadmin: save });
  await expect(bootstrap({ nome: 'Teste', email: 'BOOT@example.com', senha: 'senha-bootstrap-123' })).resolves.toBe(10);
  const account = save.mock.calls[0] as unknown as [{ email: string; senha_hash: string; senha?: string }];
  expect(account[0].email).toBe('boot@example.com');
  expect(account[0].senha).toBeUndefined();
  expect(account[0].senha_hash).toMatch(/^\$argon2id\$/);
  expect(await argon2.verify(account[0].senha_hash, 'senha-bootstrap-123')).toBe(true);
  await expect(bootstrap({ nome: 'Teste', email: 'valid@example.com', senha: 'curta' })).rejects.toThrow();
});
