'use client';

import { useEffect, useState } from 'react';
import App from '@/App';

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Minimal dark-themed loading shell so first paint is never an empty/gray
    // transparent body (the old `return null` + transparent globals.css body).
    // Matches the app's --background / themeColor and gives immediate feedback
    // while React hydrates + theme/morphology apply in App + backend finishes.
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0d0d0d',
          color: '#e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 14,
        }}
      >
        <div style={{ textAlign: 'center', opacity: 0.9 }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>DevHub</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>preparing workspace…</div>
        </div>
      </div>
    );
  }

  return <App />;
}
