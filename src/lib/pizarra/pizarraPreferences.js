/**
 * Pizarra background preferences.
 *
 * Persists the canvas background choice (solid color, grid, dots, image, transparent)
 * in localStorage and provides helpers to resolve it to CSS styles.
 */

export const PIZARRA_BACKGROUND_KEY = 'devhub:pizarra-background';

export const PIZARRA_BACKGROUND_TYPES = {
  SOLID: 'solid',
  GRID: 'grid',
  DOTS: 'dots',
  TRANSPARENT: 'transparent',
  IMAGE: 'image',
};

const DEFAULT_BACKGROUND = {
  type: PIZARRA_BACKGROUND_TYPES.DOTS,
  value: '#1a1f2e',
};

export function readPizarraBackground() {
  if (typeof window === 'undefined') return DEFAULT_BACKGROUND;
  try {
    const raw = window.localStorage.getItem(PIZARRA_BACKGROUND_KEY);
    if (!raw) return DEFAULT_BACKGROUND;
    const parsed = JSON.parse(raw);
    if (!parsed || !Object.values(PIZARRA_BACKGROUND_TYPES).includes(parsed.type)) {
      return DEFAULT_BACKGROUND;
    }
    return {
      type: parsed.type,
      value: parsed.value || '',
    };
  } catch {
    return DEFAULT_BACKGROUND;
  }
}

export function writePizarraBackground(background) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PIZARRA_BACKGROUND_KEY, JSON.stringify(background));
  } catch {
    /* ignore */
  }
}

export function resolvePizarraBackgroundStyle(background = DEFAULT_BACKGROUND) {
  const { type, value } = background;

  switch (type) {
    case PIZARRA_BACKGROUND_TYPES.SOLID:
      return {
        backgroundColor: value || '#1a1f2e',
        backgroundImage: 'none',
        backgroundSize: undefined,
      };
    case PIZARRA_BACKGROUND_TYPES.GRID:
      return {
        backgroundColor: value || '#1a1f2e',
        backgroundImage: `
          linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
        `,
        backgroundSize: '32px 32px',
      };
    case PIZARRA_BACKGROUND_TYPES.DOTS:
      return {
        backgroundColor: value || '#1a1f2e',
        backgroundImage:
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
        backgroundSize: '32px 32px',
      };
    case PIZARRA_BACKGROUND_TYPES.TRANSPARENT:
      return {
        backgroundColor: 'transparent',
        backgroundImage: 'none',
        backgroundSize: undefined,
      };
    case PIZARRA_BACKGROUND_TYPES.IMAGE:
      return {
        backgroundColor: '#1a1f2e',
        backgroundImage: value ? `url(${value})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    default:
      return resolvePizarraBackgroundStyle(DEFAULT_BACKGROUND);
  }
}
