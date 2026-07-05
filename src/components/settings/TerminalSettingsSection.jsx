'use client';

import { useState, useEffect } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react'; // eslint-disable-line no-unused-vars
import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface'; // eslint-disable-line no-unused-vars
import {
  readTerminalRendererDefaultModeSetting,
  writeTerminalRendererDefaultModeSetting,
} from '@/components/terminal/terminalRendererPreferences';
import {
  applyTerminalTypographyToDocument,
  findPresetByValue,
  getStoredTerminalTypography,
  resetTerminalTypography,
  resolveTerminalTypography,
  setTerminalTypography,
  TERMINAL_FONT_FAMILY_PRESETS,
} from '@/components/terminal/terminalTypographyPreferences';
import {
  RESTORE_POLICY,
  readTerminalRestorePreferences,
  writeTerminalRestorePreferences,
} from '@/lib/terminal/restorePreferences';
import {
  getStoredTerminalAccentBarVisible,
  getStoredTerminalHeaderStyle,
  getStoredZoom,
  getTerminalHeaderStyleOptions,
  setStoredTerminalAccentBarVisible,
  setTerminalHeaderStyle,
  setZoom,
} from '@/lib/theme/themes';

export default function TerminalSettingsSection() {
  const [rendererMode, setRendererMode] = useState(() => {
    if (typeof window === 'undefined') return 'xterm-webgl';
    return readTerminalRendererDefaultModeSetting(window.localStorage);
  });

  const [headerStyle, setHeaderStyleState] = useState(() => getStoredTerminalHeaderStyle());
  const headerStyleOptions = getTerminalHeaderStyleOptions();

  const [accentBarVisible, setAccentBarVisibleState] = useState(() =>
    getStoredTerminalAccentBarVisible()
  );

  const [restorePrefs, setRestorePrefsState] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        opencode: RESTORE_POLICY.AUTO,
        generic: RESTORE_POLICY.AUTO,
        swarm: RESTORE_POLICY.AUTO,
      };
    }
    return readTerminalRestorePreferences(window.localStorage);
  });

  const [zoom, setZoomState] = useState(() => getStoredZoom());

  const [typography, setTypographyState] = useState(() => {
    if (typeof window === 'undefined') return resolveTerminalTypography();
    return getStoredTerminalTypography(window.localStorage);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    applyTerminalTypographyToDocument(typography);
  }, [typography]);

  const handleRendererChange = (event) => {
    const next = event.target.value;
    if (typeof window !== 'undefined') {
      writeTerminalRendererDefaultModeSetting(window.localStorage, next);
    }
    setRendererMode(next);
  };

  const handleHeaderStyleChange = (styleId) => {
    const normalized = setTerminalHeaderStyle(styleId);
    setHeaderStyleState(normalized);
    if (typeof window !== 'undefined') {
      const container = document.querySelector('[data-terminal-container]');
      if (container) {
        container.setAttribute('data-terminal-header-style', normalized);
        container.setAttribute('data-terminal-accent-bar', String(accentBarVisible));
      }
    }
  };

  const handleAccentBarToggle = () => {
    const next = !accentBarVisible;
    setStoredTerminalAccentBarVisible(next);
    setAccentBarVisibleState(next);
    if (typeof window !== 'undefined') {
      const container = document.querySelector('[data-terminal-container]');
      if (container) {
        container.setAttribute('data-terminal-accent-bar', String(next));
      }
    }
  };

  const handleRestorePolicyChange = (sessionType) => (event) => {
    const next = event.target.value;
    if (typeof window !== 'undefined') {
      writeTerminalRestorePreferences(window.localStorage, { [sessionType]: next });
    }
    setRestorePrefsState((prev) => ({ ...prev, [sessionType]: next }));
  };

  const handleZoomChange = (newZoom) => {
    const next = setZoom(newZoom);
    setZoomState(next);
  };

  const commitTypography = (partial) => {
    if (typeof window === 'undefined') return;
    const next = setTerminalTypography(window.localStorage, partial);
    setTypographyState(next);
    applyTerminalTypographyToDocument(next);
    window.dispatchEvent(new CustomEvent('devhub:terminal-typography-changed', { detail: next }));
  };

  const handleSelectTerminalFontFamily = (value) => {
    const isKaliStyle =
      value.includes('Noto Sans Mono') ||
      value.includes('DejaVu Sans Mono') ||
      value.includes('Liberation Mono') ||
      value === TERMINAL_FONT_FAMILY_PRESETS[0]?.value;
    const extra = isKaliStyle ? { fontWeight: '500', fontWeightBold: '800' } : {};
    commitTypography({ fontFamily: value, ...extra });
  };

  const handleTypographyChange = (key) => (event) => {
    let val = event?.target?.value;
    if (key === 'fontSize' || key === 'lineHeight' || key === 'letterSpacing') {
      val = parseFloat(val);
    }
    commitTypography({ [key]: val });
  };

  const handleResetTypography = () => {
    if (typeof window === 'undefined') return;
    const next = resetTerminalTypography(window.localStorage);
    setTypographyState(next);
    applyTerminalTypographyToDocument(next);
    window.dispatchEvent(new CustomEvent('devhub:terminal-typography-changed', { detail: next }));
  };

  return (
    <div className="space-y-6">
      <ChromeSurface asChild surface="panel">
        <div
          className="border-t px-6 py-5 space-y-6"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <h4
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Terminal renderer
            </h4>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              xterm-webgl is the only active renderer (WebGL-accelerated, works on all platforms
              including Windows).
            </p>
            <label className="flex flex-col gap-2 max-w-sm mt-3">
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Default renderer
              </span>
              <select
                data-testid="settings-terminal-renderer-select"
                value={rendererMode}
                onChange={handleRendererChange}
                className="h-11 rounded-xl border px-3 text-sm"
                style={{
                  ...chromeSurfaceStyle({ surface: 'pill' }),
                  color: 'var(--text-primary)',
                }}
              >
                <option value="xterm-webgl">xterm-webgl (always active)</option>
                <option value="xterm">xterm (DOM fallback)</option>
              </select>
            </label>
          </div>

          <div>
            <h4
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Header style
            </h4>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
              {headerStyleOptions.map((option) => {
                const isActive = option.id === headerStyle;
                return (
                  <button
                    key={option.id}
                    data-testid={`terminal-header-style-${option.id}`}
                    type="button"
                    onClick={() => handleHeaderStyleChange(option.id)}
                    className="group text-left rounded-xl border p-3 transition-all"
                    style={chromeSurfaceStyle({
                      surface: 'panel',
                      emphasized: isActive,
                      tone: isActive ? 'accent' : 'neutral',
                    })}
                  >
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {option.label}
                    </p>
                    <p
                      className="text-[10px] mt-0.5 leading-relaxed"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between max-w-sm">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Accent bar
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Show colored bar below terminal header.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={accentBarVisible}
              data-testid="terminal-accent-bar-toggle"
              onClick={handleAccentBarToggle}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{
                background: accentBarVisible ? 'var(--accent-primary)' : 'var(--surface-muted)',
              }}
            >
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                style={{ transform: accentBarVisible ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </button>
          </div>

          <div>
            <h4
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Terminal restore
            </h4>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Choose how terminals are restored at startup.
            </p>
            <div className="space-y-3 mt-3">
              {[
                { key: 'opencode', label: 'OpenCode' },
                { key: 'generic', label: 'Shell Genérico' },
                { key: 'swarm', label: 'Swarm' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between max-w-sm">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {label}
                  </label>
                  <select
                    data-testid={`restore-policy-${key}`}
                    value={restorePrefs[key]}
                    onChange={handleRestorePolicyChange(key)}
                    className="h-11 rounded-xl border px-3 text-sm"
                    style={{
                      ...chromeSurfaceStyle({ surface: 'pill' }),
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value={RESTORE_POLICY.AUTO}>Automático</option>
                    <option value={RESTORE_POLICY.MANUAL}>Manual</option>
                    <option value={RESTORE_POLICY.OFF}>Desactivado</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div data-testid="settings-zoom">
            <h4
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Zoom de interfaz
            </h4>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Escala toda la aplicación (no solo el texto del xterm). Para densidad del terminal usa
              Tipografía → Tamaño abajo.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={() => handleZoomChange(zoom - 0.1)}
                disabled={zoom <= 0.5}
                className="w-10 h-10 rounded-xl border flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={chromeSurfaceStyle({ surface: 'pill' })}
                aria-label="zoom-out"
              >
                <Minus aria-hidden="true" className="w-4 h-4" />
              </button>
              <div
                className="flex-1 h-2 rounded-full relative overflow-hidden"
                style={{
                  ...chromeSurfaceStyle({ surface: 'pill' }),
                  minHeight: '0.5rem',
                  padding: 0,
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-300"
                  style={{
                    background: 'var(--accent-primary)',
                    width: `${((zoom - 0.5) / 1.5) * 100}%`,
                  }}
                />
              </div>
              <button
                onClick={() => handleZoomChange(zoom + 0.1)}
                disabled={zoom >= 2}
                className="w-10 h-10 rounded-xl border flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={chromeSurfaceStyle({ surface: 'pill' })}
                aria-label="zoom-in"
              >
                <Plus aria-hidden="true" className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleZoomChange(1)}
                title="Reset to 100%"
                className="w-10 h-10 rounded-xl border flex items-center justify-center transition-all"
                style={chromeSurfaceStyle({ surface: 'pill' })}
                aria-label="zoom-reset"
              >
                <RotateCcw aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h4
                  className="font-mono text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Tipografía
                </h4>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Fuente mono, grosor, interlineado y espaciado de letra para todas las terminales
                  xterm-webgl.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetTypography}
                className="text-[10px] px-2 py-1 rounded border"
                style={chromeSurfaceStyle({ surface: 'pill' })}
                title="Restablecer tipografía de terminal"
              >
                Restablecer
              </button>
            </div>

            <div className="mb-4">
              <label
                className="text-xs font-medium block mb-1.5"
                style={{ color: 'var(--text-primary)' }}
              >
                Familia de fuente
              </label>
              <select
                value={typography.fontFamily}
                onChange={(e) => handleSelectTerminalFontFamily(e.target.value)}
                className="w-full h-10 rounded-xl border px-3 text-sm"
                style={chromeSurfaceStyle({ surface: 'pill' })}
              >
                {TERMINAL_FONT_FAMILY_PRESETS.map((p) => (
                  <option key={p.id} value={p.value}>
                    {p.label}
                  </option>
                ))}
                {!findPresetByValue(typography.fontFamily) && (
                  <option value={typography.fontFamily}>Personalizada (actual)</option>
                )}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <label
                  className="text-xs font-medium block mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Tamaño ({typography.fontSize}px)
                </label>
                <input
                  type="range"
                  min={8}
                  max={24}
                  step={1}
                  value={typography.fontSize}
                  onChange={handleTypographyChange('fontSize')}
                  className="w-full"
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
              </div>
              <div>
                <label
                  className="text-xs font-medium block mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Grosor normal
                </label>
                <select
                  value={String(typography.fontWeight)}
                  onChange={handleTypographyChange('fontWeight')}
                  className="w-full h-9 rounded-lg border px-2 text-sm"
                  style={chromeSurfaceStyle({ surface: 'pill' })}
                >
                  {[300, 400, 500, 600, 700].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="text-xs font-medium block mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Grosor negrita
                </label>
                <select
                  value={String(typography.fontWeightBold)}
                  onChange={handleTypographyChange('fontWeightBold')}
                  className="w-full h-9 rounded-lg border px-2 text-sm"
                  style={chromeSurfaceStyle({ surface: 'pill' })}
                >
                  {[500, 600, 700, 800, 900].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  className="text-xs font-medium block mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Interlineado: {typography.lineHeight}
                </label>
                <input
                  type="range"
                  min={1.0}
                  max={1.9}
                  step={0.05}
                  value={typography.lineHeight}
                  onChange={handleTypographyChange('lineHeight')}
                  className="w-full"
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
              </div>
              <div>
                <label
                  className="text-xs font-medium block mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Espaciado: {typography.letterSpacing}
                </label>
                <input
                  type="range"
                  min={-1.5}
                  max={3}
                  step={0.1}
                  value={typography.letterSpacing}
                  onChange={handleTypographyChange('letterSpacing')}
                  className="w-full"
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
              </div>
            </div>
          </div>
        </div>
      </ChromeSurface>
    </div>
  );
}
