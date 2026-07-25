'use client';

import { ChevronDown, ChevronUp, Gauge, Star } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { PROVIDERS, PROVIDER_LABELS } from '../../lib/quota/types.js';
import {
  QUOTA_PREFERENCES_EVENT,
  isProviderEnabled,
  moveProvider,
  readQuotaPreferences,
  toggleProvider,
  writeQuotaPreferences,
} from '../../lib/quota/quotaPreferences.js';

const ALL_PROVIDER_IDS = Object.values(PROVIDERS);

/**
 * QuotaProviderSettings — ordered list of every quota provider with
 * enable switches, reorder controls and a "default badge" pin.
 * Used inside WorkspaceTerminalSetupModal.
 */
export function QuotaProviderSettings() {
  const [prefs, setPrefs] = useState(() => readQuotaPreferences());

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail) setPrefs(event.detail);
    };
    window.addEventListener(QUOTA_PREFERENCES_EVENT, handler);
    return () => window.removeEventListener(QUOTA_PREFERENCES_EVENT, handler);
  }, []);

  const update = useCallback((next) => {
    setPrefs(writeQuotaPreferences(next));
  }, []);

  // Enabled providers in user order, then disabled ones in canonical order.
  const orderedRows = [
    ...prefs.providerOrder,
    ...ALL_PROVIDER_IDS.filter((id) => !prefs.providerOrder.includes(id)),
  ];

  const handleToggle = (id) => update(toggleProvider(prefs, id));
  const handleMove = (id, delta) => update(moveProvider(prefs, id, delta));
  const handleSetDefault = (id) =>
    update({ ...prefs, defaultProvider: prefs.defaultProvider === id ? null : id });

  return (
    <div className="space-y-2" data-testid="workspace-quota-providers-list">
      {orderedRows.map((id) => {
        const enabled = isProviderEnabled(prefs, id);
        const isDefault = prefs.defaultProvider === id;
        const orderIndex = prefs.providerOrder.indexOf(id);

        return (
          <div
            key={id}
            data-testid={`workspace-quota-provider-row-${id}`}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors"
            style={{
              borderColor: isDefault ? 'var(--accent-primary)' : 'var(--border-subtle)',
              background: enabled ? 'var(--chrome-control-fill)' : 'transparent',
              opacity: enabled ? 1 : 0.55,
            }}
          >
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
              style={{
                borderColor: 'var(--border-subtle)',
                color: enabled ? 'var(--accent-primary)' : 'var(--text-muted)',
                background: 'var(--surface-card)',
              }}
            >
              <Gauge size={14} />
            </span>

            <span
              className="flex-1 truncate text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {PROVIDER_LABELS[id] || id}
            </span>

            <button
              type="button"
              role="radio"
              aria-checked={isDefault}
              aria-label={`Fijar ${PROVIDER_LABELS[id]} como cuota por defecto`}
              title={
                isDefault
                  ? 'Cuota por defecto (clic para usar detección automática)'
                  : 'Fijar como cuota por defecto'
              }
              disabled={!enabled}
              onClick={() => handleSetDefault(id)}
              data-testid={`workspace-quota-provider-default-${id}`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30"
              style={{
                color: isDefault ? 'var(--accent-primary)' : 'var(--text-muted)',
                background: isDefault
                  ? 'color-mix(in srgb, var(--accent-primary) 15%, transparent)'
                  : 'transparent',
              }}
            >
              <Star size={13} fill={isDefault ? 'currentColor' : 'none'} />
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`Subir ${PROVIDER_LABELS[id]}`}
                title="Subir en el orden"
                disabled={!enabled || orderIndex <= 0}
                onClick={() => handleMove(id, -1)}
                data-testid={`workspace-quota-provider-up-${id}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-25"
                style={{
                  borderColor: 'var(--border-subtle)',
                  background: 'var(--surface-card)',
                  color: 'var(--text-secondary)',
                }}
              >
                <ChevronUp size={15} />
              </button>
              <button
                type="button"
                aria-label={`Bajar ${PROVIDER_LABELS[id]}`}
                title="Bajar en el orden"
                disabled={
                  !enabled || orderIndex === -1 || orderIndex >= prefs.providerOrder.length - 1
                }
                onClick={() => handleMove(id, 1)}
                data-testid={`workspace-quota-provider-down-${id}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-25"
                style={{
                  borderColor: 'var(--border-subtle)',
                  background: 'var(--surface-card)',
                  color: 'var(--text-secondary)',
                }}
              >
                <ChevronDown size={15} />
              </button>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`Activar ${PROVIDER_LABELS[id]}`}
              onClick={() => handleToggle(id)}
              data-testid={`workspace-quota-provider-toggle-${id}`}
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{
                background: enabled ? 'var(--accent-primary)' : 'var(--border-subtle)',
              }}
            >
              <span
                className="absolute rounded-full bg-white shadow transition-transform"
                style={{
                  top: '50%',
                  left: 2,
                  width: 20,
                  height: 20,
                  transform: `translate(${enabled ? 20 : 0}px, -50%)`,
                }}
              />
            </button>
          </div>
        );
      })}

      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {prefs.defaultProvider
          ? `${PROVIDER_LABELS[prefs.defaultProvider]} se muestra siempre en el header. `
          : 'El header detecta automáticamente el agente del workspace activo. '}
        Los desactivados no se sincronizan.
      </p>
    </div>
  );
}
