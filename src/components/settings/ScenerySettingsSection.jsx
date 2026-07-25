'use client';

/**
 * ScenerySettingsSection — CNVS-style wallpaper configuration panel.
 *
 * Provides:
 *  - Large active scenery preview card with ACTIVE badge
 *  - Scenery thumbnail grid grouped by category (live gradient previews)
 *  - Scope selector: Pizarra / Terminales / Ambos
 *  - Overlay opacity + blur sliders for readability tuning
 *  - Custom image URL input
 *  - "Ninguno" (none) option to disable
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ImageIcon, Check, Layers, Monitor, PenTool, Link2, X, Upload } from 'lucide-react';
import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import { panelStyle, pillStyle, inputStyle } from '@/chrome/morphology';
import {
  SCENERY_CATALOG,
  SCENERY_CATEGORY_META,
  SCENERY_CATEGORIES,
  getSceneryById,
  isImageScenery,
} from '@/lib/sceneries/sceneryCatalog';
import {
  readSceneryPrefs,
  writeSceneryPrefs,
  SCENERY_SCOPES,
  SCENERY_CHANGED_EVENT,
} from '@/lib/sceneries/sceneryPreferences';
import {
  imageFileToWallpaperDataUrl,
  SCENERY_UPLOAD_ERRORS,
} from '@/lib/sceneries/sceneryImageUpload';
import { sileo } from 'sileo';

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Build inline style for a scenery preview swatch (gradient or image). */
function sceneryPreviewStyle(scenery) {
  if (isImageScenery(scenery)) {
    return {
      backgroundColor: scenery.base,
      backgroundImage: `url(${scenery.src})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  return {
    backgroundColor: scenery.base,
    backgroundImage: scenery.layers.join(', '),
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

const SCOPE_OPTIONS = [
  { id: SCENERY_SCOPES.BOTH, label: 'Ambos', icon: Layers, desc: 'Pizarra + Terminales' },
  { id: SCENERY_SCOPES.PIZARRA, label: 'Pizarra', icon: PenTool, desc: 'Solo lienzo pizarra' },
  {
    id: SCENERY_SCOPES.TERMINAL,
    label: 'Terminales',
    icon: Monitor,
    desc: 'Solo workspaces terminal',
  },
];

const CATEGORY_ORDER = Object.entries(SCENERY_CATEGORY_META)
  .sort(([, a], [, b]) => a.order - b.order)
  .map(([key]) => key);

/* ── Sub-components ──────────────────────────────────────────────────── */

function SceneryThumbnail({ scenery, active, onSelect }) {
  return (
    <button
      type="button"
      data-testid={`scenery-thumb-${scenery.id}`}
      onClick={() => onSelect(scenery.id)}
      className="group relative w-full text-left transition-all duration-200 focus:outline-none"
      title={`${scenery.name} — ${scenery.subtitle}`}
    >
      <div
        className="relative h-20 w-full overflow-hidden border transition-all duration-200 group-hover:scale-[1.02]"
        style={{
          ...sceneryPreviewStyle(scenery),
          borderColor: active
            ? 'color-mix(in srgb, var(--accent-primary) 55%, transparent)'
            : 'var(--chrome-border-color)',
          borderWidth: active ? 2 : 1,
          boxShadow: active
            ? '0 0 12px color-mix(in srgb, var(--accent-primary) 25%, transparent)'
            : 'none',
        }}
      >
        {active && (
          <span
            className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: 'var(--accent-primary)' }}
          >
            <Check className="h-3 w-3 text-white" />
          </span>
        )}
        {/* Image-mode badge (bundled wallpaper vs. CSS gradient) */}
        {isImageScenery(scenery) && (
          <span
            className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: 'rgba(8, 10, 16, 0.65)' }}
            title="Imagen incluida en el paquete"
          >
            <ImageIcon className="h-3 w-3 text-white/80" />
          </span>
        )}
        {/* Accent dot indicator */}
        <span
          className="absolute bottom-1.5 left-1.5 h-2 w-2 rounded-full opacity-80"
          style={{ background: scenery.accent }}
        />
      </div>
      <div className="pt-1.5 px-0.5">
        <p
          className="text-[11px] font-semibold truncate"
          style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          {scenery.name}
        </p>
        <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
          {scenery.subtitle}
        </p>
      </div>
    </button>
  );
}

function SliderControl({ label, value, min, max, step, onChange, format }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
        <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 cursor-pointer appearance-none rounded-full"
        style={{
          background: `linear-gradient(to right, var(--accent-primary) ${((value - min) / (max - min)) * 100}%, var(--surface-muted) ${((value - min) / (max - min)) * 100}%)`,
        }}
        data-testid={`scenery-slider-${label.toLowerCase().replace(/\s+/g, '-')}`}
      />
    </div>
  );
}

/* ── Main section ────────────────────────────────────────────────────── */

export default function ScenerySettingsSection() {
  const [prefs, setPrefs] = useState(() => readSceneryPrefs());
  const [customUrlDraft, setCustomUrlDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Sync with external changes (e.g. command palette)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleChange = (event) => setPrefs(event.detail || readSceneryPrefs());
    window.addEventListener(SCENERY_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(SCENERY_CHANGED_EVENT, handleChange);
  }, []);

  const activeScenery = getSceneryById(prefs.sceneryId);

  const update = useCallback((patch) => {
    const next = writeSceneryPrefs({ ...readSceneryPrefs(), ...patch });
    setPrefs(next);
    return next;
  }, []);

  const handleSelectScenery = useCallback(
    (sceneryId) => {
      const scenery = getSceneryById(sceneryId);
      update({ sceneryId, customImageUrl: null });
      sileo.success({ title: `Fondo: ${scenery?.name || sceneryId}` });
    },
    [update]
  );

  const handleDisable = useCallback(() => {
    update({ sceneryId: null, customImageUrl: null });
    sileo.success({ title: 'Fondo desactivado' });
  }, [update]);

  const handleApplyCustomUrl = useCallback(() => {
    const url = customUrlDraft.trim();
    if (!url) return;
    update({ customImageUrl: url, sceneryId: prefs.sceneryId || 'custom' });
    sileo.success({ title: 'Imagen personalizada aplicada' });
  }, [customUrlDraft, update, prefs.sceneryId]);

  const handleClearCustomUrl = useCallback(() => {
    update({ customImageUrl: null });
    setCustomUrlDraft('');
    sileo.success({ title: 'Imagen personalizada eliminada' });
  }, [update]);

  /** Open the native file picker. */
  const handleBrowseFile = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  /**
   * Read the picked file, downscale it and persist it as the custom
   * wallpaper (data-URL). Works in web, Electron and Tauri webviews.
   */
  const handleFilePicked = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      // Reset so picking the same file twice still triggers change.
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (!file) return;

      setUploading(true);
      try {
        const dataUrl = await imageFileToWallpaperDataUrl(file);
        update({ customImageUrl: dataUrl, sceneryId: prefs.sceneryId || 'custom' });
        sileo.success({ title: 'Imagen aplicada como fondo' });
      } catch (err) {
        const code = err?.message;
        if (code === SCENERY_UPLOAD_ERRORS.NOT_AN_IMAGE) {
          sileo.error({ title: 'El archivo no es una imagen válida' });
        } else if (code === SCENERY_UPLOAD_ERRORS.TOO_LARGE) {
          sileo.error({ title: 'Imagen demasiado grande (máx. 12 MB)' });
        } else {
          sileo.error({ title: 'No se pudo leer la imagen' });
        }
      } finally {
        setUploading(false);
      }
    },
    [update, prefs.sceneryId]
  );

  return (
    <div className="space-y-6" data-testid="scenery-settings-section">
      {/* ── Active scenery hero card ─────────────────────────────────── */}
      <ChromeSurface asChild surface="panel" emphasized>
        <div
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
                style={pillStyle({ tone: 'accent' })}
              >
                <ImageIcon className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3
                  className="font-mono text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Fondos de Pantalla
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Sceneries para pizarra y terminales — espacio completo
                </p>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider"
              style={{
                ...pillStyle({ tone: 'neutral' }),
                color: prefs.sceneryId ? 'var(--success)' : 'var(--text-muted)',
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: prefs.sceneryId ? 'var(--success)' : 'var(--text-muted)' }}
              />
              {prefs.sceneryId ? 'Activo' : 'Inactivo'}
            </span>
          </div>

          {/* Large preview */}
          <div className="p-6">
            <div
              data-testid="scenery-active-preview"
              className="relative h-44 w-full overflow-hidden border"
              style={{
                borderColor: 'var(--chrome-border-color)',
                ...(prefs.customImageUrl
                  ? {
                      backgroundColor: '#0e1117',
                      backgroundImage: `url(${prefs.customImageUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : activeScenery
                    ? sceneryPreviewStyle(activeScenery)
                    : {
                        backgroundColor: 'var(--surface-muted)',
                        backgroundImage:
                          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
                        backgroundSize: '24px 24px',
                      }),
              }}
            >
              {/* Dim overlay preview */}
              {prefs.sceneryId && (
                <div
                  className="absolute inset-0"
                  style={{ backgroundColor: `rgba(8, 10, 16, ${prefs.overlayOpacity})` }}
                />
              )}
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                <div>
                  <p className="text-sm font-semibold text-white drop-shadow-md">
                    {prefs.customImageUrl
                      ? 'Imagen personalizada'
                      : activeScenery
                        ? activeScenery.name
                        : 'Sin fondo'}
                  </p>
                  <p className="text-[11px] text-white/70 drop-shadow-sm">
                    {prefs.customImageUrl
                      ? 'custom image · url'
                      : activeScenery
                        ? activeScenery.subtitle
                        : 'selecciona un scenery abajo'}
                  </p>
                </div>
                {prefs.sceneryId && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white"
                    style={{ background: 'var(--accent-primary)' }}
                  >
                    Active
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </ChromeSurface>

      {/* ── Scenery grid by category ─────────────────────────────────── */}
      <div className="overflow-hidden" style={panelStyle()}>
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{
            borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)',
            background: 'var(--chrome-panel-fill-emphasis)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-none flex items-center justify-center"
              style={pillStyle({ tone: 'accent' })}
            >
              <Layers className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h3
                className="font-mono text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Sceneries
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {SCENERY_CATALOG.length} fondos integrados · gradientes CSS + imágenes del paquete
              </p>
            </div>
          </div>
          {/* None option */}
          <button
            type="button"
            data-testid="scenery-none-option"
            onClick={handleDisable}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all"
            style={{
              ...pillStyle({ tone: 'neutral' }),
              color: !prefs.sceneryId ? 'var(--accent-primary)' : 'var(--text-secondary)',
              borderColor: !prefs.sceneryId
                ? 'color-mix(in srgb, var(--accent-primary) 40%, transparent)'
                : undefined,
            }}
          >
            <X className="w-3 h-3" />
            Ninguno
          </button>
        </div>

        <div className="p-6 space-y-6">
          {CATEGORY_ORDER.map((category) => {
            const sceneries = SCENERY_CATALOG.filter((s) => s.category === category);
            if (sceneries.length === 0) return null;
            const meta = SCENERY_CATEGORY_META[category];
            return (
              <div key={category}>
                <p
                  className="text-[10px] font-mono uppercase tracking-widest mb-3"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {meta?.label || category}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {sceneries.map((scenery) => (
                    <SceneryThumbnail
                      key={scenery.id}
                      scenery={scenery}
                      active={prefs.sceneryId === scenery.id && !prefs.customImageUrl}
                      onSelect={handleSelectScenery}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Configuration: scope, overlay, custom image ──────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Scope */}
        <div className="overflow-hidden" style={panelStyle()}>
          <div
            className="px-6 py-4"
            style={{
              borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)',
              background: 'var(--chrome-panel-fill-emphasis)',
            }}
          >
            <h3
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Alcance
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Dónde se aplica el fondo
            </p>
          </div>
          <div className="p-6 space-y-2">
            {SCOPE_OPTIONS.map(({ id, label, icon: Icon, desc }) => {
              const active = prefs.scope === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`scenery-scope-${id}`}
                  onClick={() => {
                    update({ scope: id });
                    sileo.success({ title: `Alcance: ${label}` });
                  }}
                  className="flex w-full items-center gap-3 border px-4 py-3 text-left transition-all"
                  style={{
                    borderColor: active
                      ? 'color-mix(in srgb, var(--accent-primary) 45%, transparent)'
                      : 'var(--chrome-border-color)',
                    background: active
                      ? 'color-mix(in srgb, var(--accent-primary) 8%, var(--chrome-panel-fill))'
                      : 'transparent',
                  }}
                >
                  <Icon
                    className="w-4 h-4 shrink-0"
                    style={{ color: active ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {label}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {desc}
                    </p>
                  </div>
                  {active && (
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full shrink-0"
                      style={{ background: 'var(--accent-primary)' }}
                    >
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Overlay + custom image */}
        <div className="overflow-hidden" style={panelStyle()}>
          <div
            className="px-6 py-4"
            style={{
              borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)',
              background: 'var(--chrome-panel-fill-emphasis)',
            }}
          >
            <h3
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Ajustes de capa
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Oscurecimiento, desenfoque e imagen personalizada
            </p>
          </div>
          <div className="p-6 space-y-5">
            <SliderControl
              label="Opacidad overlay"
              value={prefs.overlayOpacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => update({ overlayOpacity: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <SliderControl
              label="Desenfoque"
              value={prefs.blur}
              min={0}
              max={20}
              step={1}
              onChange={(v) => update({ blur: v })}
              format={(v) => `${v}px`}
            />
            <SliderControl
              label="Intensidad en terminales"
              value={prefs.terminalTint}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => update({ terminalTint: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />

            {/* Custom image: upload from device or paste a URL */}
            <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <span
                  className="text-[11px] font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Imagen personalizada
                </span>
              </div>

              {/* Upload from device */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFilePicked}
                className="hidden"
                data-testid="scenery-file-input"
              />
              <button
                type="button"
                onClick={handleBrowseFile}
                disabled={uploading}
                className="flex w-full items-center justify-center gap-2 border px-3 py-2.5 text-xs font-medium transition-all disabled:opacity-50"
                style={{
                  borderColor: 'color-mix(in srgb, var(--accent-primary) 40%, transparent)',
                  color: 'var(--accent-primary)',
                  background: 'color-mix(in srgb, var(--accent-primary) 6%, transparent)',
                }}
                data-testid="scenery-upload-button"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Procesando imagen…' : 'Subir imagen desde el equipo'}
              </button>

              {/* Or paste a URL */}
              <div className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                  o pegar URL
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={customUrlDraft}
                  onChange={(e) => setCustomUrlDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyCustomUrl()}
                  placeholder="https://ejemplo.com/fondo.jpg"
                  className="flex-1 px-3 py-2 text-xs"
                  style={inputStyle()}
                  data-testid="scenery-custom-url-input"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomUrl}
                  disabled={!customUrlDraft.trim()}
                  className="px-3 py-2 text-xs font-medium text-white transition-all disabled:opacity-40"
                  style={{ background: 'var(--accent-primary)' }}
                  data-testid="scenery-custom-url-apply"
                >
                  Aplicar
                </button>
              </div>
              {prefs.customImageUrl && (
                <div
                  className="flex items-center justify-between gap-2 px-3 py-2 border"
                  style={{ borderColor: 'var(--chrome-border-color)' }}
                >
                  <span
                    className="text-[10px] truncate font-mono"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {prefs.customImageUrl.startsWith('data:')
                      ? 'Imagen subida (incrustada)'
                      : prefs.customImageUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearCustomUrl}
                    className="shrink-0 text-[10px] font-medium"
                    style={{ color: 'var(--danger)' }}
                    data-testid="scenery-custom-url-clear"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
