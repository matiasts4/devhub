'use client';

import { useState, useCallback, useMemo } from 'react';
import { Palette, Sparkles, LayoutGrid, Moon, Sun, Check } from 'lucide-react';
import { getStoredTheme, setTheme, THEMES, THEME_OPTIONS } from '@/lib/theme/themes';
import { toast } from 'sonner';

const ONBOARDING_STORAGE_KEY = 'devhub:onboarding:settings-v1';

const ONBOARDING_STEPS = [
  {
    title: 'Bienvenido al sistema visual',
    description: 'Configura el look and feel completo de DevHub para esta maquina.',
  },
  { title: 'Elige un tema base', description: 'Puedes cambiar entre 8 temas cuando quieras.' },
  {
    title: 'Termina y guarda',
    description: 'Tu seleccion queda persistida en localStorage para futuros inicios.',
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
};

function ThemeOptionCard({ option, active, onClick }) {
  const preview = THEME_PREVIEW_BY_ID[option.id] || THEME_PREVIEW_BY_ID[THEMES.DEEP_SEA];
  return (
    <button
      type="button"
      onClick={() => onClick(option.id)}
      className={`w-full rounded-xl border p-2.5 text-left transition-all duration-200 ${active ? 'scale-[1.01]' : 'hover:border-borders-strong'}`}
      style={{
        borderColor: active
          ? 'color-mix(in srgb, var(--accent-primary) 45%, transparent)'
          : 'var(--border-subtle)',
        background: active
          ? 'color-mix(in srgb, var(--surface-elevated) 92%, transparent)'
          : 'var(--surface-card)',
        boxShadow: active ? 'var(--shadow-soft)' : 'none',
      }}
    >
      <div
        className="relative overflow-hidden rounded-lg border h-28"
        style={{
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
          <span className="h-3.5 w-7 rounded" style={{ background: preview.highlight }} />
        </div>
        <div className="p-2 h-[calc(100%-1.75rem)] grid grid-cols-[28%_1fr] gap-1.5">
          <div
            className="rounded"
            style={{ background: preview.panel, border: `1px solid ${preview.line}` }}
          />
          <div className="flex flex-col gap-1.5">
            <div
              className="h-3 rounded"
              style={{ width: '50%', background: `${preview.highlight}30` }}
            />
            <div
              className="flex-1 rounded"
              style={{ background: preview.panel, border: `1px solid ${preview.line}` }}
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
        className="w-full max-w-lg rounded-2xl p-6"
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lifted)',
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
            className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg disabled:opacity-50"
            style={{
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              background: 'var(--surface-muted)',
            }}
          >
            Atras
          </button>
          <button
            type="button"
            onClick={isLast ? onClose : onNext}
            className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'var(--accent-primary)', color: 'white' }}
          >
            {isLast ? 'Terminar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppearanceSection({ initialTheme, onThemeChange }) {
  const [activeTheme, setActiveTheme] = useState(initialTheme || THEMES.DEEP_SEA);
  const [themeFilter, setThemeFilter] = useState('all');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  const handleThemeChange = useCallback(
    (themeId) => {
      const next = setTheme(themeId);
      setActiveTheme(next);
      onThemeChange?.(next);
      toast.success(`Tema aplicado: ${THEME_OPTIONS.find((t) => t.id === next)?.label || next}`);
    },
    [onThemeChange]
  );

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

  const filteredThemes = useMemo(() => {
    if (themeFilter === 'all') return THEME_OPTIONS;
    if (themeFilter === 'dark') return THEME_OPTIONS.filter((t) => t.id !== THEMES.LIGHT);
    return THEME_OPTIONS.filter((t) => t.id === THEMES.LIGHT);
  }, [themeFilter]);

  const activeThemeData = THEME_OPTIONS.find((t) => t.id === activeTheme);

  return (
    <div className="space-y-6">
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: `${activeThemeData?.accent}18`,
                border: `1px solid ${activeThemeData?.accent}30`,
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
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" /> Onboarding
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                themeFilter === key
                  ? 'bg-surface-elevated text-text-primary border-[#388BFD]/30'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-elevated border-transparent'
              }`}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
