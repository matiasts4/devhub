'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Monitor, Palette, Plus, RotateCcw } from 'lucide-react';
import {
  ACCENT_OPTIONS,
  getStoredAccent,
  getStoredMorphology,
  getStoredPalette,
  getStoredTheme,
  MORPHOLOGIES,
  MORPHOLOGY_OPTIONS,
  PALETTE_OPTIONS,
  setAccent,
  setMorphology,
  setPalette,
  setTheme,
  THEME_OPTIONS,
  THEMES,
  getStoredZoom,
  setZoom,
  TERMINAL_HEADER_STYLES,
  getStoredTerminalHeaderStyle,
  setTerminalHeaderStyle,
  getTerminalHeaderStyleOptions,
  getStoredTerminalAccentBarVisible,
  setStoredTerminalAccentBarVisible,
} from '@/lib/theme/themes';
import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import {
  readTerminalRendererDefaultModeSetting,
  writeTerminalRendererDefaultModeSetting,
} from '@/components/terminal/terminalRendererPreferences';
import {
  RESTORE_POLICY,
  readTerminalRestorePreferences,
  writeTerminalRestorePreferences,
} from '@/lib/terminal/restorePreferences';

const PREVIEW_BY_THEME = {
  [THEMES.DEEP_SEA]: {
    panel: '#0F1521',
    body: '#0B1019',
    line: '#1A2740',
    highlight: '#58A6FF',
    dots: ['#f87171', '#fbbf24', '#22c55e'],
  },
  [THEMES.NORD]: {
    panel: '#3B4252',
    body: '#2E3440',
    line: '#4C566A',
    highlight: '#88C0D0',
    dots: ['#d08770', '#ebcb8b', '#a3be8c'],
  },
  [THEMES.DRACULA]: {
    panel: '#2A2C44',
    body: '#191A2A',
    line: '#44475A',
    highlight: '#BD93F9',
    dots: ['#ff5555', '#f1fa8c', '#50fa7b'],
  },
  [THEMES.LIGHT]: {
    panel: '#F8FAFC',
    body: '#FFFFFF',
    line: '#D0D7DE',
    highlight: '#0969DA',
    dots: ['#ef4444', '#f59e0b', '#16a34a'],
  },
  [THEMES.BRUTALIST_STAGE]: {
    panel: '#0d0d0d',
    body: '#080808',
    line: '#222222',
    highlight: '#e3b341',
    dots: ['#f85149', '#e3b341', '#3fb950'],
  },
  [THEMES.SWITCHYARD]: {
    panel: '#111d22',
    body: '#091014',
    line: 'rgba(99, 208, 194, 0.18)',
    highlight: '#63d0c2',
    dots: ['#43d19e', '#63d0c2', '#7a93ff'],
  },
};

export function getAppearanceSectionStyle() {
  return {
    ...chromeSurfaceStyle({ surface: 'panel', emphasized: true }),
    background:
      'linear-gradient(180deg, var(--chrome-panel-fill-emphasis), var(--chrome-panel-fill))',
  };
}

export function getAppearanceBadgeStyle() {
  return {
    ...chromeSurfaceStyle({ surface: 'pill', tone: 'accent' }),
    color: 'var(--text-primary)',
  };
}

export function getAppearanceOptionStyle(isActive) {
  return {
    ...chromeSurfaceStyle({ surface: 'panel', emphasized: isActive }),
    background: isActive ? 'var(--chrome-panel-fill-emphasis)' : 'var(--chrome-panel-fill)',
    borderColor: isActive
      ? 'color-mix(in srgb, var(--accent-primary) 35%, var(--chrome-border-color))'
      : 'var(--chrome-border-color)',
    transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
  };
}

export function getAppearanceControlStyle() {
  return {
    ...chromeSurfaceStyle({ surface: 'pill' }),
    background: 'var(--chrome-control-fill)',
    color: 'var(--text-primary)',
  };
}

