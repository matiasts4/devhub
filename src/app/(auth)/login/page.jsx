'use client';

import { useState } from 'react';
import { createClient } from '@/lib/db/localClient';
import { panelStyle, inputStyle, btnPrimaryStyle } from '@/chrome/morphology';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(''); // 'sent', 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setStatus('');
    setErrorMsg('');

    try {
      const db = createClient();
      const { error } = await db.auth.signInWithOtp({ email });
      if (error) {
        setStatus('error');
        setErrorMsg(error.message || 'Ocurrió un error al enviar el enlace.');
      } else {
        setStatus('sent');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0d0d0d',
        color: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '2.5rem',
          ...panelStyle({ emphasized: true }),
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 700,
              margin: '0 0 0.5rem 0',
              color: 'var(--accent-primary)',
            }}
          >
            DevHub
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Inicia sesión con tu enlace mágico
          </p>
        </div>

        {status === 'sent' ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--chrome-radius-control)',
                padding: '1rem',
                marginBottom: '1.5rem',
                fontSize: '13px',
                color: '#10b981',
              }}
            >
              ¡Enlace enviado! Revisa tu correo electrónico para acceder a la aplicación.
            </div>
            <button
              onClick={() => setStatus('')}
              style={{
                width: '100%',
                ...btnPrimaryStyle({ size: 'md' }),
              }}
            >
              Volver a intentar
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleLogin}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
          >
            {status === 'error' && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--chrome-radius-control)',
                  padding: '0.75rem',
                  fontSize: '12px',
                  color: '#ef4444',
                }}
              >
                {errorMsg}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label
                htmlFor="email"
                style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}
              >
                Correo Electrónico
              </label>
              <input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  ...inputStyle(),
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              style={{
                width: '100%',
                opacity: loading ? 0.7 : 1,
                ...btnPrimaryStyle({ size: 'md' }),
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Enviando...
                </>
              ) : (
                'Enviar Enlace Mágico'
              )}
            </button>

            <div
              style={{
                textAlign: 'center',
                marginTop: '1rem',
                fontSize: '12px',
                color: 'var(--text-muted)',
              }}
            >
              ¿No tienes una cuenta?{' '}
              <Link
                href="/signup"
                style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}
              >
                Regístrate
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
