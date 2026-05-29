export const THEME_STORAGE_KEY = 'devhub:theme';
export const MORPHOLOGY_STORAGE_KEY = 'devhub:morphology';
export const ACCENT_STORAGE_KEY = 'devhub:accent';
export const APP_ZOOM_STORAGE_KEY = 'devhub:zoom';
export const APPEARANCE_STORAGE_KEY = 'devhub:appearance';
export const PALETTE_STORAGE_KEY = 'devhub:palette';

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
  BRUTALIST_STAGE: 'brutalist-stage',
  SWITCHYARD: 'switchyard',
};

export const MORPHOLOGIES = {
  DEFAULT: 'default',
  BRUTALIST_STAGE: 'brutalist-stage',
  AURA: 'aura',
  SWITCHYARD: 'switchyard',
};

export const ACCENTS = {
  THEME: 'theme',
  AMBER: 'amber',
  MINT: 'mint',
  VIOLET: 'violet',
  ORANGE: 'orange',
  ROSE: 'rose',
  CYAN: 'cyan',
  BLUE: 'blue',
  RED: 'red',
  WHITE: 'white',
  LIME: 'lime',
  ORANGE_LIGHT: 'orange-light',
};

export const PALETTES = {
  MINERAL: 'mineral',
  COBALT: 'cobalt',
  ALLOY: 'alloy',
};

export const PALETTE_OPTIONS = [
  {
    id: PALETTES.MINERAL,
    label: 'Mineral Teal',
    description: 'Cold-mineral dark with teal accent.',
    primary: '#63d0c2',
  },
  {
    id: PALETTES.COBALT,
    label: 'Cobalt Relay',
    description: 'Blue accent, navy-dark surface.',
    primary: '#7a93ff',
  },
  {
    id: PALETTES.ALLOY,
    label: 'Alloy Sand',
    description: 'Bronze accent, warm dark surface.',
    primary: '#d4a16a',
  },
];

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
  {
    id: THEMES.BRUTALIST_STAGE,
    label: 'Brutalist Stage',
    description: 'Negro plano con acento amarillo. Bordes duros, sin suavidad.',
    accent: '#E3B341',
  },
  {
    id: THEMES.SWITCHYARD,
    label: 'Switchyard',
    description: 'Mineral dark con grid sutil y acento teal. Control room aesthetic.',
    accent: '#63d0c2',
  },
];

export const MORPHOLOGY_OPTIONS = [
  {
    id: MORPHOLOGIES.DEFAULT,
    label: 'Default',
    description: 'Current shared chrome with neutral shell geometry.',
  },
  {
    id: MORPHOLOGIES.BRUTALIST_STAGE,
    label: 'Brutalist Stage',
    description: 'Sharper borders, flatter surfaces, stage-like shell chrome.',
  },
  {
    id: MORPHOLOGIES.AURA,
    label: 'Aura',
    description: 'Glassmorphism with semi-transparent surfaces and soft glow effects.',
  },
  {
    id: MORPHOLOGIES.SWITCHYARD,
    label: 'Switchyard',
    description: 'Metallic dark with teal/cobalt/bronze palette axis.',
  },
];

