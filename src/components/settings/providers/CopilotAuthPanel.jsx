'use client';

import { useState, useRef, useEffect } from 'react';
import { LogIn, LogOut, Loader2, CheckCircle2, XCircle, Copy, ExternalLink } from 'lucide-react';

export function CopilotAuthPanel({ isAuthenticated, onAuthChange }) {
  const [authState, setAuthState] = useState('idle');
  const [userCode, setUserCode] = useState(null);
  const [verificationUri, setVerificationUri] = useState(null);
  const [deviceCode, setDeviceCode] = useState(null);
  const [pollInterval, setPollInterval] = useState(5);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  async function startLogin() {
    setAuthState('loading');
    setError(null);
    try {
      const res = await fetch('/api/settings/llm-providers/copilot/device-flow', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error iniciando Device Flow');

      setUserCode(data.user_code);
      setVerificationUri(data.verification_uri);
      setDeviceCode(data.device_code);
      setPollInterval(data.interval || 5);
      setAuthState('pending');

      pollAuth(data.device_code, data.interval || 5);
      onAuthChange?.('pending');
    } catch (err) {
      setError(err.message);
      setAuthState('error');
    }
  }

  function pollAuth(code, interval) {
    if (pollRef.current) clearTimeout(pollRef.current);

    const doPoll = async () => {
      try {
        const res = await fetch('/api/settings/llm-providers/copilot/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: code }),
        });
        const data = await res.json();

        if (data.status === 'pending') {
          pollRef.current = setTimeout(doPoll, interval * 1000);
        } else if (data.status === 'success') {
          setAuthState('success');
          onAuthChange?.('success', data.username);
        } else if (data.status === 'expired') {
          setError('El codigo vencio. Intentalo de nuevo.');
          setAuthState('error');
          onAuthChange?.('expired');
        } else {
          setError(data.error || 'Error desconocido');
          setAuthState('error');
          onAuthChange?.('error');
        }
      } catch (err) {
        setError(err.message);
        setAuthState('error');
        onAuthChange?.('error');
      }
    };

    pollRef.current = setTimeout(doPoll, interval * 1000);
  }

  function cancelAuth() {
    if (pollRef.current) clearTimeout(pollRef.current);
    setAuthState('idle');
    setUserCode(null);
    setVerificationUri(null);
    setDeviceCode(null);
    setError(null);
    onAuthChange?.('cancelled');
  }

  function logout() {
    if (pollRef.current) clearTimeout(pollRef.current);
    setAuthState('idle');
    setUserCode(null);
    setVerificationUri(null);
    setDeviceCode(null);
    setError(null);
    onAuthChange?.(false);
  }

  // If parent says already authenticated, show success state
  if (isAuthenticated) {
    return (
      <div className="space-y-4 pt-2">
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
          style={{
            background: 'color-mix(in srgb, #22c55e 8%, var(--surface-sunken))',
            border: '1px solid color-mix(in srgb, #22c55e 25%, transparent)',
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              Autenticado como <span className="font-mono font-semibold">GitHub Copilot</span>
            </span>
          </div>
          <button
            data-testid="copilot-logout"
            onClick={logout}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all hover:opacity-80"
            style={{
              background: 'color-mix(in srgb, #ef4444 12%, transparent)',
              border: '1px solid color-mix(in srgb, #ef4444 25%, transparent)',
              color: '#ef4444',
            }}
          >
            <LogOut size={12} /> Cerrar sesion
          </button>
        </div>
      </div>
    );
  }

  // Pending state - waiting for user to authorize
  if (authState === 'pending') {
    return (
      <div className="space-y-4 pt-2">
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            background: 'color-mix(in srgb, var(--accent-primary) 5%, var(--surface-sunken))',
            border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
          }}
        >
          <div className="flex items-center gap-2">
            <Loader2
              size={14}
              className="animate-spin"
              style={{ color: 'var(--accent-primary)' }}
            />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Esperando autorizacion en GitHub...
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            1. Abri{' '}
            <a
              href={verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-0.5"
              style={{ color: 'var(--accent-primary)' }}
            >
              {verificationUri} <ExternalLink size={11} />
            </a>
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            2. Ingres este codigo:
          </p>
          <div className="flex items-center gap-2">
            <span
              className="font-mono text-2xl font-bold tracking-widest px-4 py-2 rounded-xl"
              style={{
                background: 'var(--surface-card)',
                border: '2px solid var(--accent-primary)',
                color: 'var(--accent-primary)',
                letterSpacing: '0.25em',
              }}
            >
              {userCode}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(userCode || '');
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="p-2 rounded-lg transition-all"
              style={{
                background: copied
                  ? 'color-mix(in srgb, #22c55e 15%, transparent)'
                  : 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                color: copied ? '#22c55e' : 'var(--text-muted)',
              }}
              title="Copiar codigo"
            >
              {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <button
            onClick={cancelAuth}
            className="text-xs underline"
            style={{ color: 'var(--text-muted)' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (authState === 'error') {
    return (
      <div className="space-y-4 pt-2">
        <div
          className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{
            background: 'color-mix(in srgb, #ef4444 10%, transparent)',
            border: '1px solid color-mix(in srgb, #ef4444 25%, transparent)',
            color: '#ef4444',
          }}
        >
          <XCircle size={13} /> {error}
        </div>
        <button
          data-testid="copilot-login"
          onClick={startLogin}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
          style={{
            background: 'var(--accent-primary)',
            color: 'white',
            boxShadow: '0 2px 8px color-mix(in srgb, var(--accent-primary) 30%, transparent)',
          }}
        >
          <LogIn size={16} /> Reintentar
        </button>
      </div>
    );
  }

  // Loading state
  if (authState === 'loading') {
    return (
      <div className="space-y-4 pt-2">
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all opacity-50"
          style={{
            background: 'var(--accent-primary)',
            color: 'white',
          }}
        >
          <Loader2 size={16} className="animate-spin" /> Iniciando...
        </button>
      </div>
    );
  }

  // Idle state - show login button
  return (
    <div className="space-y-4 pt-2">
      <button
        data-testid="copilot-login"
        onClick={startLogin}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
        style={{
          background: 'var(--accent-primary)',
          color: 'white',
          boxShadow: '0 2px 8px color-mix(in srgb, var(--accent-primary) 30%, transparent)',
        }}
      >
        <LogIn size={16} /> Login con GitHub Copilot
      </button>
      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Usas el mismo mecanismo que VS Code y OpenCode. No se almacenan contrasenas.
      </p>
    </div>
  );
}
