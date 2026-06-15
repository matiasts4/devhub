'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  Settings,
  Save,
  User,
  Palette,
  Trash2,
  Loader2,
  AlertTriangle,
  Check,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Rocket,
  FolderOpen,
  LayoutGrid,
  Shield,
  Bell,
  Zap,
  Moon,
  Sun,
  Hash,
  Cpu,
  Server,
  SlidersHorizontal,
  Power,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/db/localClient';
import { toast } from 'sonner';
import {
  ACCENT_OPTIONS,
  getStoredAccent,
  getStoredMorphology,
  getStoredTheme,
  getStoredTerminalAccentBarVisible,
  getStoredTerminalHeaderStyle,
  getStoredZoom,
  getTerminalHeaderStyleOptions,
  MORPHOLOGY_OPTIONS,
  setAccent,
  setMorphology,
  setStoredTerminalAccentBarVisible,
  setTerminalHeaderStyle,
  setTheme,
  setZoom,
  TERMINAL_HEADER_STYLES,
  THEMES,
  THEME_OPTIONS,
} from '@/lib/theme/themes';
import LLMProviderSettings from '@/components/settings/LLMProviderSettings';
import WorkspacePageTitle from '@/components/workspace/WorkspacePageTitle';
import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import {
  DOCUMENTATION_POLICY_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  buildProjectUpdatePayload,
  DEFAULT_DOCUMENTATION_POLICY,
  DEFAULT_PROJECT_TYPE,
} from '@/lib/projectClassification';
import {
  MonitorSmartphone,
  GraduationCap,
  FlaskConical,
  BarChart3,
  Palette as ProjectPalette,
} from 'lucide-react';
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
import { getWorkspaceBreadcrumbStyle, getWorkspacePageContentStyle } from './workspacePageChrome';
import {
  panelStyle,
  pillStyle,
  btnPrimaryStyle,
  btnSecondaryStyle,
  btnDangerStyle,
  dangerBannerStyle,
  inputStyle,
} from '@/chrome/morphology';

const PROJECT_ACCENT_COLORS = [
  '#58A6FF',
  '#3FB950',
  '#F778BA',
  '#D2A8FF',
  '#E3B341',
  '#FF7B72',
  '#6366f1',
  '#f97316',
];
const ONBOARDING_STORAGE_KEY = 'devhub:onboarding:settings-v1';

const ONBOARDING_STEPS = [
  {
    title: 'Bienvenido al sistema visual',
    description: 'Configura el look and feel completo de DevHub para esta máquina.',
  },
  { title: 'Elige un tema base', description: 'Puedes cambiar entre 8 temas cuando quieras.' },
  {
    title: 'Termina y guarda',
    description: 'Tu selección queda persistida en localStorage para futuros inicios.',
  },
];

const THEME_PREVIEW_BY_ID = {
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
  [THEMES.CATPPUCCIN]: {
    panel: '#1e1e2e',
    body: '#181825',
    line: '#45475a',
    highlight: '#cba6f7',
    dots: ['#f38ba8', '#f9e2af', '#a6e3a1'],
  },
  [THEMES.TOKYO_NIGHT]: {
    panel: '#1f2335',
    body: '#1a1b26',
    line: '#3b4261',
    highlight: '#7aa2f7',
    dots: ['#f7768e', '#e0af68', '#9ece6a'],
  },
  [THEMES.MONOKAI]: {
    panel: '#2d2e27',
    body: '#272822',
    line: '#49483e',
    highlight: '#a6e22e',
    dots: ['#f92672', '#e6db74', '#66d9ef'],
  },
  [THEMES.SYNTHWAVE]: {
    panel: '#1b1a2e',
    body: '#141222',
    line: '#3a3662',
    highlight: '#fe4450',
    dots: ['#ff6b6b', '#feca57', '#72f1b8'],
  },
  [THEMES.BRUTALIST_STAGE]: {
    body: '#0d0d0d',
    panel: '#141414',
    accent: '#e3b341',
    border: '#333333',
    line: '#333333',
    highlight: '#e3b341',
    dots: ['#e3b341', '#333333', '#0d0d0d'],
  },
};

/* ── Feature flag — terminal sub-section in Ajustes ──────────────────── */

const TERMINAL_SETTINGS_FLAG_KEY = 'devhub:terminal-settings-in-ajustes';

function useTerminalSettingsFlag() {
  const [enabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(TERMINAL_SETTINGS_FLAG_KEY) === 'true';
    } catch {
      return false;
    }
  });
  return enabled;
}

/* ── Terminal sub-section (port from src/app/settings/appearance/page.jsx) ─ */

function TerminalSubSection() {
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
    window.dispatchEvent(
      new CustomEvent('devhub:terminal-typography-changed', { detail: next })
    );
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
    window.dispatchEvent(
      new CustomEvent('devhub:terminal-typography-changed', { detail: next })
    );
  };

  return (
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
            <option value="vte-experimental">vte-experimental (legacy Linux/Tauri opt-in)</option>
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
          Zoom Level
        </h4>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Adjust the overall size of the interface (Ctrl +/-).
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
            style={{ ...chromeSurfaceStyle({ surface: 'pill' }), minHeight: '0.5rem', padding: 0 }}
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
  );
}