export function getAppearanceAccentSwatchStyle(isActive, color) {
  return {
    ...chromeSurfaceStyle({
      surface: 'panel',
      emphasized: isActive,
      tone: isActive ? 'accent' : 'neutral',
    }),
    background: isActive ? 'var(--chrome-panel-fill-emphasis)' : 'var(--chrome-panel-fill)',
    borderColor: isActive
      ? 'color-mix(in srgb, var(--accent-primary) 55%, var(--chrome-border-color))'
      : 'var(--chrome-border-color)',
    boxShadow: isActive ? 'var(--chrome-shadow-panel)' : '6px 6px 0 rgba(1, 4, 9, 0.18)',
    transform: isActive ? 'translate(-2px, -2px)' : 'translate(0, 0)',
    '--appearance-accent-preview': color ?? 'var(--accent-primary)',
  };
}

export default function AppearancePage() {
  const [activeTheme, setActiveTheme] = useState(THEMES.DEEP_SEA);
  const [activeMorphology, setActiveMorphology] = useState(MORPHOLOGIES.DEFAULT);
  const [activeAccent, setActiveAccent] = useState('theme');
  const [activePalette, setActivePalette] = useState('mineral');
  const [currentZoom, setCurrentZoom] = useState(1);
  const [terminalRendererMode, setTerminalRendererMode] = useState('xterm-webgl');
  const [restorePrefs, setRestorePrefs] = useState({
    opencode: RESTORE_POLICY.AUTO,
    generic: RESTORE_POLICY.AUTO,
    swarm: RESTORE_POLICY.AUTO,
  });
  const [activeTerminalHeaderStyle, setActiveTerminalHeaderStyle] = useState(
    TERMINAL_HEADER_STYLES.DRAGON
  );
  const [terminalAccentBarVisible, setTerminalAccentBarVisible] = useState(true);

  useEffect(() => {
    setActiveTheme(getStoredTheme());
    setActiveMorphology(getStoredMorphology());
    setActiveAccent(getStoredAccent());
    setActivePalette(getStoredPalette());
    setCurrentZoom(getStoredZoom());
    if (typeof window !== 'undefined') {
      setTerminalRendererMode(readTerminalRendererDefaultModeSetting(window.localStorage));
      const saved = readTerminalRestorePreferences(window.localStorage);
      setRestorePrefs(saved);
      setActiveTerminalHeaderStyle(getStoredTerminalHeaderStyle());
      setTerminalAccentBarVisible(getStoredTerminalAccentBarVisible());
    }
  }, []);

  const handleZoomChange = (newZoom) => {
    const zoom = setZoom(newZoom);
    setCurrentZoom(zoom);
  };

  const activeThemeLabel = useMemo(
    () => THEME_OPTIONS.find((theme) => theme.id === activeTheme)?.label ?? 'Deep Sea',
    [activeTheme]
  );

  const activeMorphologyLabel = useMemo(
    () =>
      MORPHOLOGY_OPTIONS.find((morphology) => morphology.id === activeMorphology)?.label ??
      'Default',
    [activeMorphology]
  );

  const handleSelectTheme = (themeId) => {
    const normalized = setTheme(themeId);
    setActiveTheme(normalized);
  };

  const handleSelectMorphology = (morphologyId) => {
    const normalized = setMorphology(morphologyId);
    setActiveMorphology(normalized);
  };

  const handleSelectAccent = (accentId) => {
    const normalized = setAccent(accentId);
    setActiveAccent(normalized);
  };

  const handleSelectPalette = (paletteId) => {
    const normalized = setPalette(paletteId);
    setActivePalette(normalized);
  };

  const handleTerminalRendererChange = (event) => {
    const nextMode = event.target.value;
    if (typeof window !== 'undefined') {
      writeTerminalRendererDefaultModeSetting(window.localStorage, nextMode);
    }
    setTerminalRendererMode(nextMode);
  };

  const handleRestorePolicyChange = (sessionType) => (event) => {
    const nextPolicy = event.target.value;
    if (typeof window !== 'undefined') {
      writeTerminalRestorePreferences(window.localStorage, { [sessionType]: nextPolicy });
    }
    setRestorePrefs((prev) => ({ ...prev, [sessionType]: nextPolicy }));
  };

  const handleSelectTerminalHeaderStyle = (styleId) => {
    const normalized = setTerminalHeaderStyle(styleId);
    setActiveTerminalHeaderStyle(normalized);
    // When user changes header style, persist accent bar visibility alongside
    if (typeof window !== 'undefined') {
      setStoredTerminalAccentBarVisible(terminalAccentBarVisible);
      // Also apply to the terminal container element directly
      const container = document.querySelector('[data-terminal-container]');
      if (container) {
        container.setAttribute('data-terminal-header-style', normalized);
        container.setAttribute('data-terminal-accent-bar', String(terminalAccentBarVisible));
      }
    }
  };

  const handleToggleTerminalAccentBar = () => {
    const nextVisible = !terminalAccentBarVisible;
    setStoredTerminalAccentBarVisible(nextVisible);
    setTerminalAccentBarVisible(nextVisible);
    if (typeof window !== 'undefined') {
      const container = document.querySelector('[data-terminal-container]');
      if (container) {
        container.setAttribute('data-terminal-accent-bar', String(nextVisible));
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Appearance
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Choose your preferred visual style.
        </p>
      </div>

      <ChromeSurface asChild surface="panel" emphasized>
        <section
          data-testid="appearance-theme-shell"
          className="rounded-2xl border p-6"
          style={getAppearanceSectionStyle()}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                Theme
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Changes apply instantly and are saved on this device.
              </p>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
              style={{
                ...getAppearanceBadgeStyle(),
              }}
            >
              <Palette size={12} style={{ color: 'var(--accent-primary)' }} />
              Active: {activeThemeLabel}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {THEME_OPTIONS.map((option) => {
              const preview = PREVIEW_BY_THEME[option.id] ?? PREVIEW_BY_THEME[THEMES.DEEP_SEA];
              const isActive = option.id === activeTheme;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelectTheme(option.id)}
                  className="group relative text-left rounded-xl border p-2 transition-all"
                  style={getAppearanceOptionStyle(isActive)}
                >
                  <div
                    className="relative overflow-hidden rounded-lg border h-40"
                    style={{
                      background: preview.body,
                      borderColor: isActive
                        ? 'color-mix(in srgb, var(--accent-primary) 34%, transparent)'
                        : preview.line,
                    }}
                  >
                    <div
                      className="h-8 border-b px-3 flex items-center justify-between"
                      style={{ background: preview.panel, borderColor: preview.line }}
                    >
                      <div className="flex items-center gap-1.5">
                        {preview.dots.map((dot, index) => (
                          <span
                            key={`${option.id}-${index}`}
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: dot }}
                          />
                        ))}
                      </div>
                      <span className="h-4 w-9 rounded" style={{ background: preview.highlight }} />
                    </div>
                    <div className="p-3 h-[calc(100%-2rem)] grid grid-cols-[30%_1fr] gap-2">
                      <div
                        className="rounded-md"
                        style={{ background: preview.panel, border: `1px solid ${preview.line}` }}
                      />
                      <div className="flex flex-col gap-2">
                        <div
                          className="h-4 rounded"
                          style={{ width: '55%', background: `${preview.highlight}33` }}
                        />
                        <div
                          className="flex-1 rounded-md"
                          style={{ background: preview.panel, border: `1px solid ${preview.line}` }}
                        />
                      </div>
                    </div>

                    {isActive && (
                      <span
                        className="absolute right-2 top-2 h-6 min-w-6 px-1.5 rounded-full inline-flex items-center justify-center gap-1 text-[11px] font-medium"
                        style={{ background: 'var(--accent-primary)', color: 'white' }}
                      >
                        <Check size={12} />
                      </span>
                    )}
                  </div>

                  <div className="pt-3 px-1 pb-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {option.label}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {option.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className="mt-4 rounded-lg px-3 py-2 text-xs"
            style={{
              ...getAppearanceControlStyle(),
              color: 'var(--text-muted)',
            }}
          >
            Your current platform shortcuts and components adapt to this theme automatically.
          </div>
        </section>
      </ChromeSurface>

      <ChromeSurface asChild surface="panel" emphasized>
        <section className="rounded-2xl border p-6" style={getAppearanceSectionStyle()}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                Terminal Zone
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Per-terminal visual customization independent of app-level theme.
              </p>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
              style={getAppearanceBadgeStyle()}
            >
              <Monitor size={12} style={{ color: 'var(--accent-primary)' }} />
              {getTerminalHeaderStyleOptions().find((o) => o.id === activeTerminalHeaderStyle)
                ?.label ?? 'Dragon'}
            </div>
          </div>

          <div className="mb-5">
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
              Header style
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {getTerminalHeaderStyleOptions().map((option) => {
                const isActive = option.id === activeTerminalHeaderStyle;
                return (
                  <button
                    key={option.id}
                    data-testid={`terminal-header-style-${option.id}`}
                    type="button"
                    onClick={() => handleSelectTerminalHeaderStyle(option.id)}
                    className="group text-left rounded-xl border p-3 transition-all"
                    style={getAppearanceOptionStyle(isActive)}
                  >
                    <div className="mb-2">
                      {/* Mini preview of the header style */}
                      <div
                        className="h-6 rounded-t-md border-b"
                        style={{
                          background:
                            option.id === 'dragon'
                              ? 'linear-gradient(180deg, var(--surface-elevated), var(--surface-card))'
                              : option.id === 'gradient'
                                ? 'linear-gradient(180deg, var(--surface-elevated), var(--surface-card))'
                                : 'var(--surface-card)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      />
                      {option.id === 'dragon' && (
                        <div
                          className="h-1 rounded-b-sm"
                          style={{ background: 'var(--accent-primary)' }}
                        />
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className="text-xs font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {option.label}
                        </p>
                        <p
                          className="text-[10px] mt-0.5 leading-relaxed"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {option.description}
                        </p>
                      </div>
                      {isActive && (
                        <span
                          className="h-5 min-w-5 px-1 rounded-full inline-flex items-center justify-center"
                          style={{ background: 'var(--accent-primary)', color: 'white' }}
                        >
                          <Check size={10} />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent bar toggle */}
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
              aria-checked={terminalAccentBarVisible}
              data-testid="terminal-accent-bar-toggle"
              onClick={handleToggleTerminalAccentBar}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{
                background: terminalAccentBarVisible
                  ? 'var(--accent-primary)'
                  : 'var(--surface-muted)',
              }}
            >
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                style={{
                  transform: terminalAccentBarVisible ? 'translateX(22px)' : 'translateX(2px)',
                }}
              />
            </button>
          </div>
        </section>
      </ChromeSurface>

      <ChromeSurface asChild surface="panel" emphasized>
        <section className="rounded-2xl border p-6" style={getAppearanceSectionStyle()}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                Accent signal
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Override the live accent without changing the base theme palette.
              </p>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
              style={{
                ...getAppearanceBadgeStyle(),
              }}
            >
              <Palette size={12} style={{ color: 'var(--accent-primary)' }} />
              Active:{' '}
              {ACCENT_OPTIONS.find((option) => option.id === activeAccent)?.label ?? 'Theme sync'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {ACCENT_OPTIONS.map((option) => {
              const isActive = option.id === activeAccent;
              const swatchStyle = getAppearanceAccentSwatchStyle(isActive, option.primary);
              return (
                <button
                  key={option.id}
                  data-testid={`appearance-accent-option-${option.id}`}
                  type="button"
                  onClick={() => handleSelectAccent(option.id)}
                  className="group rounded-xl border p-4 text-left transition-all"
                  style={swatchStyle}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className="text-sm font-semibold uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {option.label}
                      </p>
                      <p
                        className="mt-1 text-xs leading-relaxed"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {option.description}
                      </p>
                    </div>
                    {isActive ? (
                      <span
                        className="h-6 min-w-6 px-1.5 rounded-full inline-flex items-center justify-center gap-1 text-[11px] font-medium"
                        style={{ background: 'var(--accent-primary)', color: 'white' }}
                      >
                        <Check size={12} />
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    {[0, 1, 2].map((index) => (
                      <span
                        key={`${option.id}-accent-preview-${index}`}
                        className="h-10 flex-1 border"
                        style={{
                          borderColor:
                            'color-mix(in srgb, var(--appearance-accent-preview) 42%, var(--chrome-border-color))',
                          background:
                            index === 1
                              ? 'color-mix(in srgb, var(--appearance-accent-preview) 18%, var(--chrome-panel-fill-emphasis))'
                              : 'color-mix(in srgb, var(--appearance-accent-preview) 10%, var(--chrome-panel-fill))',
                          boxShadow:
                            index === 1
                              ? 'inset 0 0 0 1px color-mix(in srgb, var(--appearance-accent-preview) 38%, transparent)'
                              : 'none',
                        }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className="mt-4 rounded-lg px-3 py-2 text-xs"
            style={{
              ...getAppearanceControlStyle(),
              color: 'var(--text-muted)',
            }}
          >
            Preview colors update badges, button chrome, and live status accents across the app.
          </div>
        </section>
      </ChromeSurface>

      <ChromeSurface asChild surface="panel" emphasized>
        <section className="rounded-2xl border p-6" style={getAppearanceSectionStyle()}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                Morphology
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Chrome shape and surface treatment stay independent from theme colors.
              </p>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
              style={{
                ...getAppearanceBadgeStyle(),
              }}
            >
              <Palette size={12} style={{ color: 'var(--accent-primary)' }} />
              Active: {activeMorphologyLabel}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {MORPHOLOGY_OPTIONS.map((option) => {
              const isActive = option.id === activeMorphology;

              return (
                <ChromeSurface key={option.id} asChild surface="panel" emphasized={isActive}>
                  <button
                    data-testid={`appearance-morphology-option-${option.id}`}
                    type="button"
                    onClick={() => handleSelectMorphology(option.id)}
                    className="group relative text-left rounded-xl border p-4 transition-all"
                    style={getAppearanceOptionStyle(isActive)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p
                          className="text-sm font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {option.label}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                          {option.description}
                        </p>
                      </div>
                      {isActive ? (
                        <span
                          className="h-6 min-w-6 px-1.5 rounded-full inline-flex items-center justify-center gap-1 text-[11px] font-medium"
                          style={{ background: 'var(--accent-primary)', color: 'white' }}
                        >
                          <Check size={12} />
                        </span>
                      ) : null}
                    </div>
                  </button>
                </ChromeSurface>
              );
            })}
          </div>

          {activeMorphology === MORPHOLOGIES.SWITCHYARD && (
            <div className="mt-4 flex items-center gap-2">
              {PALETTE_OPTIONS.map((palette) => {
                const isPaletteActive = palette.id === activePalette;
                return (
                  <button
                    key={palette.id}
                    data-testid={`appearance-palette-option-${palette.id}`}
                    type="button"
                    onClick={() => handleSelectPalette(palette.id)}
                    className="flex-1 rounded-xl border py-3 px-4 text-left transition-all"
                    style={{
                      background: isPaletteActive
                        ? 'var(--chrome-panel-fill-emphasis)'
                        : 'var(--chrome-panel-fill)',
                      borderColor: isPaletteActive
                        ? 'color-mix(in srgb, var(--accent-primary) 35%, var(--chrome-border-color))'
                        : 'var(--chrome-border-color)',
                      boxShadow: isPaletteActive ? 'var(--chrome-shadow-panel)' : 'none',
                      transform: isPaletteActive ? 'translateY(-1px)' : 'translateY(0)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ background: palette.primary }}
                      />
                      <span
                        className="text-xs font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {palette.label}
                      </span>
                    </div>
                    <p
                      className="mt-1 text-[10px] leading-relaxed"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {palette.description}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </ChromeSurface>

      <ChromeSurface asChild surface="panel" emphasized>
        <section className="rounded-2xl border p-6" style={getAppearanceSectionStyle()}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                Terminal renderer
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                xterm-webgl is the only active renderer (WebGL-accelerated, works on all platforms
                including Windows). Plain xterm is the internal fallback if WebGL encounters an
                issue. Legacy VTE/GTK code is present but disabled and not selectable.
              </p>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
              style={{
                ...getAppearanceBadgeStyle(),
              }}
            >
              <Monitor size={12} style={{ color: 'var(--accent-primary)' }} />
              Active:{' '}
              {terminalRendererMode === 'xterm-webgl'
                ? 'xterm-webgl'
                : terminalRendererMode === 'vte-experimental'
                  ? 'vte-experimental'
                  : 'xterm (fallback)'}
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
                ...getAppearanceControlStyle(),
                color: 'var(--text-primary)',
              }}
            >
              <option value="xterm-webgl">xterm-webgl (always active)</option>
              <option value="vte-experimental">vte-experimental (legacy Linux/Tauri opt-in)</option>
              <option value="xterm">xterm (DOM fallback)</option>
            </select>
          </label>

          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            This preference applies to new terminal views. Existing fallbacks and explicit panel
            recoveries keep working.
          </p>
        </section>
      </ChromeSurface>

      <ChromeSurface asChild surface="panel" emphasized>
        <section className="rounded-2xl border p-6" style={getAppearanceSectionStyle()}>
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
                ...getAppearanceBadgeStyle(),
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
              style={getAppearanceControlStyle()}
            >
              <Minus size={18} style={{ color: 'var(--text-primary)' }} />
            </button>

            <div
              className="flex-1 h-2 rounded-full relative overflow-hidden"
              style={{
                ...getAppearanceControlStyle(),
                minHeight: '0.5rem',
                padding: 0,
              }}
            >
              <div
                className="absolute inset-y-0 left-0 bg-accent-primary transition-all duration-300"
                style={{ width: `${((currentZoom - 0.5) / 1.5) * 100}%` }}
              />
            </div>

            <button
              onClick={() => handleZoomChange(currentZoom + 0.1)}
              disabled={currentZoom >= 2}
              className="w-10 h-10 rounded-xl border flex items-center justify-center transition-all hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed"
              style={getAppearanceControlStyle()}
            >
              <Plus size={18} style={{ color: 'var(--text-primary)' }} />
            </button>

            <button
              onClick={() => handleZoomChange(1)}
              title="Reset to 100%"
              className="w-10 h-10 rounded-xl border flex items-center justify-center transition-all hover:bg-surface-elevated"
              style={getAppearanceControlStyle()}
            >
              <RotateCcw size={18} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </section>
      </ChromeSurface>

      <ChromeSurface asChild surface="panel" emphasized>
        <section className="rounded-2xl border p-6" style={getAppearanceSectionStyle()}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                Restauración de Terminales
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Elige cómo se restauran las terminales al iniciar DevHub.
              </p>
            </div>
          </div>

          <div className="space-y-4">
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
                    ...getAppearanceControlStyle(),
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

          <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Automático: restaura al iniciar. Manual: panel suspendido hasta que hagas clic en
            continuar. Desactivado: ignora esta terminal al inicio.
          </p>
        </section>
      </ChromeSurface>

      <section
        className="rounded-xl border p-4"
        style={{
          ...getAppearanceControlStyle(),
          background: 'var(--chrome-panel-fill)',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Visual direction: contrast-first, harder planes, and morphology-led chrome that stays
          separate from theme color.
        </p>
      </section>
    </div>
  );
}
