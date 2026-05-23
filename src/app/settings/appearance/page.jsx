'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Palette, Minus, Plus, RotateCcw, Monitor } from 'lucide-react';
import {
  getStoredTheme,
  setTheme,
  THEME_OPTIONS,
  THEMES,
  getStoredZoom,
  setZoom,
  getStoredAppearance,
  setStoredAppearance,
  applyAppearanceSettings,
} from '@/lib/theme/themes';
import { UiHeader } from '@/components/ui/system';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { DENSITY, FONT_FAMILY, FONT_SCALE } from '@/components/ui/system/ui-tokens';
import {
  readTerminalRendererDefaultModeSetting,
  writeTerminalRendererDefaultModeSetting,
} from '@/components/terminal/terminalRendererPreferences';

export default function AppearancePage() {
  const [activeTheme, setActiveTheme] = useState(THEMES.DEEP_SEA);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [terminalRendererMode, setTerminalRendererMode] = useState('vte-experimental');
  const [appearance, setAppearance] = useState(() => getStoredAppearance());

  useEffect(() => {
    setActiveTheme(getStoredTheme());
    setCurrentZoom(getStoredZoom());
    if (typeof window !== 'undefined') {
      setTerminalRendererMode(readTerminalRendererDefaultModeSetting(window.localStorage));
    }
    setAppearance(getStoredAppearance());
  }, []);

  const handleZoomChange = (newZoom) => {
    const zoom = setZoom(newZoom);
    setCurrentZoom(zoom);
  };

  const handleAppearanceChange = (key, value) => {
    const next = { ...appearance, [key]: value };
    setStoredAppearance(next);
    applyAppearanceSettings(next);
    setAppearance(next);
  };

  const activeThemeLabel = useMemo(
    () => THEME_OPTIONS.find((theme) => theme.id === activeTheme)?.label ?? 'Deep Sea',
    [activeTheme]
  );

  const handleThemeChange = (nextTheme) => {
    setActiveTheme(nextTheme);
  };

  const handleTerminalRendererChange = (event) => {
    const nextMode = event.target.value;
    if (typeof window !== 'undefined') {
      writeTerminalRendererDefaultModeSetting(window.localStorage, nextMode);
    }
    setTerminalRendererMode(nextMode);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <UiHeader>
        <UiHeader.Title>Appearance</UiHeader.Title>
      </UiHeader>

      <AppearanceSection initialTheme={activeTheme} onThemeChange={handleThemeChange} />

      <section
        className="rounded-2xl border p-6"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 94%, transparent), color-mix(in srgb, var(--surface-elevated) 45%, transparent))',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              Typography & Density
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Adjust readability and interface spacing.
            </p>
          </div>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
            style={{
              background: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 28%, transparent)',
              color: 'var(--text-secondary)',
            }}
          >
            <Palette size={12} style={{ color: 'var(--accent-primary)' }} />
            Active: {appearance.fontFamily} / {appearance.density}
          </div>
        </div>

        <div className="space-y-5">
          <label className="flex flex-col gap-2 max-w-sm">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Font Family
            </span>
            <select
              data-testid="settings-font-family"
              value={appearance.fontFamily}
              onChange={(e) => handleAppearanceChange('fontFamily', e.target.value)}
              className="h-11 rounded-xl border px-3 text-sm"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'var(--surface-muted)',
                color: 'var(--text-primary)',
              }}
            >
              <option value={FONT_FAMILY.SANS}>Inter</option>
              <option value={FONT_FAMILY.SYSTEM}>System UI</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 max-w-sm">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Font Scale
            </span>
            <select
              data-testid="settings-font-scale"
              value={appearance.fontScale}
              onChange={(e) => handleAppearanceChange('fontScale', parseFloat(e.target.value))}
              className="h-11 rounded-xl border px-3 text-sm"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'var(--surface-muted)',
                color: 'var(--text-primary)',
              }}
            >
              <option value={FONT_SCALE.XS}>Small</option>
              <option value={FONT_SCALE.SM}>Smaller</option>
              <option value={FONT_SCALE.BASE}>Normal</option>
              <option value={FONT_SCALE.LG}>Large</option>
              <option value={FONT_SCALE.XL}>Larger</option>
              <option value={FONT_SCALE.XXL}>Extra Large</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 max-w-sm">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              UI Density
            </span>
            <select
              data-testid="settings-density"
              value={appearance.density}
              onChange={(e) => handleAppearanceChange('density', e.target.value)}
              className="h-11 rounded-xl border px-3 text-sm"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'var(--surface-muted)',
                color: 'var(--text-primary)',
              }}
            >
              <option value={DENSITY.COMFORTABLE}>Comfortable</option>
              <option value={DENSITY.COMPACT}>Compact</option>
            </select>
          </label>
        </div>

        <div
          className="mt-4 rounded-lg px-3 py-2 text-xs"
          style={{
            background: 'color-mix(in srgb, var(--surface-muted) 75%, transparent)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          Changes apply instantly via CSS variables and persist to localStorage.
        </div>
      </section>

      <section
        className="rounded-2xl border p-6"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 94%, transparent), color-mix(in srgb, var(--surface-elevated) 45%, transparent))',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              Terminal renderer
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              GTK VTE stays as the preferred Linux/Tauri path. xterm remains the stable fallback.
            </p>
          </div>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
            style={{
              background: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 28%, transparent)',
              color: 'var(--text-secondary)',
            }}
          >
            <Monitor size={12} style={{ color: 'var(--accent-primary)' }} />
            Active: {terminalRendererMode === 'vte-experimental' ? 'GTK VTE' : 'xterm'}
          </div>
        </div>

        <label className="flex flex-col gap-2 max-w-sm">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Default renderer
          </span>
          <select
            data-testid="settings-terminal-renderer-select"
            value={terminalRendererMode}
            onChange={handleTerminalRendererChange}
            className="h-11 rounded-xl border px-3 text-sm"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--surface-muted)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="vte-experimental">GTK VTE</option>
            <option value="xterm">xterm</option>
          </select>
        </label>

        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          This preference applies to new terminal views. Existing fallbacks and explicit panel
          recoveries keep working.
        </p>
      </section>

      <section
        className="rounded-2xl border p-6"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 94%, transparent), color-mix(in srgb, var(--surface-elevated) 45%, transparent))',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              Zoom Level
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Adjust the overall size of the interface (Ctrl +/-).
            </p>
          </div>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
            style={{
              background: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 28%, transparent)',
              color: 'var(--text-secondary)',
            }}
          >
            <Monitor size={12} style={{ color: 'var(--accent-primary)' }} />
            Scale: {Math.round(currentZoom * 100)}%
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleZoomChange(currentZoom - 0.1)}
            disabled={currentZoom <= 0.5}
            className="w-10 h-10 rounded-xl border flex items-center justify-center transition-all hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-muted)' }}
          >
            <Minus size={18} style={{ color: 'var(--text-primary)' }} />
          </button>

          <div className="flex-1 h-2 rounded-full bg-surface-muted border border-border-subtle relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-accent-primary transition-all duration-300"
              style={{ width: `${((currentZoom - 0.5) / 1.5) * 100}%` }}
            />
          </div>

          <button
            onClick={() => handleZoomChange(currentZoom + 0.1)}
            disabled={currentZoom >= 2}
            className="w-10 h-10 rounded-xl border flex items-center justify-center transition-all hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-muted)' }}
          >
            <Plus size={18} style={{ color: 'var(--text-primary)' }} />
          </button>

          <button
            onClick={() => handleZoomChange(1)}
            title="Reset to 100%"
            className="w-10 h-10 rounded-xl border flex items-center justify-center transition-all hover:bg-surface-elevated"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-muted)' }}
          >
            <RotateCcw size={18} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </section>

      <section
        className="rounded-xl border p-4"
        style={{
          background: 'color-mix(in srgb, var(--surface-card) 84%, transparent)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Visual direction: contrast-first, subtle depth, and low-noise surfaces inspired by
          BridgeSpace.
        </p>
      </section>
    </div>
  );
}
