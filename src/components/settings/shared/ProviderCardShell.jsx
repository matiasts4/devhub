'use client';

import { Zap } from 'lucide-react';

export function ProviderCardShell({
  name,
  description,
  icon: Icon,
  priority,
  isEnabled = true,
  onToggle,
  actions,
  children,
}) {
  return (
    <section
      data-testid="provider-card"
      className="rounded-2xl border p-6 transition-all"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 94%, transparent), color-mix(in srgb, var(--surface-elevated) 45%, transparent))',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--shadow-soft)',
        opacity: isEnabled ? 1 : 0.6,
      }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
        {Icon && (
          <div
            className="w-9 h-9 rounded-xl flex shrink-0 items-center justify-center cursor-pointer transition-colors"
            onClick={onToggle}
            title={isEnabled ? 'Haz click para desactivar' : 'Haz click para activar'}
            style={{
              background: isEnabled
                ? 'color-mix(in srgb, var(--accent-primary) 18%, transparent)'
                : 'color-mix(in srgb, var(--surface-muted) 80%, black)',
              border: `1px solid ${isEnabled ? 'color-mix(in srgb, var(--accent-primary) 34%, transparent)' : 'var(--border-strong)'}`,
            }}
          >
            <Icon
              className="w-4 h-4"
              style={{ color: isEnabled ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            />
          </div>
        )}
        <div className="flex-1">
          <h3 className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {name}
          </h3>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        </div>

        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          {priority !== undefined && (
            <span
              className="text-xs font-mono px-2 py-0.5 rounded shadow-sm flex items-center gap-1.5"
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-secondary)',
              }}
            >
              <Zap size={11} style={{ color: 'var(--accent-primary)' }} />
              PRIORIDAD: {priority}
            </span>
          )}
          {actions}
          <button
            data-testid="provider-toggle"
            onClick={onToggle}
            className="relative w-11 h-6 flex items-center rounded-full transition-colors duration-200 focus:outline-none ml-1 cursor-pointer"
            style={{
              background: isEnabled
                ? 'var(--success, #22c55e)'
                : 'color-mix(in srgb, var(--surface-muted) 80%, black)',
              border: '1px solid var(--border-strong)',
            }}
          >
            <span
              className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${isEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
            />
          </button>
        </div>
      </div>

      {/* Children */}
      <div
        className={`space-y-5 transition-all w-full ${!isEnabled && 'pointer-events-none opacity-50'}`}
      >
        {children}
      </div>
    </section>
  );
}
