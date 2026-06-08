/**
 * Terminal typography preferences for the xterm (webgl) renderer.
 *
 * Controls the look of the terminal viewport content:
 * - font family (drives --font-family-mono CSS var + xterm fontFamily)
 * - size, weight (normal + bold), line height, letter spacing
 *
 * These are global (per-device) defaults. Individual panels can still
 * fine-tune size with the A-/A+ buttons (local override that does not
 * overwrite the global default).
 *
 * The resolver returns normalized values safe to pass to new Terminal({...}).
 * Changing family/weight typically benefits from a clean xterm re-init
 * (we use the existing boot nonce pattern in TerminalTTY).
 */

export const TERMINAL_TYPOGRAPHY_STORAGE_KEY = 'devhub:terminal-typography';

export const DEFAULT_TERMINAL_TYPOGRAPHY = Object.freeze({
  // Kali Linux default terminal feel: Noto/DejaVu family (thicker, more "blocky" than JetBrains at regular weight).
  // Combined with a bit heavier fontWeight so it doesn't look "delgada".
  fontFamily:
    "'Noto Sans Mono', 'DejaVu Sans Mono', 'Liberation Mono', 'Bitstream Vera Sans Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
  fontSize: 13,
  // Heavier than 400 so the regular text has good "grosor" (thickness) like native Linux terminals.
  fontWeight: '500',
  fontWeightBold: '800',
  lineHeight: 1.5,
  letterSpacing: 0,
});

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 24;
const LINE_HEIGHT_MIN = 1.0;
const LINE_HEIGHT_MAX = 2.0;
const LETTER_SPACING_MIN = -2;
const LETTER_SPACING_MAX = 4;

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function clamp(num, min, max) {
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

function normalizeTypography(raw) {
  const base = { ...DEFAULT_TERMINAL_TYPOGRAPHY };

  if (!isPlainObject(raw)) return base;

  const next = { ...base };

  if (typeof raw.fontFamily === 'string' && raw.fontFamily.trim()) {
    next.fontFamily = raw.fontFamily.trim();
  }

  const fs = Number(raw.fontSize);
  if (Number.isFinite(fs)) {
    next.fontSize = Math.round(clamp(fs, FONT_SIZE_MIN, FONT_SIZE_MAX));
  }

  // Weights: allow number or string, keep reasonable range
  const w = raw.fontWeight;
  if (w != null) {
    const wn = Number(w);
    next.fontWeight = Number.isFinite(wn) ? String(clamp(Math.round(wn), 100, 900)) : String(w);
  }
  const wb = raw.fontWeightBold;
  if (wb != null) {
    const wbn = Number(wb);
    next.fontWeightBold = Number.isFinite(wbn)
      ? String(clamp(Math.round(wbn), 100, 900))
      : String(wb);
  }

  const lh = Number(raw.lineHeight);
  if (Number.isFinite(lh)) {
    // Keep one decimal for sanity
    next.lineHeight = Math.round(clamp(lh, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX) * 10) / 10;
  }

  const ls = Number(raw.letterSpacing);
  if (Number.isFinite(ls)) {
    next.letterSpacing = Math.round(clamp(ls, LETTER_SPACING_MIN, LETTER_SPACING_MAX) * 10) / 10;
  }

  return next;
}

export function getStoredTerminalTypography(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { ...DEFAULT_TERMINAL_TYPOGRAPHY };
  }
  try {
    const raw = storage.getItem(TERMINAL_TYPOGRAPHY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TERMINAL_TYPOGRAPHY };
    return normalizeTypography(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TERMINAL_TYPOGRAPHY };
  }
}

export function setTerminalTypography(storage, partial) {
  if (!storage || typeof storage.setItem !== 'function') return;
  const current = getStoredTerminalTypography(storage);
  const next = normalizeTypography({ ...current, ...(partial || {}) });
  try {
    storage.setItem(TERMINAL_TYPOGRAPHY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
  return next;
}

export function resetTerminalTypography(storage) {
  if (!storage || typeof storage.removeItem !== 'function')
    return { ...DEFAULT_TERMINAL_TYPOGRAPHY };
  try {
    storage.removeItem(TERMINAL_TYPOGRAPHY_STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
  return { ...DEFAULT_TERMINAL_TYPOGRAPHY };
}

/**
 * The single source of truth used by TerminalTTY at creation time
 * and for live updates.
 */
export function resolveTerminalTypography(storage) {
  return getStoredTerminalTypography(storage);
}

/**
 * Applies the font family part to the CSS var so that:
 * - resolveTerminalFontFamily() (legacy path) keeps working
 * - other UI that relies on --font-family-mono sees the terminal choice
 * - consistency across the app when user picks a different mono for terminals
 */
export function applyTerminalTypographyToDocument(typography) {
  if (typeof document === 'undefined') return;
  const t =
    typography ||
    resolveTerminalTypography(typeof window !== 'undefined' ? window.localStorage : null);
  try {
    document.documentElement.style.setProperty('--font-family-mono', t.fontFamily);
    // Keep the feature-settings in sync (ligatures etc). We default to normal
    // but advanced users can include it in a custom family string.
    const feat = t.fontFeatureSettings || 'normal';
    document.documentElement.style.setProperty('--font-family-mono--font-feature-settings', feat);
  } catch {
    // ignore
  }
}

/**
 * Curated, high-quality options for the family picker in Appearance.
 * The value is the exact string we will put into --font-family-mono and xterm.
 */
export const TERMINAL_FONT_FAMILY_PRESETS = [
  {
    id: 'kali',
    label: 'Kali Linux (Terminal por defecto)',
    description:
      'La fuente mono por defecto de Kali / terminales Linux nativas. Más gruesa y con mejor grosor (no se ve delgada).',
    value:
      "'Noto Sans Mono', 'DejaVu Sans Mono', 'Liberation Mono', 'Bitstream Vera Sans Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    description: 'Moderna y legible, pero puede verse más delgada en algunos renderers.',
    value:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
  {
    id: 'fira',
    label: 'Fira Code',
    description: 'Ligaduras + buen grosor. Muy usada en entornos de seguridad.',
    value:
      "'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
  {
    id: 'cascadia',
    label: 'Cascadia Code',
    description: 'Buen peso y soporte de símbolos (Powerline, etc).',
    value:
      "'Cascadia Code', 'Cascadia Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
  {
    id: 'system',
    label: 'System mono (ui-monospace)',
    description: 'La fuente mono nativa del sistema (la más "Kali-like" en Linux real).',
    value:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
];

export function findPresetByValue(value) {
  if (!value) return null;
  return TERMINAL_FONT_FAMILY_PRESETS.find((p) => p.value === value) || null;
}

export function getCustomFamilyOption() {
  return {
    id: 'custom',
    label: 'Personalizada',
    description: 'Escribí tu stack de fuentes mono.',
    value: '',
  };
}
