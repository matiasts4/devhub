'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import {
  readZedOverlaySettings,
  writeZedOverlaySettings,
} from '@/lib/asistente/zedOverlaySettings';

const INTENSITY_OPTIONS = [
  { value: 'subtle', label: 'Sutil' },
  { value: 'normal', label: 'Normal' },
  { value: 'intense', label: 'Intensa' },
];

const SPEED_OPTIONS = [
  { value: 'slow', label: 'Lenta' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Rápida' },
];

const WIDTH_OPTIONS = [
  { value: 'compact', label: 'Compacto' },
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Amplio' },
];

export default function ZedOverlaySettings() {
  const [settings, setSettings] = useState(() => readZedOverlaySettings());

  const update = (patch) => {
    setSettings((prev) => writeZedOverlaySettings({ ...prev, ...patch }));
  };

  return (
    <div className="space-y-6">
      <ChromeSurface asChild surface="panel" emphasized>
        <div
          className="overflow-hidden"
          style={chromeSurfaceStyle({ surface: 'panel', emphasized: true })}
        >
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={{
              borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)',
              background: 'var(--chrome-panel-fill-emphasis)',
            }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-none bg-[var(--accent-primary)]/15">
              <Sparkles className="h-4 w-4 text-[var(--accent-primary)]" />
            </div>
            <div>
              <h3
                className="font-mono text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Zed Overlay
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Aura ambiental, velocidad de animación y ancho del panel de actividad
              </p>
            </div>
          </div>

          <div className="space-y-5 px-6 py-4">
            <div className="flex items-center justify-between gap-4 max-w-sm">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Aura ambiental
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Resplandor de fondo que refleja el estado de Zed.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.auraEnabled}
                data-testid="zed-aura-enabled-toggle"
                onClick={() => update({ auraEnabled: !settings.auraEnabled })}
                className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                style={{
                  background: settings.auraEnabled
                    ? 'var(--accent-primary)'
                    : 'var(--surface-muted)',
                }}
              >
                <span
                  className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  style={{
                    transform: settings.auraEnabled ? 'translateX(22px)' : 'translateX(2px)',
                  }}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 max-w-sm">
              <label
                htmlFor="zed-aura-intensity-select"
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Intensidad del aura
              </label>
              <select
                id="zed-aura-intensity-select"
                value={settings.auraIntensity}
                onChange={(e) => update({ auraIntensity: e.target.value })}
                disabled={!settings.auraEnabled}
                data-testid="zed-aura-intensity-select"
                className="h-10 w-[140px] rounded-xl border px-3 text-sm disabled:opacity-40"
                style={{ ...chromeSurfaceStyle({ surface: 'pill' }), color: 'var(--text-primary)' }}
              >
                {INTENSITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-4 max-w-sm">
              <label
                htmlFor="zed-aura-speed-select"
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Velocidad de animación
              </label>
              <select
                id="zed-aura-speed-select"
                value={settings.auraSpeed}
                onChange={(e) => update({ auraSpeed: e.target.value })}
                disabled={!settings.auraEnabled}
                data-testid="zed-aura-speed-select"
                className="h-10 w-[140px] rounded-xl border px-3 text-sm disabled:opacity-40"
                style={{ ...chromeSurfaceStyle({ surface: 'pill' }), color: 'var(--text-primary)' }}
              >
                {SPEED_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-4 max-w-sm">
              <label
                htmlFor="zed-drawer-width-select"
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Ancho del panel de actividad
              </label>
              <select
                id="zed-drawer-width-select"
                value={settings.drawerWidth}
                onChange={(e) => update({ drawerWidth: e.target.value })}
                data-testid="zed-drawer-width-select"
                className="h-10 w-[140px] rounded-xl border px-3 text-sm"
                style={{ ...chromeSurfaceStyle({ surface: 'pill' }), color: 'var(--text-primary)' }}
              >
                {WIDTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Los cambios se aplican de inmediato al overlay de Zed abierto en esta ventana. La
              opción de movimiento reducido en Ajustes → Apariencia siempre tiene prioridad sobre
              estos valores.
            </p>
          </div>
        </div>
      </ChromeSurface>
    </div>
  );
}
