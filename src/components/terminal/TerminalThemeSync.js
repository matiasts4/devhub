import { shouldAvoidWebglOnThisRuntime } from './terminalRendererPreferences';
import {
  DEFAULT_TERMINAL_TYPOGRAPHY,
  getStoredTerminalTypography,
} from './terminalTypographyPreferences';

/**
 * TerminalThemeSync — Reads CSS custom properties from the document and
 * converts them into an xterm.js ITheme-compatible object.
 *
 * All colors are driven by CSS vars so the terminal always matches the
 * current app theme (dark / light / custom).
 *
 * Pure function: buildXtermTheme(getVar) — accepts a CSS var resolver,
 * returns an xterm theme object. Testable without a DOM.
 *
 * Also exposes buildTerminalChromeVars(style) and setTerminalChromeVars(el, style)
 * for terminal header styling driven by data-terminal-header-style attribute.
 */

let cachedTheme = null;

/**
 * Builds the set of CSS custom properties for a terminal chrome header style.
 * Returns a flat object of CSS var name → value pairs, suitable for
 * element.style.setProperty() iteration.
 *
 * @param {'dragon'|'minimal'|'gradient'|'plain'} style
 * @returns {{ [key: string]: string }} CSS var object
 */
export function buildTerminalChromeVars(style) {
  switch (style) {
    case 'dragon':
      return {
        '--terminal-header-bg': 'var(--surface-card)',
        '--terminal-header-gradient':
          'linear-gradient(180deg, var(--surface-elevated), var(--chrome-panel-fill))',
        '--terminal-accent-bar': 'var(--accent-primary)',
      };
    case 'minimal':
      return {
        '--terminal-header-bg': 'var(--surface-card)',
        '--terminal-header-gradient': 'var(--surface-card)',
        '--terminal-accent-bar': 'transparent',
      };
    case 'gradient':
      return {
        '--terminal-header-bg': 'var(--surface-card)',
        '--terminal-header-gradient':
          'linear-gradient(180deg, var(--surface-elevated), var(--surface-card))',
        '--terminal-accent-bar': 'transparent',
      };
    case 'plain':
    default:
      return {
        '--terminal-header-bg': 'var(--surface-card)',
        '--terminal-header-gradient': 'var(--surface-card)',
        '--terminal-accent-bar': 'transparent',
      };
  }
}

/**
 * Applies terminal chrome CSS vars to a DOM element based on the header style.
 * Also sets the data-terminal-header-style attribute on the element.
 *
 * @param {Element} el - Target DOM element (typically the terminal root)
 * @param {string} style - One of 'dragon' | 'minimal' | 'gradient' | 'plain'
 */
export function setTerminalChromeVars(el, style) {
  if (!el) return;
  el.setAttribute('data-terminal-header-style', style);
  const vars = buildTerminalChromeVars(style);
  for (const [name, value] of Object.entries(vars)) {
    el.style.setProperty(name, value);
  }
}

/**
 * Pure function: builds an xterm theme from a CSS var resolver.
 * Reads --terminal-bg / --terminal-fg first; falls back to --surface-app.
 *
 * @param {(name: string) => string} getVar - CSS var resolver
 * @returns {object} xterm-compatible ITheme object
 */
export function buildXtermTheme(getVar) {
  // Read terminal-specific vars first; fall back to surface-app for background
  const terminalBg = getVar('--terminal-bg');
  const terminalFg = getVar('--terminal-fg');
  const surfaceApp = getVar('--surface-app');

  return {
    background: terminalBg || surfaceApp || '#0D1117',
    foreground: terminalFg || '#F0F6FC',
    // cursor maps to --accent-primary for theme consistency
    cursor: getVar('--accent-primary') || '#58A6FF',
    selectionBackground: getVar('--terminal-selection') || 'rgba(88,166,255,0.3)',
    black: getVar('--terminal-black') || '#484F58',
    red: getVar('--terminal-red') || '#FF7B72',
    green: getVar('--terminal-green') || '#3FB950',
    yellow: getVar('--terminal-yellow') || '#D29922',
    blue: getVar('--terminal-blue') || '#79C0FF',
    magenta: getVar('--terminal-magenta') || '#BC8CFF',
    cyan: getVar('--terminal-cyan') || '#39C5CF',
    white: getVar('--terminal-white') || '#B1BAC4',
    brightBlack: getVar('--terminal-bright-black') || '#6E7681',
    brightRed: getVar('--terminal-bright-red') || '#FFA198',
    brightGreen: getVar('--terminal-bright-green') || '#56D364',
    brightYellow: getVar('--terminal-bright-yellow') || '#E3B341',
    brightBlue: getVar('--terminal-bright-blue') || '#79C0FF',
    brightMagenta: getVar('--terminal-bright-magenta') || '#D2A8FF',
    brightCyan: getVar('--terminal-bright-cyan') || '#56D4DD',
    brightWhite: getVar('--terminal-bright-white') || '#F0F6FC',
  };
}

