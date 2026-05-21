import React from 'react';

export function surfaceCardStyle({ emphasized = false } = {}) {
  return {
    background: emphasized
      ? 'linear-gradient(180deg, rgba(255,176,64,0.14) 0%, rgba(255,176,64,0.04) 100%), var(--surface-card, var(--surface-muted))'
      : 'var(--surface-card, var(--surface-muted))',
    borderColor: emphasized ? 'rgba(255,176,64,0.28)' : 'var(--border-subtle)',
  };
}

export function SurfaceCard({ children, className = '', emphasized = false }) {
  return (
    <div
      className={`rounded-2xl border ${className}`.trim()}
      style={surfaceCardStyle({ emphasized })}
    >
      {children}
    </div>
  );
}

export function SurfacePill({ children, tone = 'neutral' }) {
  const toneStyle =
    tone === 'accent'
      ? {
          background: 'rgba(255,176,64,0.12)',
          borderColor: 'rgba(255,176,64,0.24)',
          color: 'var(--text-primary)',
        }
      : {
          background: 'rgba(255,255,255,0.02)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-muted)',
        };

  return (
    <span className="rounded-full border px-2.5 py-1 text-xs" style={toneStyle}>
      {children}
    </span>
  );
}
