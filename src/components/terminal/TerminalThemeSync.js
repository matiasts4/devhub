/**
 * TerminalThemeSync — Reads CSS custom properties from the document and
 * converts them into an xterm.js ITheme-compatible object.
 *
 * All colors are driven by CSS vars so the terminal always matches the
 * current app theme (dark / light / custom).
 */

let cachedTheme = null;

function cssVar(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

export function getTerminalTheme() {
  const theme = {
    background: cssVar('--terminal-bg', 'transparent'),
    foreground: cssVar('--terminal-fg', '#F0F6FC'),
    cursor: cssVar('--terminal-cursor', '#58A6FF'),
    selectionBackground: cssVar('--terminal-selection', 'rgba(88,166,255,0.3)'),
    black: cssVar('--terminal-black', '#484F58'),
    red: cssVar('--terminal-red', '#FF7B72'),
    green: cssVar('--terminal-green', '#3FB950'),
    yellow: cssVar('--terminal-yellow', '#D29922'),
    blue: cssVar('--terminal-blue', '#58A6FF'),
    magenta: cssVar('--terminal-magenta', '#BC8CFF'),
    cyan: cssVar('--terminal-cyan', '#39C5CF'),
    white: cssVar('--terminal-white', '#B1BAC4'),
    brightBlack: cssVar('--terminal-bright-black', '#6E7681'),
    brightRed: cssVar('--terminal-bright-red', '#FFA198'),
    brightGreen: cssVar('--terminal-bright-green', '#56D364'),
    brightYellow: cssVar('--terminal-bright-yellow', '#E3B341'),
    brightBlue: cssVar('--terminal-bright-blue', '#79C0FF'),
    brightMagenta: cssVar('--terminal-bright-magenta', '#D2A8FF'),
    brightCyan: cssVar('--terminal-bright-cyan', '#56D4DD'),
    brightWhite: cssVar('--terminal-bright-white', '#F0F6FC'),
  };

  cachedTheme = theme;
  return theme;
}

export function getCachedTheme() {
  return cachedTheme || getTerminalTheme();
}
