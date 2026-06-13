/**
 * Pizarra Canvas Theme
 *
 * Bridges CSS variables from globals.css to JavaScript constants for Konva.
 * Must be kept in sync with --surface-* and --text-* CSS vars in globals.css.
 */

export const KONVA_THEME = {
  colors: {
    background: 'transparent',
    stroke: '#000000',
    fill: '#ffffff',
    selection: '#3b82f6',
    text: '#f0ece4',
    textMuted: '#8a8578',
  },
  fonts: {
    primary: "'JetBrains Mono', monospace",
    fallback: "'Geist', -apple-system, sans-serif",
  },
};

// Default shape visual properties sourced from CSS design tokens
export const SHAPE_DEFAULTS = {
  fill: '#3b82f6',
  stroke: '#60a5fa',
  strokeWidth: 2,
  opacity: 1,
  cornerRadius: 4,
  fontSize: 16,
  fontFamily: "'JetBrains Mono', monospace",
};

// Tool palette defaults (the "current tool settings")
export const TOOL_SETTINGS = {
  fill: '#3b82f6',
  stroke: '#60a5fa',
  strokeWidth: 2,
  opacity: 1,
};

/**
 * Read current CSS custom property values client-side and return a resolved
 * theme object. Call this inside useEffect to avoid SSR mismatches.
 */
export function getComputedTheme() {
  const root = document.documentElement;
  const read = (varName, fallback) => {
    return root.style.getPropertyValue(varName).trim() || fallback;
  };

  return {
    colors: {
      background: 'transparent',
      stroke: read('--accent-primary', KONVA_THEME.colors.stroke),
      fill: read('--surface-card', KONVA_THEME.colors.fill),
      selection: read('--accent-primary', KONVA_THEME.colors.selection),
      text: read('--text-primary', KONVA_THEME.colors.text),
      textMuted: read('--text-muted', KONVA_THEME.colors.textMuted),
    },
    fonts: KONVA_THEME.fonts,
  };
}