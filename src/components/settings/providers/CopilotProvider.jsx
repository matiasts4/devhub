'use client';

import { Shield } from 'lucide-react';
import { ProviderCardShell } from '@/components/settings/shared/ProviderCardShell';
import { CopilotAuthPanel } from '@/components/settings/providers/CopilotAuthPanel';

export function CopilotProvider({ providerData, onToggle, onUpdate }) {
  const isEnabled = providerData?.enabled ?? true;

  return (
    <ProviderCardShell
      name="GitHub Copilot"
      description="Proveedor oficial de GitHub Copilot con acceso a la flota real (gpt-4o, gpt-4.1, gpt-5.2, Raptor) y soporte de reasoning_effort."
      icon={Shield}
      priority={1}
      isEnabled={isEnabled}
      onToggle={onToggle}
    >
      <CopilotAuthPanel
        isAuthenticated={!!providerData?.COPILOT_OAUTH_TOKEN}
        onAuthChange={(state, username) => {
          if (state === 'success' && username) {
            onUpdate('COPILOT_OAUTH_TOKEN', 'authenticated');
          } else if (state === false) {
            onUpdate('COPILOT_OAUTH_TOKEN', null);
          }
        }}
      />
      {providerData?.COPILOT_OAUTH_TOKEN && (
        <div className="pt-2">
          <div className="flex flex-wrap gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Modelo
            </label>
            <div className="flex flex-wrap gap-2">
              {['gpt-5.2', 'gpt-4o', 'gpt-4.1', 'gpt-4o-mini'].map((opt) => {
                const active = (providerData?.COPILOT_MODEL || 'gpt-5.2') === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => onUpdate('COPILOT_MODEL', opt)}
                    className="font-mono text-[11px] px-3 py-1.5 rounded-lg border transition-all"
                    style={{
                      borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                      background: active
                        ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)'
                        : 'var(--surface-sunken)',
                      color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Reasoning Effort
            </label>
            <div className="flex flex-wrap gap-2">
              {['none', 'low', 'medium', 'high', 'xhigh'].map((opt) => {
                const active = (providerData?.COPILOT_REASONING_EFFORT || 'none') === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => onUpdate('COPILOT_REASONING_EFFORT', opt)}
                    className="font-mono text-[11px] px-3 py-1.5 rounded-lg border transition-all"
                    style={{
                      borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                      background: active
                        ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)'
                        : 'var(--surface-sunken)',
                      color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </ProviderCardShell>
  );
}
