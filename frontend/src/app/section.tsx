import { useLocation } from 'react-router-dom';
import { Activity, ArrowRight, ShieldCheck } from 'lucide-react';

export const sections: Record<string, { title: string; description: string; phase: string }> = {
  '/painel': { title: 'Painel geral', description: 'Temperatura, umidade e situação dos ambientes em um só lugar.', phase: 'Fase 4 · Painel em tempo real' },
  '/entrar': { title: 'Acesso ao sistema', description: 'Acesso individual para acompanhar os ambientes da sua empresa.', phase: 'Fase 2 · Login e perfis' },
  '/alertas': { title: 'Central de alertas', description: 'Acompanhe desvios e o histórico de reconhecimento dos alertas.', phase: 'Fase 5 · Histórico, gráficos e alertas' },
  '/cadastros': { title: 'Cadastros e comissionamento', description: 'Organize a estrutura de monitoramento e seus dispositivos.', phase: 'Fase 3 · Cadastros' },
  '/demo': { title: 'Demonstração', description: 'Conheça o monitoramento com dados demonstrativos, somente para leitura.', phase: 'Fase 6 · Acabamento e demonstração' },
};

export default function Section() {
  const { pathname } = useLocation();
  const section = sections[pathname] ?? (
    /^\/ambientes\/[^/]+\/historico$/.test(pathname)
      ? { title: 'Histórico do ambiente', description: 'Consulte leituras por período e acompanhe a evolução das medições.', phase: 'Fase 5 · Histórico, gráficos e alertas' }
      : /^\/ambientes\/[^/]+$/.test(pathname)
        ? { title: 'Detalhes do ambiente', description: 'Medições, situação do dispositivo e acompanhamento do ambiente.', phase: 'Fase 4 · Painel em tempo real' }
        : /^\/cadastros\/[^/]+$/.test(pathname) ? sections['/cadastros'] : undefined
  );
  return <>
    <div className="eyebrow">MONITORAMENTO AMBIENTAL / {section ? 'VISÃO GERAL' : 'NAVEGAÇÃO'}</div>
    <h1 tabIndex={-1}>{section?.title ?? 'Página não encontrada'}</h1>
    <p className="intro">{section?.description ?? 'Use o menu para acessar uma seção do STMA.'}</p>
    <section className="surface empty-state" aria-labelledby="state-title">
      <div className="instrument"><Activity size={32} aria-hidden="true"/></div>
      <span className="badge">Interface em construção</span>
      <h2 id="state-title">{section ? 'Este espaço está sendo preparado' : 'Este endereço não está disponível'}</h2>
      <p>{section ? 'As funcionalidades serão disponibilizadas por etapas. Nenhuma leitura ou sessão está sendo simulada nesta tela.' : 'Confira o endereço ou volte para uma das seções disponíveis.'}</p>
      {section && <div className="next-step"><ArrowRight size={16} aria-hidden="true"/>{section.phase}</div>}
    </section>
    <div className="foundation-note"><ShieldCheck size={19} aria-hidden="true"/><p>Estrutura inicial de navegação. O acesso por perfil será habilitado junto com a autenticação.</p></div>
  </>;
}
