export const THEME_STORAGE_KEY = 'devhub:theme';
export const APP_ZOOM_STORAGE_KEY = 'devhub:zoom';
export const APPEARANCE_STORAGE_KEY = 'devhub:appearance';

const DEFAULT_APPEARANCE = {
  fontFamily: 'Inter',
  fontScale: 1,
  density: 'comfortable',
  zoom: 1,
};

export function normalizeAppearance(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_APPEARANCE };

  const density = ['compact', 'comfortable'].includes(parsed.density)
    ? parsed.density
    : DEFAULT_APPEARANCE.density;

  const fontFamily =
    typeof parsed.fontFamily === 'string' ? parsed.fontFamily : DEFAULT_APPEARANCE.fontFamily;

  const rawScale = Number(parsed.fontScale);
  const fontScale = Number.isFinite(rawScale)
    ? Math.min(Math.max(rawScale, 0.75), 1.5)
    : DEFAULT_APPEARANCE.fontScale;

  const rawZoom = Number(parsed.zoom);
  const zoom = Number.isFinite(rawZoom) ? rawZoom : DEFAULT_APPEARANCE.zoom;

  return { fontFamily, fontScale, density, zoom };
}

export function getStoredAppearance() {
  if (typeof window === 'undefined') return { ...DEFAULT_APPEARANCE };
  const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
  return normalizeAppearance(stored);
}

export function setStoredAppearance(appearance) {
  if (typeof window === 'undefined') return;
  const normalized = normalizeAppearance(appearance);
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(normalized));
}

export function applyAppearanceSettings(appearance) {
  if (typeof document === 'undefined') return;
  const normalized = normalizeAppearance(appearance);
  document.documentElement.style.setProperty('--font-scale', normalized.fontScale.toString());
  document.documentElement.style.setProperty('--font-family-ui', normalized.fontFamily);
  document.documentElement.setAttribute('data-density', normalized.density);
}

export function getStoredZoom() {
  if (typeof window === 'undefined') return 1;
  const stored = window.localStorage.getItem(APP_ZOOM_STORAGE_KEY);
  return stored ? parseFloat(stored) : 1;
}

export function setStoredZoom(zoom) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(APP_ZOOM_STORAGE_KEY, zoom.toString());
}

export function applyZoomToDocument(zoom) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--app-zoom', zoom.toString());
}

export function setZoom(zoom) {
  const rounded = Math.round(zoom * 10) / 10;
  applyZoomToDocument(rounded);
  setStoredZoom(rounded);
  return rounded;
}

export const THEMES = {
  DEEP_SEA: 'deep-sea',
  NORD: 'nord',
  DRACULA: 'dracula',
  LIGHT: 'light',
  CATPPUCCIN: 'catppuccin',
  TOKYO_NIGHT: 'tokyo-night',
  MONOKAI: 'monokai',
  SYNTHWAVE: 'synthwave',
};

export const THEME_OPTIONS = [
  {
    id: THEMES.DEEP_SEA,
    label: 'Deep Sea',
    description: 'Azul profundo con contraste técnico.',
    accent: '#58A6FF',
  },
  {
    id: THEMES.NORD,
    label: 'Nord',
    description: 'Estética polar suave y calmada.',
    accent: '#88C0D0',
  },
  {
    id: THEMES.DRACULA,
    label: 'Dracula',
    description: 'Oscuro clásico con acento púrpura.',
    accent: '#BD93F9',
  },
  {
    id: THEMES.LIGHT,
    label: 'Light Mode',
    description: 'Claro limpio estilo GitHub.',
    accent: '#0969DA',
  },
  {
    id: THEMES.CATPPUCCIN,
    label: 'Catppuccin Mocha',
    description: 'Cálido y acogedor, tonos pastel suaves.',
    accent: '#CBA6F7',
  },
  {
    id: THEMES.TOKYO_NIGHT,
    label: 'Tokyo Night',
    description: 'Neón oscuro con brillos urbanos.',
    accent: '#7AA2F7',
  },
  {
    id: THEMES.MONOKAI,
    label: 'Monokai Pro',
    description: 'Vibrante y enérgico, clásico de editores.',
    accent: '#A6E22E',
  },
  {
    id: THEMES.SYNTHWAVE,
    label: "Synthwave '84",
    description: 'Retro futurista con neones retro.',
    accent: '#FE4450',
  },
];

export function normalizeTheme(value) {
  const all = Object.values(THEMES);
  return all.includes(value) ? value : THEMES.DEEP_SEA;
}

export function getStoredTheme() {
  if (typeof window === 'undefined') return THEMES.DEEP_SEA;
  return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function applyThemeToDocument(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', normalizeTheme(theme));
}

export function setStoredTheme(theme) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme));
}

export function setTheme(theme) {
  const normalized = normalizeTheme(theme);
  applyThemeToDocument(normalized);
  setStoredTheme(normalized);
  return normalized;
}
