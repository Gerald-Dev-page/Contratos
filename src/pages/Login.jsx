import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, LogIn, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logoCaja from '../public/Logo-caja.png';
import logoGerald from '../public/Logo-Gerald.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const { error } = await login(email.trim(), password);
      if (error) throw error;
      navigate('/');
    } catch (err) {
      setErrorMsg(
        err.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-egg)] flex flex-col justify-between p-6">
      <div className="flex-1 flex items-center justify-center">
        <div className="card-ergonomica w-full max-w-md p-8 shadow-xl bg-white border border-[var(--color-border-warm)]">
          
          {/* Encabezado con Logo Caja */}
          <div className="flex flex-col items-center mb-6">
            <img
              src={logoCaja}
              alt="Caja Social"
              className="h-12 w-auto object-contain mb-3"
            />
            <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Caja Social</h1>
            <p className="text-xs text-[var(--color-text-secondary)]">Sistema de Gestión de Contratos y Cobranzas</p>
          </div>

          {/* Mensaje de Error */}
          {errorMsg && (
            <div className="mb-5 p-3 rounded-lg bg-[var(--color-status-danger-bg)] border border-rose-200 text-xs text-[var(--color-status-danger)] flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                Correo Electrónico
              </label>
              <div className="relative flex items-center">
                <Mail size={16} className="absolute left-3 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@test.com"
                  className="input-ergonomico pl-9 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                Contraseña
              </label>
              <div className="relative flex items-center">
                <Lock size={16} className="absolute left-3 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-ergonomico pl-9 text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primario w-full mt-2 text-xs font-semibold py-2.5"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Verificando...
                </>
              ) : (
                <>
                  <LogIn size={15} /> Iniciar Sesión
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Footer institucional con Logo Gerald.Dev */}
      <div className="flex items-center justify-center gap-2 py-2">
        <span className="text-xs text-slate-400">Desarrollado para Caja Social por</span>
        <img src={logoGerald} alt="Gerald.Dev" className="h-4 w-auto opacity-70" />
      </div>
    </div>
  );
}