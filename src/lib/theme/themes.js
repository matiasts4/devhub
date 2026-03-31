export const THEME_STORAGE_KEY = 'devhub:theme';

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
