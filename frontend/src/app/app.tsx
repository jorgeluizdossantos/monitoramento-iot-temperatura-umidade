import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, Bell, Boxes, LayoutDashboard, LogIn, Menu, Radio, X } from 'lucide-react';
const Section = lazy(() => import('./section'));
const links = [
  { to: '/painel', label: 'Painel geral', icon: LayoutDashboard },
  { to: '/alertas', label: 'Central de alertas', icon: Bell },
  { to: '/cadastros', label: 'Cadastros', icon: Boxes },
  { to: '/demo', label: 'Demonstração', icon: Radio },
  { to: '/entrar', label: 'Entrar', icon: LogIn },
];
function Shell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); document.title = `${links.find(link => link.to === pathname)?.label ?? 'Página não encontrada'} · STMA`; }, [pathname]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); document.getElementById('menu-toggle')?.focus(); } };
    if (open) window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  return <div className="shell">
    <a className="skip" href="#main">Ir para o conteúdo</a>
    <header className="mobile-bar"><div className="brand"><Activity aria-hidden="true"/><strong>STMA</strong></div><button id="menu-toggle" type="button" aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} aria-controls="navigation" onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button></header>
    <aside id="navigation" className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="brand desktop-brand"><span className="brand-mark"><Activity aria-hidden="true"/></span><div><strong>STMA</strong><span>TELEMETRIA IoT</span></div></div>
      <div className="nav-label">ESPAÇO DE MONITORAMENTO</div>
      <nav aria-label="Navegação principal">{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to}><Icon size={20} aria-hidden="true"/>{label}</NavLink>)}</nav>
      <div className="sidebar-footer"><span className="version">STMA / 0.1</span><p>Monitoramento de<br/>temperatura e umidade</p></div>
    </aside>
    <div className="workspace"><div className="topbar"><span>Supervisão de ambientes</span><span className="badge">Estrutura inicial</span></div>
      <main id="main" tabIndex={-1}><Suspense fallback={<p role="status">Carregando seção…</p>}><Routes><Route path="/" element={<Navigate to="/painel" replace/>}/><Route path="*" element={<Section/>}/></Routes></Suspense></main>
      <footer>STMA <span>Monitoramento remoto de temperatura e umidade</span></footer>
    </div>
  </div>;
}
export function App() { return <BrowserRouter><Shell/></BrowserRouter>; }
