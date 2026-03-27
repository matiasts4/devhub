'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Cpu, Shield, Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Por favor completa todos los campos.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 900));
    login(email);
    setLoading(false);
    router.push('/auth/verify-2fa');
  };

  return (
    <div className="min-h-screen bg-[#0D1117] dot-grid flex items-center justify-center px-4">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#58A6FF]/4 rounded-full blur-[80px]" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-[#3FB950]/3 rounded-full blur-[80px]" />
      </div>

      <div className="relative w-full max-w-sm fade-in-up">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#58A6FF]/10 border border-[#58A6FF]/20 mb-4">
            <Cpu className="w-6 h-6 text-[#58A6FF]" strokeWidth={1.5} />
          </div>
          <h1 className="font-mono text-xl font-bold text-[#F0F6FC] mb-1">DevNexus AI</h1>
          <p className="text-sm text-[#8B949E]">Inicia sesión para continuar</p>
        </div>

        {/* Card */}
        <div className="bg-[#161B26] border border-[#21262D] rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-[#8B949E] mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#484F58]" strokeWidth={1.5} />
                <input
                  data-testid="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@devnexus.ai"
                  autoComplete="email"
                  className="w-full bg-[#0D1117] border border-[#21262D] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#F0F6FC] placeholder-[#484F58] focus:outline-none focus:border-[#58A6FF]/50 focus:ring-1 focus:ring-[#58A6FF]/20 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-[#8B949E] mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#484F58]" strokeWidth={1.5} />
                <input
                  data-testid="login-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-[#0D1117] border border-[#21262D] rounded-lg pl-9 pr-10 py-2.5 text-sm text-[#F0F6FC] placeholder-[#484F58] focus:outline-none focus:border-[#58A6FF]/50 focus:ring-1 focus:ring-[#58A6FF]/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#484F58] hover:text-[#8B949E] transition-colors"
                >
                  {showPass
                    ? <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                    : <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                  }
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className="relative">
                  <input
                    data-testid="login-remember"
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded border transition-all ${remember ? 'bg-[#58A6FF] border-[#58A6FF]' : 'bg-[#0D1117] border-[#30363D] group-hover:border-[#484F58]'}`}>
                    {remember && (
                      <svg className="w-3 h-3 text-white absolute top-0.5 left-0.5" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-xs text-[#8B949E] group-hover:text-[#F0F6FC] transition-colors">Recordarme</span>
              </label>
              <button
                type="button"
                data-testid="forgot-password-link"
                onClick={() => {}}
                className="text-xs text-[#58A6FF] hover:text-[#79B8FF] transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {/* Error */}
            {error && (
              <div
                data-testid="login-error"
                className="flex items-center gap-2 bg-[#F778BA]/8 border border-[#F778BA]/20 rounded-lg px-3 py-2.5"
              >
                <AlertCircle className="w-3.5 h-3.5 text-[#F778BA] flex-shrink-0" strokeWidth={1.5} />
                <p className="text-xs text-[#F778BA]">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#238636] hover:bg-[#2EA043] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-all active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" strokeWidth={2} />
                  <span>Iniciar sesión</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* 2FA notice */}
        <div className="mt-4 flex items-center gap-2 justify-center">
          <Shield className="w-3.5 h-3.5 text-[#3FB950]" strokeWidth={1.5} />
          <p className="text-[11px] text-[#484F58]">
            Se requerirá verificación de dos factores
          </p>
        </div>

        {/* Demo hint */}
        <div className="mt-4 bg-[#E3B341]/6 border border-[#E3B341]/15 rounded-xl p-3 text-center">
          <p className="text-[10px] text-[#E3B341]/80 font-mono">
            Demo — usa cualquier email + contraseña (min. 6 chars)
          </p>
        </div>
      </div>
    </div>
  );
}
