import { Link } from 'react-router-dom';
import { homeFor, useAuth } from '../features/auth/auth';
export default function Section() {
  const user=useAuth(state=>state.user);
  return <section className="surface empty-state"><h1>Página não encontrada</h1><p>Confira o endereço ou use o menu para acessar uma seção do STMA.</p><Link className="primary-button" to={user?homeFor(user):'/demo'}>Voltar ao início</Link></section>;
}