/* ── Small reusable components ─────────────────────────────────────────── */

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative w-11 h-6 flex items-center rounded-none transition-colors duration-200 focus:outline-none cursor-pointer"
      style={{
        background: checked
          ? 'var(--success)'
          : 'color-mix(in srgb, var(--surface-muted) 80%, black)',
        border: '1px solid var(--border-strong)',
      }}
    >
      <span
        className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
      />
    </button>
  );
}

function ThemeOptionCard({ option, active, onClick }) {
  const preview = THEME_PREVIEW_BY_ID[option.id] || THEME_PREVIEW_BY_ID[THEMES.DEEP_SEA];

  return (
    <button
      type="button"
      onClick={() => onClick(option.id)}
      className={`w-full border p-2.5 text-left transition-all duration-200 ${active ? 'scale-[1.01]' : 'hover:border-borders-strong'}`}
        style={{
          ...chromeSurfaceStyle({ surface: 'panel', emphasized: active }),
          borderColor: active
            ? 'color-mix(in srgb, var(--accent-primary) 45%, transparent)'
            : 'var(--chrome-border-color)',
        }}
    >
      <div
        className="relative overflow-hidden border h-28"
        style={{
          borderRadius: 0,
          background: preview.body,
          borderColor: active
            ? 'color-mix(in srgb, var(--accent-primary) 35%, transparent)'
            : preview.line,
        }}
      >
        <div
          className="h-7 border-b px-2.5 flex items-center justify-between"
          style={{ background: preview.panel, borderColor: preview.line }}
        >
          <div className="flex items-center gap-1.5">
            {preview.dots.map((dot, i) => (
              <span
                key={`${option.id}-${i}`}
                className="h-2 w-2 rounded-full"
                style={{ background: dot }}
              />
            ))}
          </div>
          <span className="h-3.5 w-7" style={{ borderRadius: 0, background: preview.highlight }} />
        </div>
        <div className="p-2 h-[calc(100%-1.75rem)] grid grid-cols-[28%_1fr] gap-1.5">
          <div
            className="rounded-none"
            style={{
              background: preview.panel,
              border: `1px solid ${preview.line}`,
              borderRadius: 0,
            }}
          />
          <div className="flex flex-col gap-1.5">
            <div
              className="h-3 rounded-none"
              style={{ width: '50%', background: `${preview.highlight}30`, borderRadius: 0 }}
            />
            <div
              className="flex-1 rounded-none"
              style={{
                background: preview.panel,
                border: `1px solid ${preview.line}`,
                borderRadius: 0,
              }}
            />
          </div>
        </div>
        {active && (
          <span
            className="absolute right-1.5 top-1.5 h-5 min-w-5 px-1 rounded-full inline-flex items-center justify-center text-xs font-medium"
            style={{ background: 'var(--accent-primary)', color: 'white' }}
          >
            <Check className="w-3 h-3" />
          </span>
        )}
      </div>
      <div className="pt-2.5 px-0.5 pb-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {option.label}
          </p>
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: option.accent }}
          />
        </div>
        <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
          {option.description}
        </p>
      </div>
    </button>
  );
}

