/* eslint-disable no-unused-vars */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/db/localClient';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const db = createClient();

    // Supabase client handles OAuth / Magic Link hash routing automatically.
    // We listen for auth changes to redirect to the home page when the session is loaded.
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/');
      }
    });

    // Timeout fallback redirect to home page
    const timeout = setTimeout(() => {
      router.push('/');
    }, 4000);

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
        background: '#0d0d0d',
        color: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center', opacity: 0.9 }}>
        <Loader2
          size={32}
          className="animate-spin"
          style={{
            color: 'var(--accent-primary)',
            marginBottom: '1rem',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        />
        <div style={{ fontSize: '14px', fontWeight: 600 }}>Iniciando sesión...</div>
        <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '0.25rem' }}>
          Por favor espera un momento
        </div>
      </div>
    </div>
  );
}
