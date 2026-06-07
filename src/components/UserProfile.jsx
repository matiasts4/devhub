/* eslint-disable no-unused-vars */
'use client';

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  User,
  LogOut,
  LogIn,
  UserPlus,
  ChevronDown,
  Settings,
  Cloud,
  Database,
  Check,
  X,
  Mail,
  Loader2,
  Brain,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/db/localClient';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';

export default function UserProfile({ align = 'right', direction = 'down' }) {
  const { user, workspaces, activeWorkspaceId, setActiveWorkspaceId, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Modal Auth States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // OTP Verification States
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpToken, setOtpToken] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error('Por favor ingresa tu correo electrónico');
      return;
    }
    setLoading(true);
    try {
      const db = createClient();
      const { error } = await db.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: authMode === 'signup',
        },
      });
      if (error) {
        toast.error('Error: ' + error.message);
      } else {
        toast.success('¡Código de verificación enviado! Revisa tu correo electrónico.');
        setIsOtpSent(true);
      }
    } catch (err) {
      console.error(err);
      toast.error('Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async (e) => {
    e.preventDefault();
    if (!otpToken) {
      toast.error('Por favor ingresa el código de verificación');
      return;
    }
    setVerifying(true);
    try {
      const db = createClient();
      const { data, error } = await db.auth.verifyOtp({
        email,
        token: otpToken,
        type: authMode === 'signup' ? 'signup' : 'magiclink',
      });
      if (error) {
        toast.error('Código incorrecto o expirado: ' + error.message);
      } else {
        toast.success('¡Sesión iniciada correctamente!');
        setShowAuthModal(false);
        setIsOtpSent(false);
        setOtpToken('');
        setEmail('');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al verificar el código');
    } finally {
      setVerifying(false);
    }
  };

  const closeAuthModal = () => {
    setShowAuthModal(false);
    setIsOtpSent(false);
    setEmail('');
    setOtpToken('');
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
    navigate('/hub');
  };

  const handleNavigate = (path) => {
    setIsOpen(false);
    navigate(path);
  };

  // Get user initial or default
  const initial = user?.email ? user.email[0].toUpperCase() : null;
  const activeWorkspaceName = workspaces.find((w) => w.id === activeWorkspaceId)?.name || 'Local';

  // Determine avatar background color dynamically based on email
  const getAvatarBg = () => {
    if (!user?.email) return 'bg-[#4e4f50]';
    const colors = [
      'bg-indigo-600',
      'bg-blue-600',
      'bg-violet-600',
      'bg-purple-600',
      'bg-fuchsia-600',
      'bg-pink-600',
      'bg-emerald-600',
    ];
    let sum = 0;
    for (let i = 0; i < user.email.length; i++) {
      sum += user.email.charCodeAt(i);
    }
    return colors[sum % colors.length];
  };

  return (
    <div className="relative shrink-0" ref={dropdownRef} style={{ WebkitAppRegion: 'no-drag' }}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 p-1 rounded-full hover:bg-white/[0.06] transition-colors focus:outline-none cursor-pointer"
        aria-label="User profile menu"
      >
        {user ? (
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold ${getAvatarBg()} border border-white/10 shadow-sm`}
          >
            {initial}
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full flex items-center justify-center bg-[#2d3139] text-gray-400 border border-gray-700/50">
            <User className="w-3.5 h-3.5" />
          </div>
        )}
        <ChevronDown
          className={`w-3 h-3 text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} ${direction === 'up' ? 'bottom-[120%] mb-2' : 'mt-2.5'} w-64 rounded-lg border border-borders-subtle bg-surface-card p-1.5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-100`}
          style={{
            borderColor: 'var(--chrome-border-color, var(--border-subtle))',
            background: 'var(--surface-card, #161b22)',
            boxShadow:
              '0 10px 25px -5px rgba(0, 0, 0, 0.5), 2px 2px 0 0 var(--border-strong, #30363d)',
          }}
        >
          {/* Header Info */}
          <div className="px-3 py-2.5">
            {user ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">
                  Sesión Activa
                </p>
                <p className="text-xs font-medium text-text-primary truncate" title={user.email}>
                  {user.email}
                </p>
                <p className="text-[10px] text-text-muted mt-1">
                  Espacio:{' '}
                  <span className="text-accent-primary font-semibold">{activeWorkspaceName}</span>
                </p>
                <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-accent-primary">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Sincronización en la Nube Activa</span>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">
                  Usuario Invitado
                </p>
                <p className="text-xs font-semibold text-amber-500">Sin Sincronizar</p>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-text-muted">
                  <Database className="w-3.5 h-3.5" />
                  <span>Guardado local activo</span>
                </div>
              </div>
            )}
          </div>

          <div
            className="h-px bg-borders-subtle my-1"
            style={{ backgroundColor: 'var(--chrome-border-color, var(--border-subtle))' }}
          />

          {/* Body actions / Workspace details */}
          {user ? (
            <div className="space-y-1 py-1">
              <div className="px-3 py-1">
                <p className="text-[9.5px] font-semibold uppercase tracking-wider text-text-muted">
                  Espacios de Trabajo
                </p>
              </div>

              {/* List Workspaces */}
              <div className="max-h-32 overflow-y-auto px-1 space-y-0.5">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      setActiveWorkspaceId(ws.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between text-left px-2 py-1.5 rounded text-[11px] font-sans transition-colors cursor-pointer ${
                      ws.id === activeWorkspaceId
                        ? 'bg-accent-primary/10 text-accent-primary font-medium'
                        : 'text-text-primary hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="truncate">{ws.name}</span>
                    {ws.id === activeWorkspaceId && <Check className="w-3 h-3 shrink-0" />}
                  </button>
                ))}
              </div>

              <div
                className="h-px bg-borders-subtle my-1"
                style={{ backgroundColor: 'var(--chrome-border-color, var(--border-subtle))' }}
              />

              <button
                onClick={() => handleNavigate('/settings/account')}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-text-primary hover:bg-white/[0.04] rounded transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-text-muted" />
                <span>Ajustes de Cuenta</span>
              </button>

              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          ) : (
            <div className="p-1 space-y-1">
              <div className="px-2 py-1.5 mb-1 bg-amber-500/5 border border-amber-500/10 rounded">
                <p className="text-[10px] text-text-muted leading-normal">
                  Inicia sesión para compartir proyectos en la nube, colaborar en tiempo real y
                  acceder desde cualquier lugar.
                </p>
              </div>

              <button
                onClick={() => {
                  setAuthMode('login');
                  setShowAuthModal(true);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-accent-primary hover:bg-accent-primary/10 rounded font-medium transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Iniciar Sesión</span>
              </button>

              <button
                onClick={() => {
                  setAuthMode('signup');
                  setShowAuthModal(true);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-text-primary hover:bg-white/[0.04] rounded transition-colors cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5 text-text-muted" />
                <span>Registrarse</span>
              </button>
            </div>
          )}
        </div>
      )}

      {showAuthModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <div className="w-full max-w-sm border border-borders-subtle bg-surface-card p-6 shadow-2xl rounded-lg relative">
              {/* Close button */}
              <button
                onClick={closeAuthModal}
                className="absolute right-4 top-4 text-text-muted hover:text-text-primary p-1 rounded-full hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Header */}
              <div className="flex flex-col items-center text-center mb-6 mt-2">
                <div className="w-10 h-10 rounded-full bg-accent-primary/10 flex items-center justify-center mb-3">
                  <Brain className="w-5 h-5 text-accent-primary" />
                </div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {authMode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                </h2>
                <p className="text-xs text-text-muted mt-1 max-w-[260px]">
                  {isOtpSent
                    ? `Ingresa el código de 6 dígitos que te enviamos a tu correo.`
                    : authMode === 'login'
                      ? 'Accede a tus proyectos compartidos y sincronización en la nube.'
                      : 'Regístrate para colaborar y guardar tus proyectos en la nube.'}
                </p>
              </div>

              {!isOtpSent ? (
                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1.5">
                      Correo electrónico
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nombre@correo.com"
                      className="w-full text-xs bg-[var(--surface-elevated, #0d1117)] border border-borders-subtle focus:border-[var(--accent-primary)] rounded-md px-3.5 py-2.5 text-text-primary focus:outline-none transition-colors"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-primary/95 text-black font-semibold text-xs py-2.5 px-4 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Mail className="w-3.5 h-3.5" />
                    )}
                    <span>{loading ? 'Enviando código...' : 'Enviar código por correo'}</span>
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                      className="text-xs text-text-muted hover:text-accent-primary transition-colors focus:outline-none cursor-pointer"
                    >
                      {authMode === 'login'
                        ? '¿No tienes cuenta? Regístrate aquí'
                        : '¿Ya tienes cuenta? Inicia sesión aquí'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleOtpVerify} className="space-y-4">
                  <div className="rounded-none border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-500/95 rounded-md">
                    Código enviado a <strong className="text-text-primary">{email}</strong>. Revisa
                    tu bandeja de entrada (y spam).
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1.5">
                      Código de verificación
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={otpToken}
                      onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full text-center text-lg tracking-[0.5em] font-mono bg-[var(--surface-elevated, #0d1117)] border border-borders-subtle focus:border-[var(--accent-primary)] rounded-md px-3 py-2.5 text-text-primary focus:outline-none transition-colors"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={verifying}
                    className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-primary/95 text-black font-semibold text-xs py-2.5 px-4 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {verifying ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{verifying ? 'Verificando...' : 'Verificar código'}</span>
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setIsOtpSent(false)}
                      className="text-xs text-text-muted hover:text-accent-primary transition-colors focus:outline-none cursor-pointer"
                    >
                      ¿No recibiste el código? Volver a intentar
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
