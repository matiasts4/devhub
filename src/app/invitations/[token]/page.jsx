'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/db/localClient';
import { panelStyle, inputStyle, btnPrimaryStyle } from '@/chrome/morphology';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function InvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token;
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('devhub:pending-invite-token', token);
    }
    const db = createClient();
    db.auth.getSession().then(({ data }) => {
      const sessionUser = data?.session?.user;
      if (sessionUser?.id) {
        acceptInvite(sessionUser.id);
      }
    });
  }, [token]);

  async function acceptInvite(userId) {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo aceptar la invitación');
      setStatus('accepted');
      setTimeout(() => router.push('/'), 1500);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e) {
    e.preventDefault();
    if (!email || !token) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const db = createClient();
      const { error } = await db.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/invitations/${token}`,
        },
      });
      if (error) throw new Error(error.message);
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        width: '100vw',
        minHeight: '100vh',
        background: '#0d0d0d',
        color: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '2rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: '420px', padding: '2.5rem', ...panelStyle({ emphasized: true }) }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--accent-primary)' }}>
          Invitación a DevHub
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 1.5rem 0' }}>
          Inicia sesión o crea tu cuenta con el mismo correo al que te invitaron.
        </p>

        {status === 'accepted' && (
          <div style={{ color: '#10b981', fontSize: '13px' }}>Invitación aceptada. Redirigiendo...</div>
        )}

        {status === 'sent' && (
          <div style={{ color: '#10b981', fontSize: '13px' }}>
            Enlace enviado. Revisa tu correo y vuelve aquí después de confirmar.
          </div>
        )}

        {status === 'error' && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--chrome-radius-control)',
              padding: '0.75rem',
              fontSize: '12px',
              color: '#ef4444',
              marginBottom: '1rem',
            }}
          >
            {errorMsg}
          </div>
        )}

        {status !== 'accepted' && status !== 'sent' && (
          <form onSubmit={handleMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              style={{ width: '100%', boxSizing: 'border-box', ...inputStyle() }}
            />
            <button
              type="submit"
              disabled={loading || !email}
              style={{ width: '100%', opacity: loading ? 0.7 : 1, ...btnPrimaryStyle({ size: 'md' }) }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Enviando...
                </>
              ) : (
                'Enviar enlace mágico'
              )}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '12px', color: 'var(--text-muted)' }}>
          <Link href="/login" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
            Ya tengo cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}