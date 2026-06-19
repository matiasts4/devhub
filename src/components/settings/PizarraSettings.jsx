'use client';

import { useEffect, useState } from 'react';
import { Palette, Grid3X3, CircleDot, Square, Image as ImageIcon, Eraser } from 'lucide-react';
import { ChromeSurface, chromeSurfaceStyle } from '@/components/ui/chrome-surface';
import {
  PIZARRA_BACKGROUND_TYPES,
  readPizarraBackground,
  resolvePizarraBackgroundStyle,
  writePizarraBackground,
} from '@/lib/pizarra/pizarraPreferences';

const BACKGROUND_OPTIONS = [
  {
    key: PIZARRA_BACKGROUND_TYPES.DOTS,
    label: 'Puntos',
    description: 'Patrón de puntos sutil sobre color sólido.',
    icon: CircleDot,
  },
  {
    key: PIZARRA_BACKGROUND_TYPES.GRID,
    label: 'Grilla',
    description: 'Líneas de cuadrícula clásicas.',
    icon: Grid3X3,
  },
  {
    key: PIZARRA_BACKGROUND_TYPES.SOLID,
    label: 'Sólido',
    description: 'Color plano sin textura.',
    icon: Square,
  },
  {
    key: PIZARRA_BACKGROUND_TYPES.IMAGE,
    label: 'Imagen',
    description: 'Imagen de fondo (URL o archivo local).',
    icon: ImageIcon,
  },
  {
    key: PIZARRA_BACKGROUND_TYPES.TRANSPARENT,
    label: 'Transparente',
    description: 'Sin fondo; se ve el surface de la app.',
    icon: Eraser,
  },
];

function dispatchBackgroundChanged(background) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('devhub:pizarra-background-changed', { detail: background })
  );
}

export default function PizarraSettings() {
  const [background, setBackground] = useState(() => readPizarraBackground());

  useEffect(() => {
    setBackground(readPizarraBackground());
  }, []);

  const commit = (next) => {
    writePizarraBackground(next);
    setBackground(next);
    dispatchBackgroundChanged(next);
  };

  const handleTypeChange = (type) => {
    const currentValue = background.value || '#1a1f2e';
    commit({ type, value: currentValue });
  };

  const handleColorChange = (event) => {
    commit({ ...background, value: event.target.value });
  };

  const handleImageChange = (event) => {
    commit({ ...background, value: event.target.value });
  };

  const previewStyle = resolvePizarraBackgroundStyle(background);

  return (
    <div className="space-y-6">
      <ChromeSurface asChild surface="panel" emphasized>
        <div
          className="px-6 py-5 space-y-6"
          style={chromeSurfaceStyle({ surface: 'panel', emphasized: true })}
        >
          <div>
            <h4
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Tipo de fondo
            </h4>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Elegí la apariencia del canvas de la pizarra.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {BACKGROUND_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = background.type === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    data-testid={`pizarra-bg-option-${option.key}`}
                    onClick={() => handleTypeChange(option.key)}
                    className="group text-left rounded-xl border p-3 transition-all"
                    style={chromeSurfaceStyle({
                      surface: 'panel',
                      emphasized: isActive,
                      tone: isActive ? 'accent' : 'neutral',
                    })}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {option.label}
                      </p>
                    </div>
                    <p
                      className="text-[10px] leading-relaxed"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {background.type !== PIZARRA_BACKGROUND_TYPES.TRANSPARENT &&
            background.type !== PIZARRA_BACKGROUND_TYPES.IMAGE && (
              <div>
                <label
                  className="flex items-center gap-2 text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Palette className="w-4 h-4" />
                  Color base
                </label>
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="color"
                    value={background.value || '#1a1f2e'}
                    onChange={handleColorChange}
                    data-testid="pizarra-bg-color"
                    className="h-10 w-16 rounded cursor-pointer border-0 p-0"
                    style={{ background: 'transparent' }}
                  />
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {background.value || '#1a1f2e'}
                  </span>
                </div>
              </div>
            )}

          {background.type === PIZARRA_BACKGROUND_TYPES.IMAGE && (
            <div>
              <label
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                <ImageIcon className="w-4 h-4" />
                URL de imagen
              </label>
              <input
                type="text"
                value={background.value || ''}
                onChange={handleImageChange}
                placeholder="https://ejemplo.com/fondo.png"
                data-testid="pizarra-bg-image-url"
                className="w-full mt-2 h-10 rounded-xl border px-3 text-sm"
                style={chromeSurfaceStyle({ surface: 'pill' })}
              />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Podés usar una URL pública o un path local convertido a file://.
              </p>
            </div>
          )}

          <div>
            <h4
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Vista previa
            </h4>
            <div
              data-testid="pizarra-bg-preview"
              className="mt-2 w-full h-32 rounded-xl border"
              style={{
                ...previewStyle,
                borderColor: 'var(--border-subtle)',
              }}
            />
          </div>
        </div>
      </ChromeSurface>
    </div>
  );
}