function MorphologyOptionCard({ option, active, onClick }) {
  return (
    <button
      data-testid={`ajustes-morphology-option-${option.id}`}
      type="button"
      onClick={() => onClick(option.id)}
      className={`w-full border p-3 text-left transition-all duration-200 ${active ? 'scale-[1.01]' : ''}`}
        style={{
          ...chromeSurfaceStyle({ surface: 'panel', emphasized: active }),
          borderColor: active
            ? 'color-mix(in srgb, var(--accent-primary) 24%, var(--chrome-border-color))'
            : 'var(--chrome-border-color)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {option.label}
          </p>
          {active ? (
            <span
              className="inline-flex items-center justify-center min-w-5 h-5 px-1 text-[10px] font-medium"
              style={{
                ...chromeSurfaceStyle({ surface: 'pill' }),
                color: 'var(--text-primary)',
              }}
            >
            Activa
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
        {option.description}
      </p>
    </button>
  );
}

function OnboardingWizard({ open, step, onPrev, onNext, onClose, onSkip }) {
  if (!open) return null;
  const stepData = ONBOARDING_STEPS[step];
  const isLast = step === ONBOARDING_STEPS.length - 1;

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[46px] z-40 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
    >
      <div
        className="w-full max-w-lg p-6"
        style={{
          ...chromeSurfaceStyle({ surface: 'panel', emphasized: true }),
          background:
            'linear-gradient(180deg, var(--chrome-panel-fill-emphasis), var(--chrome-panel-fill))',
        }}
      >
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
              Onboarding Wizard
            </p>
          </div>
          <button onClick={onSkip} className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Saltar
          </button>
        </div>
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {stepData.title}
        </h3>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
          {stepData.description}
        </p>
        <div className="flex items-center gap-1.5 mt-6">
          {ONBOARDING_STEPS.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === step ? 22 : 10,
                background: i === step ? 'var(--accent-primary)' : 'var(--border-subtle)',
              }}
            />
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onPrev}
            disabled={step === 0}
            className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-none disabled:opacity-50"
            style={{
              ...chromeSurfaceStyle({ surface: 'pill' }),
              color: 'var(--text-secondary)',
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Atrás
          </button>
          <button
            type="button"
            onClick={isLast ? onClose : onNext}
            className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-none"
            style={{ background: 'var(--accent-primary)', color: 'white' }}
          >
            {isLast ? <Rocket className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            {isLast ? 'Terminar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Tab system for settings sections ──────────────────────────────────── */

const TABS = [
  { key: 'project', label: 'Proyecto', icon: LayoutGrid },
  { key: 'theme', label: 'Apariencia', icon: Palette },
  { key: 'llm', label: 'LLM', icon: Cpu },
  { key: 'swarm', label: 'Swarm', icon: Server },
  { key: 'profile', label: 'Perfil', icon: User },
  { key: 'prefs', label: 'Preferencias', icon: Settings },
  { key: 'danger', label: 'Peligro', icon: AlertTriangle },
];

/* ── Main component ────────────────────────────────────────────────────── */

export default function Ajustes() {
  const { project } = useOutletContext() || {};
  const db = createClient();
  const navigate = useNavigate();
  const terminalSettingsEnabled = useTerminalSettingsFlag();

  // Project settings
  const [name, setName] = useState(project?.name || '');
  const [description, setDesc] = useState(project?.description || '');
  const [color, setColor] = useState(project?.color || '#6366f1');
  const [status, setProjectStatus] = useState(project?.status || 'active');
  const [localPath, setLocalPath] = useState(project?.local_path || '');
  const [projectType, setProjectType] = useState(project?.project_type || DEFAULT_PROJECT_TYPE);
  const [planningPrompt, setPlanningPrompt] = useState(project?.planning_prompt || '');
  const [documentationPolicy, setDocumentationPolicy] = useState(
    project?.documentation_policy || DEFAULT_DOCUMENTATION_POLICY
  );
  const [savingProject, setSaving] = useState(false);

  // Profile settings
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // App settings
  const [appConfig, setAppConfig] = useState({
    autosave: true,
    notifications: true,
    confirmActions: true,
  });

  // Theme
  const [activeTheme, setActiveTheme] = useState(THEMES.DEEP_SEA);
  const [activeMorphology, setActiveMorphology] = useState('default');
  const [activeAccent, setActiveAccent] = useState('theme');
  const [themeFilter, setThemeFilter] = useState('all'); // all | dark | light

  // Tabs
  const [activeTab, setActiveTab] = useState('project');

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Swarm settings
  const [swarmConfig, setSwarmConfigState] = useState({
    max_concurrent_swarms: 5,
    swarm_enabled: true,
  });
  const [swarmStatus, setSwarmStatus] = useState(null);
  const [savingSwarm, setSavingSwarm] = useState(false);
  const [loadingSwarm, setLoadingSwarm] = useState(false);

  const handleSelectFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Seleccionar Directorio Base',
      });
      if (selected) setLocalPath(String(selected));
    } catch {
      toast.error('No se pudo abrir el selector de carpetas en este entorno');
    }
  };

  useEffect(() => {
    // Local-first: load profile directly
    db.from('profiles')
      .select('*')
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setFullName(data?.full_name || 'Usuario Local');
        }
      });
  }, []);

  useEffect(() => {
    const storedTheme = getStoredTheme();
    const storedMorphology = getStoredMorphology();
    const storedAccent = getStoredAccent();
    setActiveTheme(storedTheme);
    setActiveMorphology(storedMorphology);
    setActiveAccent(storedAccent);
    setTheme(storedTheme);
    setMorphology(storedMorphology);
    setAccent(storedAccent);
    const onboardingDone = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
    if (!onboardingDone) setWizardOpen(true);
    // Load swarm settings
    loadSwarmSettings();
  }, []);

  const handleThemeChange = useCallback((themeId) => {
    const next = setTheme(themeId);
    setActiveTheme(next);
    toast.success(`Tema aplicado: ${THEME_OPTIONS.find((t) => t.id === next)?.label || next}`);
  }, []);

  const handleMorphologyChange = useCallback((morphologyId) => {
    const next = setMorphology(morphologyId);
    setActiveMorphology(next);
    toast.success(
      `Morfologia aplicada: ${MORPHOLOGY_OPTIONS.find((m) => m.id === next)?.label || next}`
    );
  }, []);

  const handleAccentChange = useCallback((accentId) => {
    const next = setAccent(accentId);
    setActiveAccent(next);
    toast.success(
      `Acento aplicado: ${ACCENT_OPTIONS.find((option) => option.id === next)?.label || next}`
    );
  }, []);

  const finishOnboarding = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setWizardOpen(false);
    setWizardStep(0);
    toast.success('Onboarding completado');
  }, []);

  const skipOnboarding = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setWizardOpen(false);
    setWizardStep(0);
  }, []);

  async function saveProject() {
    setSaving(true);
    const { error } = await db
      .from('projects')
      .update(
        buildProjectUpdatePayload({
          name,
          description,
          color,
          status,
          local_path: localPath,
          project_type: projectType,
          planning_prompt: planningPrompt,
          documentation_policy: documentationPolicy,
        })
      )
      .eq('id', project?.id);
    setSaving(false);
    if (error) {
      toast.error('Error al guardar');
      return;
    }
    toast.success('Proyecto actualizado');
  }

  async function saveProfile() {
    setSavingProfile(true);
    const { error } = await db.from('profiles').upsert({ id: 'local-user', full_name: fullName });
    setSavingProfile(false);
    if (error) {
      toast.error('Error al guardar perfil');
      return;
    }
    toast.success('Perfil actualizado');
  }

  async function deleteProject() {
    setDeleting(true);
    const { error } = await db.from('projects').delete().eq('id', project?.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message || 'Error al eliminar');
      return;
    }
    toast.success('Proyecto eliminado');
    navigate('/hub');
  }

  async function loadSwarmSettings() {
    setLoadingSwarm(true);
    try {
      const [configRes, statusRes] = await Promise.all([
        fetch('/api/agenthub/config'),
        fetch('/api/agenthub/opencode/status'),
      ]);
      if (configRes.ok) {
        const config = await configRes.json();
        setSwarmConfigState(config);
      }
      if (statusRes.ok) {
        const status = await statusRes.json();
        setSwarmStatus(status);
      }
    } catch (err) {
      console.error('Error loading swarm settings:', err.message);
    } finally {
      setLoadingSwarm(false);
    }
  }

  async function saveSwarmSettings() {
    setSavingSwarm(true);
    try {
      const res = await fetch('/api/agenthub/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swarmConfig),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Error al guardar configuración del swarm');
        return;
      }
      const data = await res.json();
      setSwarmConfigState(data);
      toast.success('Configuración del swarm actualizada');
      // Refresh status
      const statusRes = await fetch('/api/agenthub/opencode/status');
      if (statusRes.ok) {
        setSwarmStatus(await statusRes.json());
      }
    } catch (err) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSavingSwarm(false);
    }
  }

  const filteredThemes = useMemo(() => {
    if (themeFilter === 'all') return THEME_OPTIONS;
    if (themeFilter === 'dark') return THEME_OPTIONS.filter((t) => t.id !== THEMES.LIGHT);
    return THEME_OPTIONS.filter((t) => t.id === THEMES.LIGHT);
  }, [themeFilter]);

  const activeThemeData = THEME_OPTIONS.find((t) => t.id === activeTheme);

  /* ── Tab content renderers ─────────────────────────────────────────── */

  const renderProjectTab = () => (
    <div className="space-y-6">
      {/* Project identity card */}
      <div className="overflow-hidden" style={panelStyle()}>
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{
            borderBottom: `var(--chrome-border-width) solid var(--chrome-border-color)`,
            background: 'var(--chrome-panel-fill-emphasis)',
          }}
        >
          <div
            className="w-9 h-9 rounded-none flex items-center justify-center"
            style={pillStyle({ tone: 'accent' })}
          >
            <LayoutGrid className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <h3
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Identidad del Proyecto
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Nombre, descripción, ruta y color de acento
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-xs mb-1.5 font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                Nombre del proyecto
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-none px-3 py-2.5 text-sm focus:outline-none transition-colors cursor-pointer"
                style={inputStyle()}
              />
            </div>
            <div>
              <label
                className="block text-xs mb-1.5 font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                Estado
              </label>
              <select
                value={status}
                onChange={(e) => setProjectStatus(e.target.value)}
                className="w-full text-sm rounded-none px-3 py-2.5 focus:outline-none appearance-none cursor-pointer"
                style={inputStyle()}
              >
                <option value="active">Activo</option>
                <option value="paused">Pausado</option>
                <option value="completed">Completado</option>
                <option value="archived">Archivado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-xs mb-1.5 font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                Tipo de proyecto
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PROJECT_TYPE_OPTIONS.map(({ value, label }) => {
                  const spec = {
                    software: { Icon: MonitorSmartphone, color: '#58A6FF' },
                    university: { Icon: GraduationCap, color: '#D2A8FF' },
                    research: { Icon: FlaskConical, color: '#3FB950' },
                    security: { Icon: ProjectPalette, color: '#E3B341' },
                    business: { Icon: BarChart3, color: '#F78166' },
                    creative: { Icon: ProjectPalette, color: '#FF79C6' },
                  }[value];
                  const selected = projectType === value;
                  const Icon = spec?.Icon || MonitorSmartphone;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setProjectType(value)}
                      className="border px-3 py-2 text-left transition-all"
                      style={panelStyle({
                        emphasized: selected,
                        tone: selected ? 'accent' : 'neutral',
                      })}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          className="w-3.5 h-3.5"
                          style={{
                            color: selected ? 'var(--accent-primary)' : 'var(--text-muted)',
                          }}
                        />
                        <span
                          className="text-xs font-medium"
                          style={{ color: selected ? 'var(--text-primary)' : 'var(--text-muted)' }}
                        >
                          {label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                className="block text-xs mb-1.5 font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                Política de documentación
              </label>
              <div className="space-y-2">
                {DOCUMENTATION_POLICY_OPTIONS.map(({ value, label, description }) => {
                  const selected = documentationPolicy === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDocumentationPolicy(value)}
                      className="w-full border px-3 py-2.5 text-left transition-all"
                      style={panelStyle({
                        emphasized: selected,
                        tone: selected ? 'accent' : 'neutral',
                      })}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className="text-xs font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {label}
                        </span>
                        <span
                          className="text-[10px] uppercase tracking-wide"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {selected ? 'Activa' : 'Disponible'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label
              className="block text-xs mb-1.5 font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Planning prompt
            </label>
            <textarea
              rows={3}
              value={planningPrompt}
              onChange={(e) => setPlanningPrompt(e.target.value)}
              className="w-full rounded-none px-3 py-2.5 text-sm focus:outline-none transition-colors resize-none cursor-pointer"
              style={{ ...inputStyle(), minHeight: '4rem' }}
            />
          </div>

          <div>
            <label
              className="block text-xs mb-1.5 font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Descripción
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full rounded-none px-3 py-2.5 text-sm focus:outline-none transition-colors resize-none cursor-pointer"
              style={{ ...inputStyle(), minHeight: '3rem' }}
            />
          </div>

          <div>
            <label
              className="block text-xs mb-1.5 font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Ruta Local (Directorio Base)
            </label>
            <div className="flex items-center gap-2">
              <input
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="/home/usuario/proyectos/mi-app"
                className="flex-1 rounded-none px-3 py-2.5 text-sm focus:outline-none transition-colors cursor-pointer"
                style={inputStyle()}
              />
              <button
                type="button"
                onClick={handleSelectFolder}
                className="w-10 h-10 rounded-none flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                style={btnSecondaryStyle({ size: 'sm' })}
                title="Explorar carpetas"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label
              className="block text-xs mb-2 font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Color de acento
            </label>
            <div className="flex items-center gap-2.5">
              {PROJECT_ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full transition-all hover:scale-110 flex items-center justify-center"
                  style={{
                    background: c,
                    outline: color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: '2px',
                    boxShadow: color === c ? `0 0 8px ${c}60` : 'none',
                  }}
                >
                  {color === c && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={saveProject}
              disabled={savingProject}
              className="flex items-center gap-2 font-medium px-5 py-2.5 rounded-none text-xs transition-all disabled:opacity-50 cursor-pointer"
              style={btnPrimaryStyle({ size: 'sm' })}
            >
              {savingProject ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Guardar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderThemeTab = () => (
    <div className="space-y-6">
      <ChromeSurface asChild surface="panel" emphasized>
        <div
          data-testid="ajustes-appearance-shell"
          className="overflow-hidden"
          style={chromeSurfaceStyle({ surface: 'panel', emphasized: true })}
        >
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-none flex items-center justify-center"
                style={{
                  ...pillStyle({ tone: 'accent' }),
                  background: `color-mix(in srgb, ${activeThemeData?.accent || 'var(--accent-primary)'} 14%, var(--chrome-control-fill))`,
                  borderColor: `color-mix(in srgb, ${activeThemeData?.accent || 'var(--accent-primary)'} 28%, var(--chrome-border-color))`,
                }}
              >
                <Palette className="w-4 h-4" style={{ color: activeThemeData?.accent }} />
              </div>
              <div>
                <h3
                  className="font-mono text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Apariencia
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Tema activo:{' '}
                  <span className="font-medium" style={{ color: activeThemeData?.accent }}>
                    {activeThemeData?.label}
                  </span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-none text-xs"
              style={{
                ...chromeSurfaceStyle({ surface: 'pill' }),
                color: 'var(--text-secondary)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Onboarding
            </button>
          </div>

          <div
            className="px-6 py-3 flex items-center gap-2"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            {[
              { key: 'all', label: 'Todos', icon: LayoutGrid },
              { key: 'dark', label: 'Oscuros', icon: Moon },
              { key: 'light', label: 'Claro', icon: Sun },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setThemeFilter(key)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-medium transition-all"
                style={
                  themeFilter === key
                    ? {
                        ...pillStyle({ tone: 'accent' }),
                        color: 'var(--text-primary)',
                      }
                    : {
                        ...pillStyle(),
                        color: 'var(--text-muted)',
                      }
                }
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredThemes.map((option) => (
                <ThemeOptionCard
                  key={option.id}
                  option={option}
                  active={activeTheme === option.id}
                  onClick={handleThemeChange}
                />
              ))}
            </div>
          </div>

          <div className="border-t px-6 py-5" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h4
                  className="font-mono text-sm font-semibold uppercase tracking-[0.18em]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Color de tema
                </h4>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Elegí una señal brutalist independiente del tema base.
                </p>
              </div>
              <span
                className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em]"
                style={{
                  ...chromeSurfaceStyle({ surface: 'pill', emphasized: true, tone: 'accent' }),
                  color: 'var(--text-primary)',
                }}
              >
                <Palette className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                {ACCENT_OPTIONS.find((option) => option.id === activeAccent)?.label ?? 'Theme sync'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {ACCENT_OPTIONS.map((option) => {
                const isActive = activeAccent === option.id;
                return (
                  <button
                    key={option.id}
                    data-testid={`ajustes-accent-option-${option.id}`}
                    type="button"
                    onClick={() => handleAccentChange(option.id)}
                    className="border p-4 text-left transition-all"
                    style={{
                      ...chromeSurfaceStyle({
                        surface: 'panel',
                        emphasized: isActive,
                        tone: isActive ? 'accent' : 'neutral',
                      }),
                      background: isActive
                        ? 'var(--chrome-panel-fill-emphasis)'
                        : 'var(--chrome-panel-fill)',
                      borderColor: isActive
                        ? 'color-mix(in srgb, var(--accent-primary) 55%, var(--chrome-border-color))'
                        : 'var(--chrome-border-color)',
                      boxShadow: isActive
                        ? 'var(--chrome-shadow-panel)'
                        : '6px 6px 0 rgba(1, 4, 9, 0.18)',
                      transform: isActive ? 'translate(-2px, -2px)' : 'translate(0, 0)',
                      '--settings-accent-preview': option.primary ?? 'var(--accent-primary)',
                    }}
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
                          className="mt-1 text-[11px] leading-relaxed"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {option.description}
                        </p>
                      </div>
                      {isActive ? (
                        <span
                          className="h-5 min-w-5 px-1 rounded-full inline-flex items-center justify-center text-xs font-medium"
                          style={{ background: 'var(--accent-primary)', color: 'white' }}
                        >
                          <Check className="w-3 h-3" />
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      {[0, 1, 2].map((index) => (
                        <span
                          key={`${option.id}-accent-preview-${index}`}
                          className="h-8 flex-1 border"
                          style={{
                            borderRadius: 0,
                            borderColor:
                              'color-mix(in srgb, var(--settings-accent-preview) 42%, var(--chrome-border-color))',
                            background:
                              index === 1
                                ? 'color-mix(in srgb, var(--settings-accent-preview) 18%, var(--chrome-panel-fill-emphasis))'
                                : 'color-mix(in srgb, var(--settings-accent-preview) 10%, var(--chrome-panel-fill))',
                          }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t px-6 py-5" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="mb-4">
              <h4 className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Morphology
              </h4>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Separa el lenguaje de chrome del color del tema activo.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MORPHOLOGY_OPTIONS.map((option) => (
                <ChromeSurface
                  key={option.id}
                  asChild
                  surface="panel"
                  emphasized={activeMorphology === option.id}
                >
                  <MorphologyOptionCard
                    option={option}
                    active={activeMorphology === option.id}
                    onClick={handleMorphologyChange}
                  />
                </ChromeSurface>
              ))}
            </div>
          </div>
          {terminalSettingsEnabled ? <TerminalSubSection /> : null}
        </div>
      </ChromeSurface>
    </div>
  );

  const renderLlmTab = () => <LLMProviderSettings embedded />;

  const renderSwarmTab = () => (
    <div className="space-y-6">
      {/* Swarm Status Card */}
      <div className="overflow-hidden" style={panelStyle()}>
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{
            borderBottom: `var(--chrome-border-width) solid var(--chrome-border-color)`,
            background: 'var(--chrome-panel-fill-emphasis)',
          }}
        >
          <div
            className="w-9 h-9 rounded-none flex items-center justify-center"
            style={{
              background: swarmStatus?.running
                ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                : 'color-mix(in srgb, var(--text-muted) 12%, transparent)',
              border: `1px solid ${swarmStatus?.running ? 'color-mix(in srgb, var(--success) 25%, transparent)' : 'color-mix(in srgb, var(--text-muted) 20%, transparent)'}`,
            }}
          >
            <Server
              className="w-4 h-4"
              style={{ color: swarmStatus?.running ? 'var(--success)' : 'var(--text-muted)' }}
            />
          </div>
          <div>
            <h3
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Estado del Servidor
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {swarmStatus?.running
                ? `OpenCode corriendo en puerto ${swarmStatus.port} (PID: ${swarmStatus.pid})`
                : 'Servidor no detectado'}
            </p>
          </div>
          <div className="ml-auto">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-none"
              style={{
                background: swarmStatus?.running
                  ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                  : 'color-mix(in srgb, var(--text-muted) 12%, transparent)',
                color: swarmStatus?.running ? 'var(--success)' : 'var(--text-muted)',
                border: `1px solid ${swarmStatus?.running ? 'color-mix(in srgb, var(--success) 25%, transparent)' : 'color-mix(in srgb, var(--text-muted) 20%, transparent)'}`,
              }}
            >
              <span
                className="w-2 h-2 rounded-none"
                style={{
                  background: swarmStatus?.running ? 'var(--success)' : 'var(--text-muted)',
                }}
              />
              {swarmStatus?.running ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>

        {swarmStatus && (
          <div className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'Sesiones Activas',
                  value: swarmStatus.activeSessions || 0,
                  color: 'var(--warning)',
                },
                {
                  label: 'Máx. Concurrente',
                  value: swarmStatus.maxConcurrent || 5,
                  color: 'var(--accent-primary)',
                },
                {
                  label: 'PID',
                  value: swarmStatus.pid || '—',
                  color: 'var(--text-primary)',
                },
                {
                  label: 'Puerto',
                  value: swarmStatus.port || 4153,
                  color: 'var(--text-primary)',
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="px-4 py-3"
                  style={{
                    ...panelStyle(),
                    background: `color-mix(in srgb, ${color} 10%, var(--chrome-panel-fill))`,
                    borderColor: `color-mix(in srgb, ${color} 24%, var(--chrome-border-color))`,
                  }}
                >
                  <p
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {label}
                  </p>
                  <p className="text-lg font-mono mt-1" style={{ color }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Swarm Configuration Card */}
      <div className="overflow-hidden" style={panelStyle()}>
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{
            borderBottom: `var(--chrome-border-width) solid var(--chrome-border-color)`,
            background: 'var(--chrome-panel-fill-emphasis)',
          }}
        >
          <div
            className="w-9 h-9 rounded-none flex items-center justify-center"
            style={pillStyle({ tone: 'accent' })}
          >
            <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div>
            <h3
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Configuración del Swarm
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Límites de concurrencia y estado del servicio
            </p>
          </div>
        </div>

        {loadingSwarm ? (
          <div
            className="p-6 flex items-center justify-center gap-2"
            style={{ color: 'var(--text-muted)' }}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Cargando configuración...</span>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Swarm Enabled Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Power
                  className="w-4 h-4"
                  style={{
                    color: swarmConfig.swarm_enabled ? 'var(--success)' : 'var(--text-muted)',
                  }}
                />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Swarm Habilitado
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Activar o desactivar el procesamiento por swarm
                  </p>
                </div>
              </div>
              <Toggle
                checked={swarmConfig.swarm_enabled}
                onChange={(v) => setSwarmConfigState((p) => ({ ...p, swarm_enabled: v }))}
              />
            </div>

            {/* Max Concurrent Slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Cpu className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Máximo de Swarms Concurrentes
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Cada proceso consume ~1.8GB de RAM
                    </p>
                  </div>
                </div>
                <span
                  className="text-lg font-mono font-bold px-3 py-1 rounded-none"
                  style={{
                    ...chromeSurfaceStyle({ surface: 'pill', emphasized: true, tone: 'accent' }),
                    color: 'var(--accent-primary)',
                  }}
                >
                  {swarmConfig.max_concurrent_swarms}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  1
                </span>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={swarmConfig.max_concurrent_swarms}
                  onChange={(e) =>
                    setSwarmConfigState((p) => ({
                      ...p,
                      max_concurrent_swarms: parseInt(e.target.value, 10),
                    }))
                  }
                  className="flex-1 h-2 rounded-none appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, var(--accent-primary) ${((swarmConfig.max_concurrent_swarms - 1) / 19) * 100}%, var(--surface-muted) ${((swarmConfig.max_concurrent_swarms - 1) / 19) * 100}%)`,
                  }}
                />
                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  20
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Memoria estimada: ~{(swarmConfig.max_concurrent_swarms * 1.8).toFixed(1)}GB RAM al
                  máximo
                </p>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-2">
              <button
                onClick={saveSwarmSettings}
                disabled={savingSwarm}
                className="flex items-center gap-2 text-white font-medium px-5 py-2.5 rounded-none text-xs transition-all disabled:opacity-50"
                style={{ background: 'var(--success)' }}
              >
                {savingSwarm ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Guardar configuración
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderProfileTab = () => (
    <div className="space-y-6">
      <div className="overflow-hidden" style={panelStyle()}>
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{
            borderBottom: `var(--chrome-border-width) solid var(--chrome-border-color)`,
            background: 'var(--chrome-panel-fill-emphasis)',
          }}
        >
          <div
            className="w-9 h-9 rounded-none flex items-center justify-center"
            style={pillStyle({ tone: 'accent' })}
          >
            <User className="w-4 h-4" style={{ color: '#D2A8FF' }} />
          </div>
          <div>
            <h3
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Perfil de Usuario
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Tu nombre visible en el sistema
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {profile && (
            <div
              className="flex items-center gap-3 p-3 rounded-none"
              style={{
                ...panelStyle({ emphasized: true }),
                boxShadow: 'var(--chrome-shadow-control)',
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-mono text-sm font-bold"
                style={{ background: 'var(--accent-primary)', color: 'white' }}
              >
                {(fullName || profile.email || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {fullName || 'Sin nombre'}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  {profile.email}
                </p>
              </div>
            </div>
          )}

          <div>
            <label
              className="block text-xs mb-1.5 font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Nombre completo
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full rounded-none px-3 py-2.5 text-sm focus:outline-none transition-colors cursor-pointer"
              style={inputStyle()}
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="flex items-center gap-2 font-medium px-5 py-2.5 rounded-none text-xs transition-all disabled:opacity-50"
            style={{ ...btnSecondaryStyle({ size: 'sm' }), color: 'var(--text-secondary)' }}
          >
            {savingProfile ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar perfil
          </button>
        </div>
      </div>
    </div>
  );

  const renderPrefsTab = () => (
    <div className="space-y-6">
      <div className="overflow-hidden" style={panelStyle()}>
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{
            borderBottom: `var(--chrome-border-width) solid var(--chrome-border-color)`,
            background: 'var(--chrome-panel-fill-emphasis)',
          }}
        >
          <div
            className="w-9 h-9 rounded-none flex items-center justify-center"
            style={pillStyle({ tone: 'accent' })}
          >
            <Settings className="w-4 h-4" style={{ color: '#E3B341' }} />
          </div>
          <div>
            <h3
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Preferencias
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Comportamiento general de la aplicación
            </p>
          </div>
        </div>

        <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {[
            {
              key: 'autosave',
              label: 'Guardar automáticamente',
              desc: 'Persistir cambios sin confirmación',
              icon: Zap,
            },
            {
              key: 'notifications',
              label: 'Notificaciones',
              desc: 'Alertas y actualizaciones en tiempo real',
              icon: Bell,
            },
            {
              key: 'confirmActions',
              label: 'Confirmar acciones destructivas',
              desc: 'Pedir confirmación antes de eliminar',
              icon: Shield,
            },
          ].map(({ key, label, desc, icon: Icon }) => (
            <div key={key} className="flex items-center justify-between px-6 py-4 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {label}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {desc}
                  </p>
                </div>
              </div>
              <Toggle
                checked={appConfig[key]}
                onChange={(v) => setAppConfig((p) => ({ ...p, [key]: v }))}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderDangerTab = () => (
    <div className="space-y-6">
      <div
        className="overflow-hidden"
        style={panelStyle({ tone: 'danger' })}
      >
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid color-mix(in srgb, var(--danger) 15%, transparent)' }}
        >
          <div
            className="w-9 h-9 rounded-none flex items-center justify-center"
            style={pillStyle({ tone: 'danger' })}
          >
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--danger)' }} />
          </div>
          <div>
            <h3 className="font-mono text-sm font-semibold" style={{ color: 'var(--danger)' }}>
              Zona de Peligro
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Acciones irreversibles
            </p>
          </div>
        </div>

        <div className="p-6">
          {!deleteConfirm ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Eliminar proyecto
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Esta acción eliminará el proyecto, todas sus tareas e hitos de forma permanente.
                </p>
              </div>
              <button
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-none transition-all shrink-0"
                style={{
                  ...btnDangerStyle({ size: 'sm' }),
                  boxShadow: 'var(--chrome-shadow-control)',
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-none" style={dangerBannerStyle()}>
                <AlertTriangle
                  className="w-5 h-5 shrink-0 mt-0.5"
                  style={{ color: 'var(--danger)' }}
                />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
                    ¿Estás seguro?
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Esta acción no se puede deshacer. Se perderán todos los datos del proyecto.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-none text-sm transition-all"
                  style={{
                    ...btnSecondaryStyle({ size: 'md' }),
                    width: '100%',
                    color: 'var(--text-muted)',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={deleteProject}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-none text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                  style={{ ...btnDangerStyle({ size: 'md' }), width: '100%' }}
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Sí, eliminar proyecto
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const TAB_RENDERERS = {
    project: renderProjectTab,
    theme: renderThemeTab,
    llm: renderLlmTab,
    swarm: renderSwarmTab,
    profile: renderProfileTab,
    prefs: renderPrefsTab,
    danger: renderDangerTab,
  };

  return (
    <div className="min-h-screen core-page-shell" style={{ color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-6 py-3 flex items-center justify-between core-sticky-header">
        <div className="flex items-center gap-3">
          <WorkspacePageTitle icon={Settings} title="Ajustes" projectName={project?.name} />
        </div>
      </div>

      <div style={getWorkspacePageContentStyle()}>
        {/* Tab navigation */}
        <div
          className="flex items-center gap-1 mb-6 overflow-x-auto pb-1 core-panel shadow-sm p-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-none text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === key ? 'text-text-primary' : 'text-text-muted hover:text-text-primary'
              }`}
              style={
                activeTab === key
                  ? {
                      ...chromeSurfaceStyle({ surface: 'pill', emphasized: true }),
                      color: 'var(--text-primary)',
                    }
                  : {
                      ...chromeSurfaceStyle({ surface: 'pill' }),
                      background: 'transparent',
                      borderColor: 'transparent',
                      boxShadow: 'none',
                    }
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="fade-in-up">{TAB_RENDERERS[activeTab]?.()}</div>
      </div>

      <OnboardingWizard
        open={wizardOpen}
        step={wizardStep}
        onPrev={() => setWizardStep((s) => Math.max(0, s - 1))}
        onNext={() => setWizardStep((s) => Math.min(ONBOARDING_STEPS.length - 1, s + 1))}
        onClose={finishOnboarding}
        onSkip={skipOnboarding}
      />
    </div>
  );
}
