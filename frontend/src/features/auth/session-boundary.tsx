import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { allowedRoles, homeFor, refreshSession, useAuth } from './auth';

export function SessionBoundary({ children }: { children: ReactNode }) {
  const status = useAuth(state => state.status);
  const error = useAuth(state => state.error);
  useEffect(() => {
    void refreshSession();
    const check = () => { if (document.visibilityState === 'visible') void refreshSession(); };
    const timer = window.setInterval(check, 60000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, []);
  if (status === 'loading') return <div className="session-screen" role="status">Verificando sua sessão…</div>;
  if (status === 'error') return <div className="session-screen"><h1>Não foi possível verificar o acesso</h1><p role="alert">{error}</p><button className="primary-button" onClick={() => void refreshSession()}>Tentar novamente</button></div>;
  return children;
}
export function Guard({ children }: { children: ReactNode }) {
  const user = useAuth(state => state.user);
  const location = useLocation();
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname + location.search + location.hash }}/>;
  const roles = allowedRoles(location.pathname);
  if (roles && !roles.includes(user.perfil)) return <AccessDenied/>;
  return children;
}
export function AccessDenied() {
  const user = useAuth(state => state.user);
  return <section className="surface empty-state"><h1>Acesso não permitido</h1><p>Seu perfil não tem permissão para acessar esta seção.</p><Link className="primary-button" to={user ? homeFor(user) : '/entrar'}>Voltar ao início</Link></section>;
}
