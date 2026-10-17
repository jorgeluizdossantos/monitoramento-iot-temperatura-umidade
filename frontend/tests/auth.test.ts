import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { allowedRoles, forgetSession, homeFor, loginSchema, refreshSession, safeDestination, signIn, signOut, useAuth, type Principal } from '../src/features/auth/auth';
import { queryClient } from '../src/shared/api/query-client';
const user: Principal = { id: 1, empresa_id: 1, nome: 'Teste', email: 'teste@example.com', perfil: 'leitor' };
beforeEach(forgetSession);
afterEach(() => vi.unstubAllGlobals());
it('limita destino a rotas internas conhecidas e preserva consulta', () => {
  expect(safeDestination('/ambientes/25/historico?de=2026-01-01', '/painel')).toContain('?de=');
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/entrar', null]) expect(safeDestination(value, '/painel')).toBe('/painel');
});
it('mantém superadmin fora dos painéis e pendências fora do administrador', () => {
  expect(allowedRoles('/painel')).not.toContain('superadmin');
  expect(allowedRoles('/cadastros/pendentes')).toEqual(['superadmin']);
  expect(allowedRoles('/cadastros/usuarios')).toEqual(['administrador']);
  expect(homeFor({ ...user, perfil: 'superadmin', empresa_id: null })).toBe('/cadastros/empresas');
});
it('valida login sem impor política de criação à senha existente', () => {
  expect(loginSchema.safeParse({ email: 'teste@example.com', senha: 'curta' }).success).toBe(true);
  expect(loginSchema.safeParse({ email: 'inválido', senha: '' }).success).toBe(false);
});
it('restaura sessão e limpa dados da identidade anterior', async () => {
  queryClient.setQueryData(['painel'], { secreto: true });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ usuario: user }))));
  await refreshSession();
  expect(useAuth.getState().user).toEqual(user);
  expect(queryClient.getQueryData(['painel'])).toBeUndefined();
});
it('diferencia indisponibilidade de ausência de sessão', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  await refreshSession();
  expect(useAuth.getState().status).toBe('error');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
  await refreshSession();
  expect(useAuth.getState().status).toBe('anonymous');
});
it('não anuncia logout quando o servidor falha', async () => {
  useAuth.setState({ user, status: 'authenticated' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
  await expect(signOut()).rejects.toMatchObject({ status: 503 });
  expect(useAuth.getState().user).toEqual(user);
});
it('resposta 401 antiga não apaga um login novo', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; })).mockResolvedValueOnce(new Response(JSON.stringify({ usuario: user }))));
  const pending = refreshSession();
  await signIn({ email: user.email, senha: 'teste' });
  finish(new Response('{}', { status: 401 }));
  await pending;
  expect(useAuth.getState().status).toBe('authenticated');
  expect(useAuth.getState().user).toEqual(user);
});

it('não consulta sessão enquanto o login está pendente', async () => {
  let finish!: (response: Response) => void;
  const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  const pending = signIn({ email: user.email, senha: 'teste' });
  await refreshSession();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  finish(new Response(JSON.stringify({ usuario: user })));
  await pending;
  expect(useAuth.getState().user).toEqual(user);
});

it('preserva sessão conhecida durante falha de rede e revoga quando a API retorna 401', async () => {
 useAuth.setState({user,status:'authenticated'});
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));
 await refreshSession();expect(useAuth.getState().user).toEqual(user);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:401})));
 await refreshSession();expect(useAuth.getState().user).toBeNull();
});
