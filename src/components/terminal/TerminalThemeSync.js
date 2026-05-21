/**
 * TerminalThemeSync — Reads CSS custom properties from the document and
 * converts them into an xterm.js ITheme-compatible object.
 *
 * All colors are driven by CSS vars so the terminal always matches the
 * current app theme (dark / light / custom).
 *
 * Pure function: buildXtermTheme(getVar) — accepts a CSS var resolver,
 * returns an xterm theme object. Testable without a DOM.
 */

let cachedTheme = null;

/**
 * Pure function: builds an xterm theme from a CSS var resolver.
 * @param {(name: string) => string} getVar - CSS var resolver
 * @returns {object} xterm-compatible ITheme object
 */
export function buildXtermTheme(getVar) {
  const surfaceApp = getVar('--surface-app');

  return {
    background: getVar('--terminal-bg') || surfaceApp || '#0D1117',
    foreground: getVar('--terminal-fg') || '#F0F6FC',
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

function makeDomCssVarResolver() {
  return (name) => {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
