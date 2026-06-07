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
          emailRedirectTo:
            typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
          shouldCreateUser: authMode === 'signup',
        },
      });
      if (error) {
        toast.error('Error: ' + error.message);
      } else {
        toast.success('¡Enlace de acceso enviado! Revisa tu bandeja de entrada.');
        setShowAuthModal(false);
        setEmail('');
      }
    } catch (err) {
      console.error(err);
      toast.error('Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
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

      {showAuthModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <div className="fade-in-up w-full max-w-md rounded-none border-2 border-[var(--border-strong, #30363d)] bg-[var(--surface-card, #161b22)] p-6 shadow-[8px_8px_0_0_var(--border-strong, #30363d)]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-none border-2 border-[var(--accent-primary, #58a6ff)]/30 bg-[var(--surface-elevated)] shadow-[3px_3px_0_0_var(--border-strong)]">
                  <Brain
                    className="w-4 h-4 text-[var(--accent-primary, #58a6ff)]"
                    strokeWidth={1.5}
                  />
                </div>
                <h2 className="font-mono font-bold text-text-primary">
                  {authMode === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
                </h2>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setShowAuthModal(false);
                  setEmail('');
                }}
                variant="devhubGhost"
                size="icon"
                className="h-8 w-8 rounded-none border-2 border-[var(--border-strong, #30363d)]"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div className="rounded-none border-2 border-[var(--border-strong, #30363d)] bg-[var(--surface-elevated, #0d1117)] p-4 text-[11px] leading-relaxed text-text-muted">
                {authMode === 'login'
                  ? 'Te enviaremos un correo con un enlace mágico para iniciar sesión al instante sin contraseña.'
                  : 'Crea tu cuenta de DevHub compartida. Recibirás un enlace para confirmar y configurar tu perfil.'}
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-text-muted">
                  Correo electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full text-sm placeholder:text-text-muted bg-[var(--surface-elevated, #0d1117)] border border-[var(--border-subtle, #21262d)] focus:border-[var(--accent-primary)] px-3 py-2 text-text-primary focus:outline-none transition-colors"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                variant="devhubPrimary"
                className="w-full h-10 rounded-none text-sm font-semibold border-2 border-[var(--accent-primary)]"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                {loading ? 'Enviando...' : 'Enviar enlace mágico'}
              </Button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  className="text-xs text-[var(--accent-primary)] hover:underline focus:outline-none cursor-pointer"
                >
                  {authMode === 'login'
                    ? '¿No tienes cuenta? Regístrate aquí'
                    : '¿Ya tienes cuenta? Inicia sesión aquí'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
