import { create } from 'zustand';
import { z } from 'zod';
import { ApiError, invalidateHttpSession, onUnauthorized, request } from '../../shared/api/client';
import { queryClient } from '../../shared/api/query-client';

export const principalSchema = z.object({ id: z.number().int().positive(), empresa_id: z.number().int().positive().nullable(), nome: z.string(), email: z.string().email(), perfil: z.enum(['superadmin', 'administrador', 'operador', 'leitor']) });
export type Principal = z.infer<typeof principalSchema>;
export type Role = Principal['perfil'];
const responseSchema = z.object({ usuario: principalSchema });
export const loginSchema = z.object({ email: z.string().trim().email('Informe um e-mail válido.').max(255), senha: z.string().min(1, 'Informe sua senha.').max(1024, 'Senha acima do limite permitido.') });
export type LoginValues = z.infer<typeof loginSchema>;
type AuthState = { status: 'loading' | 'authenticated' | 'anonymous' | 'error'; user: Principal | null; error: string | null };
export const useAuth = create<AuthState>()(() => ({ status: 'loading', user: null, error: null }));
let revision = 0;
let refreshing: Promise<void> | undefined;
let signingIn = false;
function clearIdentity() { revision += 1; invalidateHttpSession(); queryClient.clear(); }
function accept(user: Principal) {
  if (JSON.stringify(useAuth.getState().user) !== JSON.stringify(user)) { clearIdentity(); }
  useAuth.setState({ status: 'authenticated', user, error: null });
}
export function forgetSession() { clearIdentity(); useAuth.setState({ status: 'anonymous', user: null, error: null }); }
const unsubscribe = onUnauthorized(forgetSession);
if (import.meta.hot) import.meta.hot.dispose(unsubscribe);

export function refreshSession(): Promise<void> {
  if (signingIn) return Promise.resolve();
  if (refreshing) return refreshing;
  const current = revision;
  refreshing = (async () => {
    try {
      const data = await request('/auth/me', responseSchema);
      if (current === revision) accept(data.usuario);
    } catch (error) {
      if (current !== revision) return;
      if (error instanceof ApiError && error.status === 401) forgetSession();
      else { clearIdentity(); useAuth.setState({ status: 'error', user: null, error: error instanceof Error ? error.message : 'Não foi possível verificar a sessão.' }); }
    } finally { refreshing = undefined; }
  })();
  return refreshing;
}
export async function signIn(values: LoginValues) {
  signingIn = true;
  clearIdentity();
  const current = revision;
  try {
    const data = await request('/auth/login', responseSchema, { method: 'POST', body: JSON.stringify(values) });
    if (current === revision) accept(data.usuario);
    return data.usuario;
  } finally { signingIn = false; }
}
export async function signOut() {
  try { await request('/auth/logout', z.undefined(), { method: 'POST', body: '{}' }); }
  catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error; }
  forgetSession();
}
export const homeFor = (user: Principal) => user.perfil === 'superadmin' ? '/cadastros/empresas' : '/painel';
export function safeDestination(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !/^\/(painel|alertas|ambientes|cadastros)(\/|\?|#|$)/.test(value) || /[\\\r\n]/.test(value)) return fallback;
  return value;
}
export function allowedRoles(path: string): Role[] | null {
  if (path === '/cadastros/empresas' || path === '/cadastros/pendentes') return ['superadmin'];
  if (path === '/cadastros') return ['superadmin', 'administrador'];
  if (/^\/cadastros\//.test(path)) return ['administrador'];
  if (/^\/(painel|alertas|ambientes)(\/|$)/.test(path)) return ['administrador', 'operador', 'leitor'];
  return null;
}
