import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '../../shared/api/client';
import { useAuth } from '../auth/auth';
import { date, number } from '../painel/model';
const stateSchema = z.object({ dados: z.object({ led: z.boolean().nullable(), limite: z.number().nullable(), recebido_em: z.string().datetime().nullable(), comando_id: z.string().nullable() }) });
type Command = { tipo: 'led'; valor: boolean } | { tipo: 'limite'; valor: number | null };
export default function DeviceControl({ id, name }: { id: number; name: string }) {
  const user = useAuth(s => s.user)!;
  const [limit, setLimit] = useState('28');
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: ['controle', user.id, id], queryFn: ({ signal }) => request(`/dispositivos/${id}/controle`, stateSchema, { signal }), refetchInterval: 3000, retry: false });
  const state = query.data?.dados;
  const mutation = useMutation({ mutationFn: (command: Command) => request(`/dispositivos/${id}/controle`, z.object({ comando_id: z.string().uuid() }), { method: 'POST', body: JSON.stringify(command) }), onSuccess: result => { setPending(result.comando_id); setNotice('Enviado ao broker. Aguardando confirmação do ESP32…'); void query.refetch(); }, onError: () => setNotice('') });
  useEffect(() => {
    if (!pending) return;
    if (state?.comando_id === pending) { setPending(null); setNotice('Comando confirmado pelo ESP32.'); return; }
    const timer = setTimeout(() => { setPending(null); setNotice('Sem confirmação do ESP32. Confira o estado recebido antes de tentar novamente.'); }, 20000);
    return () => clearTimeout(timer);
  }, [pending, state?.comando_id]);
  const fresh = !!state?.recebido_em && Date.now() - Date.parse(state.recebido_em) < 30000 && !query.isError;
  const disabled = !fresh || !!pending || mutation.isPending;
  const canControl = ['administrador', 'operador'].includes(user.perfil);
  return <section className="surface editor"><h3>LED e controle automático · {name}</h3>
    <p>Último estado recebido: LED {state?.led == null ? 'desconhecido' : state.led ? 'aceso' : 'apagado'}. Automático: {state?.recebido_em ? state.limite == null ? 'desativado' : `a partir de ${number(state.limite)} °C` : 'desconhecido'}.</p>
    <p className="phase-note">{date(state?.recebido_em ?? null)}. {!fresh && 'Aguardando estado recente do firmware compatível.'}</p>
    {query.isError && <p className="form-error" role="alert">{query.error.message} Verifique se a ingestão MQTT está habilitada no backend.</p>}
    {canControl && <><div className="row-actions"><button className="secondary-button" disabled={disabled || state?.limite != null} onClick={() => mutation.mutate({ tipo: 'led', valor: !state?.led })}>{state?.led ? 'Apagar LED' : 'Acender LED'}</button><button className="secondary-button" disabled={disabled || state?.limite == null} onClick={() => mutation.mutate({ tipo: 'limite', valor: null })}>Desativar automático</button></div>
    <form className="panel-filters" onSubmit={e => { e.preventDefault(); const value = Number(limit); if (Number.isFinite(value) && value >= 0 && value <= 50) mutation.mutate({ tipo: 'limite', valor: value }); }}>
      <div className="form-field"><label htmlFor={`led-limit-${id}`}>Limite do LED (°C)</label><input id={`led-limit-${id}`} required type="number" min="0" max="50" step="0.1" value={limit} onChange={e => setLimit(e.target.value)}/></div><button className="primary-button" disabled={disabled}>Aplicar limite do LED</button>
    </form></>}
    <p className="phase-note">Este limite controla apenas o LED, com histerese de 0,5 °C. Não altera as faixas ideais nem os alertas do ambiente. Para controle manual, desative o automático.</p>
    {notice && <p role="status">{notice}</p>}{mutation.isError && <p role="alert" className="form-error">{mutation.error.message}</p>}
  </section>;
}
