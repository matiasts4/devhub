/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/db/localClient';
import { Loader2, CheckCircle2, XCircle, Smartphone } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('loading'); // 'loading' | 'handshake_success' | 'handshake_error' | 'redirecting'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const db = createClient();
    const params = new URLSearchParams(window.location.search);
    const authRequestId = params.get('auth_request_id');

    if (authRequestId) {
      setStatus('loading');
    }

    // Supabase client handles OAuth / Magic Link hash routing automatically.
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        if (authRequestId) {
          try {
            const res = await fetch('/api/auth/handshake', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                auth_request_id: authRequestId,
                session,
              }),
            });

            if (res.ok) {
              setStatus('handshake_success');
            } else {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || 'No se pudo vincular la sesión.');
            }
          } catch (err) {
            console.error('Error posting session handshake:', err);
            setErrorMessage(err.message);
            setStatus('handshake_error');
          }
        } else {
          setStatus('redirecting');
          const pendingInviteToken =
            typeof window !== 'undefined'
              ? window.sessionStorage.getItem('devhub:pending-invite-token')
              : null;
          if (pendingInviteToken) {
            window.sessionStorage.removeItem('devhub:pending-invite-token');
            router.push(`/invitations/${pendingInviteToken}`);
          } else {
            router.push('/');
          }
        }
      }
    });

    // Timeout fallback redirect to home page ONLY if NOT a handshake flow
    const timeout = setTimeout(() => {
      if (!authRequestId) {
        setStatus('redirecting');
        router.push('/');
      }
    }, 5000);

    return () => {
      subscription?.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: 'radial-gradient(circle at center, #161b22 0%, #0d1117 100%)',
        color: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          width: '90%',
          padding: '2.5rem',
          borderRadius: '12px',
          border: '1px solid rgba(240, 246, 252, 0.1)',
          background: 'rgba(22, 27, 34, 0.8)',
          backdropFilter: 'blur(8px)',
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 40px rgba(88, 166, 255, 0.05)',
        }}
      >
        {status === 'loading' && (
          <div>
            <Loader2
              size={40}
              className="animate-spin"
              style={{
                color: 'var(--accent-primary, #58a6ff)',
                marginBottom: '1.5rem',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            />
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
              Confirmando tu sesión
            </h2>
            <p style={{ fontSize: '13px', color: '#8b949e', margin: 0, lineHeight: 1.5 }}>
              Procesando credenciales de Supabase y vinculando con tu aplicación de DevHub.
            </p>
          </div>
        )}

        {status === 'redirecting' && (
          <div>
            <Loader2
              size={40}
              className="animate-spin"
              style={{
                color: 'var(--accent-primary, #58a6ff)',
                marginBottom: '1.5rem',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            />
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
              Sesión iniciada
            </h2>
            <p style={{ fontSize: '13px', color: '#8b949e', margin: 0 }}>
              Redirigiendo a la aplicación principal...
            </p>
          </div>
        )}

        {status === 'handshake_success' && (
          <div className="animate-in fade-in zoom-in duration-300">
            <CheckCircle2
              size={48}
              style={{
                color: '#3fb950',
                marginBottom: '1.5rem',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            />
            <h2
              style={{
                fontSize: '20px',
                fontWeight: 700,
                margin: '0 0 0.75rem 0',
                color: '#3fb950',
              }}
            >
              ¡Conexión Completada!
            </h2>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'rgba(63, 185, 80, 0.1)',
                border: '1px solid rgba(63, 185, 80, 0.2)',
                padding: '0.75rem',
                borderRadius: '6px',
                marginBottom: '1.5rem',
              }}
            >
              <Smartphone size={16} style={{ color: '#3fb950' }} />
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#e5e7eb' }}>
                Sesión transferida con éxito a Tauri
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#8b949e', margin: 0, lineHeight: 1.6 }}>
              Ya podés cerrar esta pestaña del navegador seguro. Regresá a la ventana de{' '}
              <strong style={{ color: '#ffffff' }}>DevHub App</strong>, donde tu sesión ya estará
              activa.
            </p>
          </div>
        )}

        {status === 'handshake_error' && (
          <div className="animate-in fade-in zoom-in duration-300">
            <XCircle
              size={48}
              style={{
                color: '#f85149',
                marginBottom: '1.5rem',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            />
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 600,
                margin: '0 0 0.5rem 0',
                color: '#f85149',
              }}
            >
              Error en la vinculación
            </h2>
            <p
              style={{
                fontSize: '13px',
                color: '#8b949e',
                margin: '0 0 1.5rem 0',
                lineHeight: 1.5,
              }}
            >
              Ocurrió un problema al transferir la sesión a la aplicación de escritorio: <br />
              <span style={{ color: '#ff7b72', fontFamily: 'monospace', fontSize: '12px' }}>
                {errorMessage}
              </span>
            </p>
            <button
              onClick={() => router.push('/')}
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Ir al inicio en navegador
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
