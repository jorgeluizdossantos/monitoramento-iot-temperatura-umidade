import { z } from 'zod';

const errorSchema = z.object({ erro: z.object({ codigo: z.string(), mensagem: z.string(), campos: z.array(z.string()) }) });
let sessionGeneration = 0;
const unauthorizedListeners = new Set<() => void>();
export const invalidateHttpSession = () => { sessionGeneration += 1; };
export function onUnauthorized(listener: () => void) { unauthorizedListeners.add(listener); return () => { unauthorizedListeners.delete(listener); }; }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: string[] = []) { super(message); }
}

// O schema valida o JSON em execução; um cast TypeScript não verificaria o contrato.
export async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Caminho relativo da API obrigatório.');
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let response: Response;
  const generation = sessionGeneration;
  try {
    response = await fetch(`/api/v1${path}`, { ...init, signal: init.signal ?? AbortSignal.timeout(15000), credentials: 'same-origin', headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'REDE_INDISPONIVEL', 'Não foi possível conectar ao servidor.');
  }
  const body: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    // Uma resposta antiga não pode derrubar uma sessão iniciada depois dela.
    if (response.status === 401 && path !== '/auth/login' && generation === sessionGeneration) unauthorizedListeners.forEach(listener => listener());
    const parsed = errorSchema.safeParse(body);
    if (parsed.success) throw new ApiError(response.status, parsed.data.erro.codigo, parsed.data.erro.mensagem, parsed.data.erro.campos);
    throw new ApiError(response.status, 'RESPOSTA_INVALIDA', 'O servidor não conseguiu atender à solicitação.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(response.status, 'CONTRATO_INVALIDO', 'A resposta do servidor tem um formato inesperado.');
  return parsed.data;
}
