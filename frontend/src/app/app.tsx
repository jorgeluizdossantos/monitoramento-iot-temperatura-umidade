import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, Bell, Boxes, LayoutDashboard, LogIn, Menu, Radio, X, LogOut } from 'lucide-react';
import { allowedRoles, homeFor, signOut, useAuth } from '../features/auth/auth';
import { Guard, SessionBoundary } from '../features/auth/session-boundary';
const Section = lazy(() => import('./section'));
const Cadastros = lazy(() => import('../features/cadastros/cadastros-page'));
const Login = lazy(() => import('../features/auth/login'));
const links = [
  { to: '/painel', label: 'Painel geral', icon: LayoutDashboard },
  { to: '/alertas', label: 'Central de alertas', icon: Bell },
  { to: '/cadastros', label: 'Cadastros', icon: Boxes },
  { to: '/cadastros/empresas', label: 'Empresas', icon: Boxes },
  { to: '/cadastros/pendentes', label: 'Placas pendentes', icon: Radio },
  { to: '/demo', label: 'Demonstração', icon: Radio },
  { to: '/entrar', label: 'Entrar', icon: LogIn },
];
function Shell() {
  const user = useAuth(state => state.user);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const { pathname } = useLocation();
  const visibleLinks = links.filter(link => {
    if (link.to === '/entrar') return !user;
    if (link.to === '/demo') return true;
    if (link.to === '/cadastros' && user?.perfil === 'superadmin') return false;
    const roles = allowedRoles(link.to);
    return !!user && (!roles || roles.includes(user.perfil));
  });
  async function logout() {
    setLeaving(true); setLogoutError('');
    try { await signOut(); }
    catch { setLogoutError('Não foi possível encerrar a sessão no servidor. Tente novamente.'); }
    finally { setLeaving(false); }
  }
  useEffect(() => { setOpen(false); document.title = `${links.find(link => link.to === pathname)?.label ?? (pathname.startsWith('/cadastros/') ? 'Cadastros' : pathname.startsWith('/ambientes/') ? 'Ambiente' : 'Página não encontrada')} · STMA`; }, [pathname]);
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
      <nav aria-label="Navegação principal">{visibleLinks.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/cadastros'}><Icon size={20} aria-hidden="true"/>{label}</NavLink>)}</nav>
      <div className="sidebar-footer"><span className="version">STMA / 0.1</span><p>Monitoramento de<br/>temperatura e umidade</p></div>
    </aside>
    <div className="workspace"><div className="topbar"><span>Supervisão de ambientes</span>{user ? <div className="user-menu"><div><strong>{user.nome}</strong><span>{({ superadmin: 'Superadministrador', administrador: 'Administrador', operador: 'Operador', leitor: 'Leitor' })[user.perfil]}</span></div><button type="button" className="logout-button" disabled={leaving} onClick={() => void logout()}><LogOut size={18} aria-hidden="true"/>{leaving ? 'Saindo…' : 'Sair'}</button></div> : <span className="badge">Acesso ao sistema</span>}</div>
      {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
      <main id="main" tabIndex={-1}><Suspense fallback={<p role="status">Carregando seção…</p>}><Routes>
        <Route path="/" element={<Navigate to={user ? homeFor(user) : '/entrar'} replace/>}/>
        <Route path="/entrar" element={<Login/>}/>
        <Route path="/demo" element={<Section/>}/>
        {['/painel', '/alertas', '/ambientes/:id', '/ambientes/:id/historico', '/cadastros', '/cadastros/:entidade'].map(path => <Route key={path} path={path} element={<Guard>{path.startsWith('/cadastros') ? <Cadastros/> : <Section/>}</Guard>}/>)}
        <Route path="*" element={<Section/>}/>
      </Routes></Suspense></main>
      <footer>STMA <span>Monitoramento remoto de temperatura e umidade</span></footer>
    </div>
  </div>;
}
export function App() { return <BrowserRouter><SessionBoundary><Shell/></SessionBoundary></BrowserRouter>; }
