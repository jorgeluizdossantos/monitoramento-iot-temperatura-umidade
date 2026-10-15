import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { request } from '../src/shared/api/client';
afterEach(() => vi.unstubAllGlobals());
it('valida contrato e usa cookie sem token no armazenamento do navegador', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ valor: 12 })));
  vi.stubGlobal('fetch', fetch);
  expect(await request('/teste', z.object({ valor: z.number() }))).toEqual({ valor: 12 });
  expect(fetch).toHaveBeenCalledWith('/api/v1/teste', expect.objectContaining({ credentials: 'same-origin' }));
});
it('preserva status, código e campos de erro para futuras telas', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ erro: { codigo: 'VALIDACAO', mensagem: 'Confira os campos.', campos: ['nome'] } }), { status: 400 })));
  await expect(request('/teste', z.unknown())).rejects.toMatchObject({ status: 400, code: 'VALIDACAO', fields: ['nome'] });
});
it('não aceita JSON de sucesso incompatível com o contrato', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ valor: 'inválido' }))));
  await expect(request('/teste', z.object({ valor: z.number() }))).rejects.toMatchObject({ code: 'CONTRATO_INVALIDO' });
});
it('aceita logout sem corpo e diferencia falha de rede', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockRejectedValueOnce(new TypeError('fetch')));
  await expect(request('/auth/logout', z.undefined(), { method: 'POST', body: '{}' })).resolves.toBeUndefined();
  await expect(request('/teste', z.unknown())).rejects.toMatchObject({ status: 0, code: 'REDE_INDISPONIVEL' });
});