let sharedColorCanvasCtx = null;

/**
 * Normalize a CSS color to a format xterm.js can parse (#hex, rgb()/rgba(),
 * named colors). Modern Chromium preserves wide-gamut functions like
 * oklch()/oklab()/color() in computed styles, and passing them to
 * `new Terminal({ theme })` throws (xterm's css parser is hex/rgb/named only),
 * which kills terminal initialization entirely. Canvas fillStyle assignment
 * normalizes any valid CSS color to sRGB hex/rgb; invalid assignments are
 * ignored by the canvas, leaving the sentinel in place.
 */
export function normalizeColorForXterm(value) {
  if (!value || typeof value !== 'string') return '';
  const v = value.trim();
  if (!v) return '';
  if (v.startsWith('#') || v.startsWith('rgb') || /^[a-zA-Z]+$/.test(v)) return v;
  if (typeof document === 'undefined') return '';
  try {
    if (!sharedColorCanvasCtx) {
      const canvas = document.createElement('canvas');
      sharedColorCanvasCtx = (canvas.getContext && canvas.getContext('2d')) || null;
    }
    if (!sharedColorCanvasCtx) return '';
    sharedColorCanvasCtx.fillStyle = '#010203'; // sentinel
    sharedColorCanvasCtx.fillStyle = v;
    const normalized = sharedColorCanvasCtx.fillStyle;
    if (!normalized || normalized === '#010203') return '';
    return normalized;
  } catch {
    return '';
  }
}

function makeDomCssVarResolver() {
  return (name) => {
    try {
      if (typeof document === 'undefined') return '';
      const rawValue = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (!rawValue) return '';

      const tempEl = document.createElement('div');
      tempEl.style.color = rawValue;
      tempEl.style.display = 'none';
      const parent = document.body || document.documentElement;
      if (!parent) return rawValue;

      parent.appendChild(tempEl);
      const resolved = getComputedStyle(tempEl).color;
      parent.removeChild(tempEl);
      // Chromium may keep oklch()/color() in computed styles; xterm cannot
      // parse those, so normalize to sRGB. If normalization is unavailable
      // (non-browser/test env), keep the computed value as before.
      return normalizeColorForXterm(resolved) || resolved || '';
    } catch {
      return '';
    }
  };
}

export function getTerminalTheme() {
  const theme = buildXtermTheme(makeDomCssVarResolver());
  cachedTheme = theme;
  return theme;
}

export function getCachedTheme() {
  return cachedTheme || getTerminalTheme();
}

/**
 * Reads terminal typography options from CSS custom properties.
 * Safe to spread into `new Terminal({ ...fontOptions })`.
 */
export function getTerminalFontOptions() {
  const getRawVar = (name) => {
    if (typeof document === 'undefined') return '';
    try {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    } catch {
      return '';
    }
  };

  const stored =
    typeof window !== 'undefined' ? getStoredTerminalTypography(window.localStorage) : null;
  const fallback = stored || DEFAULT_TERMINAL_TYPOGRAPHY;

  const fontFamily =
    getRawVar('--font-family-mono') ||
    fallback.fontFamily ||
    "'Noto Sans Mono', 'DejaVu Sans Mono', 'Liberation Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace";

  const rawWeight = getRawVar('--terminal-font-weight') || fallback.fontWeight;
  const rawWeightBold = getRawVar('--terminal-font-weight-bold') || fallback.fontWeightBold;
  const rawLine =
    getRawVar('--terminal-line-height') ||
    (fallback.lineHeight != null ? String(fallback.lineHeight) : '');
  const rawLetter =
    getRawVar('--terminal-letter-spacing') ||
    (fallback.letterSpacing != null ? String(fallback.letterSpacing) : '');

  const domSafeMetrics = shouldAvoidWebglOnThisRuntime();

  return {
    fontFamily: fontFamily.replace(/\s+/g, ' ').trim(),
    fontWeight: rawWeight || '500',
    fontWeightBold: rawWeightBold || '800',
    lineHeight: domSafeMetrics ? 1 : parseFloat(rawLine) || 1.5,
    letterSpacing: domSafeMetrics ? 0 : parseFloat(rawLetter) || 0,
  };
}
