import { AlertTriangle, Eye, EyeOff, Globe, Lock, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import type { HealthResponse, UserInfo } from '../../shared/types';
import { api, ApiError } from '../lib/apiClient';
import { getBrowserTimeZone } from '../lib/timeFormat';
import { BrandLogo } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginViewProps {
  health: HealthResponse | null;
  sessionMessage: string | null;
  onSuccess: (user: UserInfo) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  health,
  sessionMessage,
  onSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timeZone = getBrowserTimeZone();

  const isUpstreamBlocked =
    health !== null && (!health.upstreamConfigured || !health.tlsReady);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setErrorMsg('Ingresa tu correo o usuario y tu contraseña.');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await api.signIn({
        username: cleanUser,
        password,
        timeZone,
      });
      setPassword('');
      onSuccess(res.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('No se pudo iniciar sesión. Intenta nuevamente.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex flex-col justify-between">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <BrandLogo />
          <div className="flex items-center gap-3">
            <PWAInstallButton compact />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-4xl grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-12">
          <section className="bg-[#0F2544] p-7 text-white lg:col-span-5 lg:p-9 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-sky-300">Control de Jornada</p>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                Gestión diaria de tareas y hoja de horas
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Registra tu entrada, controla cronómetros por asignación, ajusta tiempo real en HH:mm y sincroniza tu hoja desde cualquier dispositivo.
              </p>
            </div>

            <div className="mt-8 space-y-3 border-t border-white/10 pt-5 text-xs text-slate-300">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                <span>Sesión aislada por proxy seguro (HttpOnly + CSRF)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Globe className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                <span>Zona horaria detectada: <strong className="font-mono text-white">{timeZone}</strong></span>
              </div>
              <div className="flex items-center gap-2.5">
                <Lock className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                <span>Tu contraseña nunca se almacena en el navegador</span>
              </div>
            </div>
          </section>

          <section className="p-7 sm:p-9 lg:col-span-7">
            <h2 className="font-display text-xl font-bold tracking-tight text-[#1565C0]">
              Iniciar Sesión
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Accede con tus credenciales corporativas de BT-Time.
            </p>

            {sessionMessage && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {sessionMessage}
              </div>
            )}

            {isUpstreamBlocked && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Configuración de servidor pendiente</p>
                  <p className="mt-0.5">{health?.tlsWarning}</p>
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-medium text-slate-700"
                >
                  Usuario
                </label>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="nombre.apellido@empresa.com"
                  className="mt-1.5 block w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-slate-700"
                >
                  Contraseña
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ingresa tu contraseña"
                    className="block w-full min-h-[44px] rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] rounded-lg bg-[#1565C0] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0D47A1] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1565C0]"
              >
                {submitting ? 'Verificando acceso...' : 'Iniciar Sesión'}
              </button>
            </form>
          </section>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-slate-500">
        BT-Time Neo · Cliente Web PWA Seguro
      </footer>
    </div>
  );
};
