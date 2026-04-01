"use client";

import { useEffect, useMemo, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { getStoredTheme, setTheme, THEME_OPTIONS, THEMES, getStoredZoom, setZoom } from '@/lib/theme/themes';
import { Minus, Plus, RotateCcw, Monitor } from 'lucide-react';


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
};

export default function AppearancePage() {
  const [activeTheme, setActiveTheme] = useState(THEMES.DEEP_SEA);
  const [currentZoom, setCurrentZoom] = useState(1);

  useEffect(() => {
    setActiveTheme(getStoredTheme());
    setCurrentZoom(getStoredZoom());
  }, []);

  const handleZoomChange = (newZoom) => {
    const zoom = setZoom(newZoom);
    setCurrentZoom(zoom);
  };

  const activeThemeLabel = useMemo(
    () => THEME_OPTIONS.find((theme) => theme.id === activeTheme)?.label ?? 'Deep Sea',
    [activeTheme]
  );

  const handleSelectTheme = (themeId) => {
    const normalized = setTheme(themeId);
    setActiveTheme(normalized);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Appearance
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Choose your preferred visual style.
        </p>
      </div>

      <section
        className="rounded-2xl border p-6"
        style={{
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 94%, transparent), color-mix(in srgb, var(--surface-elevated) 45%, transparent))',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-soft)',
        }}
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
              background: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 28%, transparent)',
              color: 'var(--text-secondary)',
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
                style={{
                  background: isActive
                    ? 'color-mix(in srgb, var(--surface-elevated) 96%, transparent)'
                    : 'color-mix(in srgb, var(--surface-muted) 88%, transparent)',
                  borderColor: isActive
                    ? 'color-mix(in srgb, var(--accent-primary) 42%, transparent)'
                    : 'var(--border-subtle)',
                  transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
                }}
              >
                <div
                  className="relative overflow-hidden rounded-lg border h-40"
                  style={{
                    background: preview.body,
                    borderColor: isActive ? 'color-mix(in srgb, var(--accent-primary) 34%, transparent)' : preview.line,
                  }}
                >
                  <div className="h-8 border-b px-3 flex items-center justify-between" style={{ background: preview.panel, borderColor: preview.line }}>
                    <div className="flex items-center gap-1.5">
                      {preview.dots.map((dot, index) => (
                        <span key={`${option.id}-${index}`} className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
                      ))}
                    </div>
                    <span className="h-4 w-9 rounded" style={{ background: preview.highlight }} />
                  </div>
                  <div className="p-3 h-[calc(100%-2rem)] grid grid-cols-[30%_1fr] gap-2">
                    <div className="rounded-md" style={{ background: preview.panel, border: `1px solid ${preview.line}` }} />
                    <div className="flex flex-col gap-2">
                      <div className="h-4 rounded" style={{ width: '55%', background: `${preview.highlight}33` }} />
                      <div className="flex-1 rounded-md" style={{ background: preview.panel, border: `1px solid ${preview.line}` }} />
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
            background: 'color-mix(in srgb, var(--surface-muted) 75%, transparent)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
        Your current platform shortcuts and components adapt to this theme automatically.
        </div>
      </section>

      <section
        className="rounded-2xl border p-6"
        style={{
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 94%, transparent), color-mix(in srgb, var(--surface-elevated) 45%, transparent))',
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
          Visual direction: contrast-first, subtle depth, and low-noise surfaces inspired by BridgeSpace.
        </p>
      </section>
    </div>
  );
}
