import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation } from 'react-router-dom';
import { Activity, ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { ApiError } from '../../shared/api/client';
import { homeFor, loginSchema, safeDestination, signIn, useAuth, type LoginValues } from './auth';

export default function Login() {
  const user = useAuth(state => state.user);
  const status = useAuth(state => state.status);
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  if (status === 'authenticated' && user) return <Navigate replace to={safeDestination(location.state?.from, homeFor(user))}/>;
  async function submit(values: LoginValues) {
    try { await signIn(values); }
    catch (error) {
      setError('root', { message: error instanceof ApiError ? error.message : 'Não foi possível entrar. Tente novamente.' });
    }
  }
  return <div className="login-layout">
    <div className="login-story"><span className="brand-mark"><Activity size={28} aria-hidden="true"/></span><p className="eyebrow">TELEMETRIA E MONITORAMENTO IoT</p><h1>Seu ambiente.<br/>Sob acompanhamento.</h1><p>Acesse o STMA para acompanhar temperatura, umidade e condições dos ambientes da sua empresa.</p><div className="login-assurance"><ShieldCheck aria-hidden="true"/><span>Acesso individual<br/><strong>Permissões por perfil</strong></span></div></div>
    <section className="surface login-card" aria-labelledby="login-title"><div className="login-card-icon"><LockKeyhole aria-hidden="true"/></div><h2 id="login-title">Entrar no STMA</h2><p>Informe suas credenciais para continuar.</p>
      {location.state?.from && <p className="session-notice">Entre para acessar a página solicitada.</p>}
      <form noValidate onSubmit={handleSubmit(submit)} aria-busy={isSubmitting}>
        <label htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} {...register('email')}/>
        {errors.email && <p id="email-error" className="field-error" role="alert">{errors.email.message}</p>}
        <label htmlFor="senha">Senha</label><div className="password-field"><input id="senha" type={visible ? 'text' : 'password'} autoComplete="current-password" aria-invalid={!!errors.senha} aria-describedby={errors.senha ? 'senha-error' : undefined} {...register('senha')}/><button type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div>
        {errors.senha && <p id="senha-error" className="field-error" role="alert">{errors.senha.message}</p>}
        {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
        <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Entrando…' : 'Entrar'}<ArrowRight size={18} aria-hidden="true"/></button>
      </form><p className="login-help">Precisa de acesso? Entre em contato com o administrador responsável pelo sistema.</p>
    </section>
  </div>;
}
