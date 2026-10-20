import { Component, type ReactNode } from 'react';
export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className="surface session-screen"><h1>Não foi possível abrir esta página</h1><p role="alert">Recarregue a página para tentar novamente. Se o problema continuar, entre em contato com o administrador.</p><button className="primary-button" onClick={() => window.location.reload()}>Recarregar página</button></section>;
    return this.props.children;
  }
}