export const ACCENT_OPTIONS = [
  {
    id: ACCENTS.THEME,
    label: 'Theme sync',
    description: 'Follow the active theme accent automatically.',
    primary: null,
  },
  {
    id: ACCENTS.AMBER,
    label: 'Signal Amber',
    description: 'Warm caution-strip accent from the brutalist preview.',
    primary: '#E3B341',
  },
  {
    id: ACCENTS.MINT,
    label: 'Mint Grid',
    description: 'Sharper operational green for online and queue states.',
    primary: '#3FB950',
  },
  {
    id: ACCENTS.VIOLET,
    label: 'Violet Stack',
    description: 'Cold violet signal for system-heavy screens.',
    primary: '#D2A8FF',
  },
  {
    id: ACCENTS.ORANGE,
    label: 'Burnt Orange',
    description: 'Hot orange slab close to the preview rail controls.',
    primary: '#F97316',
  },
  {
    id: ACCENTS.ROSE,
    label: 'Rose Pulse',
    description: 'High-contrast rose for alert and live states.',
    primary: '#F778BA',
  },
  {
    id: ACCENTS.CYAN,
    label: 'Cyan Teal',
    description: 'Bright cyan-teal for futuristic and tech-forward screens.',
    primary: '#22D3EE',
  },
  {
    id: ACCENTS.BLUE,
    label: 'Core Blue',
    description: 'Trustworthy blue for dashboards and analytics.',
    primary: '#60A5FA',
  },
  {
    id: ACCENTS.RED,
    label: 'Alert Red',
    description: 'High-visibility red for errors and critical states.',
    primary: '#F87171',
  },
  {
    id: ACCENTS.WHITE,
    label: 'Off-White',
    description: 'Subtle light gray for minimal or high-contrast themes.',
    primary: '#E5E7EB',
  },
  {
    id: ACCENTS.LIME,
    label: 'Lime Fresh',
    description: 'Energetic lime green for success and completion.',
    primary: '#A3E635',
  },
  {
    id: ACCENTS.ORANGE_LIGHT,
    label: 'Soft Orange',
    description: 'Milder orange for secondary accents.',
    primary: '#FB923C',
  },
];

export function normalizeTheme(value) {
  const all = Object.values(THEMES);
  return all.includes(value) ? value : THEMES.DEEP_SEA;
}

export function normalizeMorphology(value) {
  const all = Object.values(MORPHOLOGIES);
  return all.includes(value) ? value : MORPHOLOGIES.DEFAULT;
}

export function normalizeAccent(value) {
  const all = Object.values(ACCENTS);
  return all.includes(value) ? value : ACCENTS.THEME;
}

export function getStoredTheme() {
  if (typeof window === 'undefined') return THEMES.DEEP_SEA;
  return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function getStoredMorphology() {
  if (typeof window === 'undefined') return MORPHOLOGIES.DEFAULT;
  return normalizeMorphology(window.localStorage.getItem(MORPHOLOGY_STORAGE_KEY));
}

export function getStoredAccent() {
  if (typeof window === 'undefined') return ACCENTS.THEME;
  return normalizeAccent(window.localStorage.getItem(ACCENT_STORAGE_KEY));
}

export function applyThemeToDocument(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', normalizeTheme(theme));
}

export function applyMorphologyToDocument(morphology) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-morphology', normalizeMorphology(morphology));
}

export function applyAccentToDocument(accent) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-accent', normalizeAccent(accent));
}

export function setStoredTheme(theme) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme));
}

export function setStoredMorphology(morphology) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MORPHOLOGY_STORAGE_KEY, normalizeMorphology(morphology));
}

export function setStoredAccent(accent) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCENT_STORAGE_KEY, normalizeAccent(accent));
}

export function setTheme(theme) {
  const normalized = normalizeTheme(theme);
  applyThemeToDocument(normalized);
  setStoredTheme(normalized);
  return normalized;
}

export function setMorphology(morphology) {
  const normalized = normalizeMorphology(morphology);
  applyMorphologyToDocument(normalized);
  setStoredMorphology(normalized);
  return normalized;
}

export function setAccent(accent) {
  const normalized = normalizeAccent(accent);
  applyAccentToDocument(normalized);
  setStoredAccent(normalized);
  return normalized;
}

export function normalizePalette(value) {
  const all = Object.values(PALETTES);
  return all.includes(value) ? value : PALETTES.MINERAL;
}

export function getStoredPalette() {
  if (typeof window === 'undefined') return PALETTES.MINERAL;
  return normalizePalette(window.localStorage.getItem(PALETTE_STORAGE_KEY));
}

export function setStoredPalette(palette) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PALETTE_STORAGE_KEY, normalizePalette(palette));
}

export function applyPaletteToDocument(palette) {
  if (typeof document === 'undefined') return;
  document.body.setAttribute('data-palette', normalizePalette(palette));
}

export function setPalette(palette) {
  const normalized = normalizePalette(palette);
  applyPaletteToDocument(normalized);
  setStoredPalette(normalized);
  return normalized;
}
