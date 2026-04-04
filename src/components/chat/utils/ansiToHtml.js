/**
 * ansiToHtml — Convert ANSI escape sequences to inline HTML spans.
 *
 * Supports: bold, dim, italic, underline, foreground colors (30-37, 90-97),
 * background colors (40-47, 100-107), and reset (0).
 *
 * Does NOT create new dependencies — pure regex-based converter.
 *
 * @param {string} text - Raw string with ANSI escape codes
 * @returns {string} HTML string with inline styles
 */

// ANSI color map — standard 8 colors + bright variants
const FG_COLORS = {
  30: '#000000',
  31: '#cd3131',
  32: '#0dbc79',
  33: '#e5e510',
  34: '#2472c8',
  35: '#bc3fbc',
  36: '#11a8cd',
  37: '#e5e5e5',
  90: '#666666',
  91: '#f14c4c',
  92: '#23d18b',
  93: '#f5f543',
  94: '#3b8eea',
  95: '#d670d6',
  96: '#29b8db',
  97: '#ffffff',
};

const BG_COLORS = {
  40: '#000000',
  41: '#cd3131',
  42: '#0dbc79',
  43: '#e5e510',
  44: '#2472c8',
  45: '#bc3fbc',
  46: '#11a8cd',
  47: '#e5e5e5',
  100: '#666666',
  101: '#f14c4c',
  102: '#23d18b',
  103: '#f5f543',
  104: '#3b8eea',
  105: '#d670d6',
  106: '#29b8db',
  107: '#ffffff',
};

// Match ANSI escape sequences: ESC[...m
const ANSI_REGEX = /\x1b\[([0-9;]*)m/g;

/**
 * Parse a sequence of SGR parameters into style properties.
 * @param {string} params - semicolon-separated numbers
 * @returns {{ styles: string[], reset: boolean }}
 */
function parseSgrParams(params) {
  const codes = params.split(';').filter(Boolean);
  const styles = [];
  let reset = false;

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];

    if (code === '0') {
      reset = true;
      styles.length = 0; // clear all
      continue;
    }

    if (code === '1') {
      styles.push('font-weight: bold');
    } else if (code === '2') {
      styles.push('opacity: 0.6');
    } else if (code === '3') {
      styles.push('font-style: italic');
    } else if (code === '4') {
      styles.push('text-decoration: underline');
    } else if (code === '38' && codes[i + 1] === '5') {
      // 256-color foreground: ESC[38;5;Nm
      i += 2;
      const n = parseInt(codes[i], 10);
      if (!isNaN(n)) {
        styles.push(`color: ${_color256(n)}`);
      }
    } else if (code === '48' && codes[i + 1] === '5') {
      // 256-color background: ESC[48;5;Nm
      i += 2;
      const n = parseInt(codes[i], 10);
      if (!isNaN(n)) {
        styles.push(`background-color: ${_color256(n)}`);
      }
    } else if (FG_COLORS[code]) {
      styles.push(`color: ${FG_COLORS[code]}`);
    } else if (BG_COLORS[code]) {
      styles.push(`background-color: ${BG_COLORS[code]}`);
    }
  }

  return { styles, reset };
}

/**
 * Convert a 256-color palette index to a hex color.
 * @param {number} n
 * @returns {string}
 */
function _color256(n) {
  if (n < 0 || n > 255) return '#ffffff';

  // 0-7: standard colors
  if (n < 8) {
    const std = [
      '#000000',
      '#cd3131',
      '#0dbc79',
      '#e5e510',
      '#2472c8',
      '#bc3fbc',
      '#11a8cd',
      '#e5e5e5',
    ];
    return std[n];
  }

  // 8-15: bright colors
  if (n < 16) {
    const bright = [
      '#666666',
      '#f14c4c',
      '#23d18b',
      '#f5f543',
      '#3b8eea',
      '#d670d6',
      '#29b8db',
      '#ffffff',
    ];
    return bright[n - 8];
  }

  // 16-231: 6x6x6 color cube
  if (n < 232) {
    const idx = n - 16;
    const r = Math.floor(idx / 36) % 6;
    const g = Math.floor(idx / 6) % 6;
    const b = idx % 6;
    const toHex = (v) => {
      const val = v === 0 ? 0 : 55 + v * 40;
      return val.toString(16).padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // 232-255: grayscale ramp
  const gray = 8 + (n - 232) * 10;
  const hex = gray.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

/**
 * Convert ANSI text to HTML.
 *
 * @param {string} text - Text with ANSI escape sequences
 * @param {object} [options]
 * @param {boolean} [options.escapeHtml=true] - Escape HTML entities in non-colored text
 * @returns {string} HTML string
 */
export function ansiToHtml(text, options = {}) {
  const { escapeHtml = true } = options;

  if (!text || typeof text !== 'string') return '';

  // Escape HTML entities first
  let escaped = text;
  if (escapeHtml) {
    escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Split by ANSI escape sequences
  const parts = escaped.split(ANSI_REGEX);
  const result = [];
  let currentStyles = [];

  for (let i = 0; i < parts.length; i++) {
    // Even indices are text, odd indices are SGR parameters
    if (i % 2 === 0) {
      // Text segment
      const textPart = parts[i];
      if (!textPart) continue;

      if (currentStyles.length > 0) {
        result.push(`<span style="${currentStyles.join('; ')}">${textPart}</span>`);
      } else {
        result.push(textPart);
      }
    } else {
      // SGR parameters — parse and update current styles
      const { styles, reset } = parseSgrParams(parts[i]);
      if (reset) {
        currentStyles = [];
      } else {
        // Merge: replace same property types
        const newStyles = [...currentStyles];
        for (const style of styles) {
          const prop = style.split(':')[0].trim();
          // Remove existing style of same property
          const idx = newStyles.findIndex((s) => s.startsWith(prop + ':'));
          if (idx !== -1) newStyles.splice(idx, 1);
          newStyles.push(style);
        }
        currentStyles = newStyles;
      }
    }
  }

  return result.join('');
}

/**
 * React component that renders ANSI text as HTML.
 *
 * @param {{ text: string, className?: string }} props
 */
export function AnsiText({ text, className = '' }) {
  // Lazy import to avoid SSR issues
  const { useMemo } = require('react');
  const html = useMemo(() => ansiToHtml(text || ''), [text]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default ansiToHtml;
