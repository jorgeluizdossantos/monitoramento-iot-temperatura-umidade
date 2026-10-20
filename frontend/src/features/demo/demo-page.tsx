import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CircleHelp, Thermometer, Droplets, WifiOff } from 'lucide-react';
import { date, labels, number } from '../painel/model';
import { loadDemo } from './model';
export default function DemoPage() {
  const query = useQuery({ queryKey: ['demo-publica'], queryFn: ({ signal }) => loadDemo(signal), retry: false });
  return <>
    <div className="eyebrow">CONHEÇA O STMA</div><h1>Demonstração</h1>
    <p className="intro">Monitoramento de ambientes com dados fictícios, somente para leitura. Explore os estados de temperatura, umidade e conexão.</p>
    <p className="demo-notice"><strong>Dados demonstrativos.</strong> Esta página não controla equipamentos nem exibe a bancada real.</p>
    <div className="list-toolbar"><p>Horários em America/Bahia. Valores sem conexão atual aparecem como última leitura.</p><button className="secondary-button" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Consultando…' : 'Atualizar demonstração'}</button></div>
    {query.isPending && <p role="status">Carregando demonstração…</p>}
    {query.isError && <div className="form-error" role="alert"><p>A demonstração está indisponível neste momento. Tente atualizar novamente.</p></div>}
    {query.data && !query.data.dados.length && <section className="surface empty-state"><h2>Nenhum ambiente demonstrativo disponível</h2><p>A demonstração será exibida quando houver dados cadastrados.</p></section>}
    <div className="room-grid">{query.data?.dados.map((row, index) => {
      const live = row.status_conexao === 'online' && row.ultima_leitura_em !== null;
      const state = live ? row.estado : 'sem_dados';
      const Icon = state === 'normal' ? CheckCircle2 : state === 'sem_dados' ? CircleHelp : AlertTriangle;
      return <article className="surface room-card" key={index} aria-label={`Ambiente demonstrativo ${row.ambiente}`}>
        <header><div><p>{row.empresa} / {row.unidade} / {row.setor}</p><h2>{row.ambiente}</h2></div><span className={`room-state state-${state}`}><Icon size={14} aria-hidden="true"/>{labels[state]}</span></header>
        <div className="device-reading"><p className="device-status">{live ? 'Online · dados fictícios' : <span><WifiOff size={14} aria-hidden="true"/>Sem conexão atual</span>}</p>
          {live ? <div className="metrics"><div><span><Thermometer size={16} aria-hidden="true"/>Temperatura</span><strong>{number(row.temperatura_c)}<small> °C</small></strong></div><div><span><Droplets size={16} aria-hidden="true"/>Umidade</span><strong>{number(row.umidade_pct)}<small> %</small></strong></div></div> : <p className="no-live-reading">Sem leitura atual confirmada.</p>}
          <p className="reading-time">Última leitura: {date(row.ultima_leitura_em)}{!live && row.ultima_leitura_em && <> · {number(row.temperatura_c)} °C / {number(row.umidade_pct)} % (histórico)</>}</p>
        </div>
      </article>;
    })}</div>
    <p className="phase-note">Para acompanhar seus ambientes e utilizar os recursos conforme seu perfil, <Link to="/entrar">entre no sistema</Link>.</p>
  </>;
}
