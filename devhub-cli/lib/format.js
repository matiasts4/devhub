'use strict';

// Detects TTY once at module load, but also supports FORCE_TTY env var
// for testing TTY output in non-TTY environments (e.g. spawnSync).
const isTTY = process.stdout.isTTY === true || process.env.FORCE_TTY === '1';

/**
 * Returns text as compact plain string.
 * @param {*} text - Any value to stringify
 * @returns {string}
 */
function compactOutput(text) {
  return String(text);
}

/**
 * Returns colored text with ANSI codes if TTY, plain text otherwise.
 * @param {string} text - The text to colorize
 * @param {number} code - ANSI color code (e.g., 31=red, 32=green)
 * @returns {string}
 */
function colorize(text, code) {
  if (!isTTY) return String(text);
  return '\x1b[' + code + 'm' + String(text) + '\x1b[0m';
}

/**
 * Returns a section header string (colored if TTY).
 * @param {string} title - Section title
 * @returns {string}
 */
function section(title) {
  return isTTY ? colorize('\n═══ ' + title + ' ═══', 36) : '\n--- ' + title + ' ---';
}

/**
 * Returns a single data row: "  label: value"
 * @param {string} label - Row label
 * @param {string|number} value - Row value
 * @returns {string}
 */
function row(label, value) {
  return '  ' + label + ': ' + value;
}

/**
 * Returns a horizontal divider.
 * @returns {string}
 */
function divider() {
  return isTTY ? colorize('\u2500'.repeat(40), 90) : '-'.repeat(40);
}

/**
 * Renders aligned tabular output.
 * @param {string[]} headers - Column headers
 * @param {string[][]} rows - Array of row arrays (each same length as headers)
 * @param {boolean} [ttyOverride] - Force TTY/non-TTY mode (for testing)
 * @returns {string} Formatted table string
 */
function table(headers, rows, ttyOverride) {
  if (headers.length === 0) return '';

  const tty = ttyOverride !== undefined ? ttyOverride : isTTY;

  // Compute max width per column (including headers in TTY mode)
  const widths = headers.map((h, i) => {
    let max = tty ? String(h).length : 0;
    for (const row of rows) {
      const len = String(row[i] || '').length;
      if (len > max) max = len;
    }
    return max;
  });

  const pad = (val, width) => String(val || '').padEnd(width);

  if (tty) {
    const lines = [];
    // Header row
    lines.push(headers.map((h, i) => pad(h, widths[i])).join('  '));
    // Separator
    lines.push(widths.map(w => '-'.repeat(w)).join('  '));
    // Data rows
    for (const row of rows) {
      lines.push(row.map((cell, i) => pad(cell, widths[i])).join('  '));
    }
    return lines.join('\n');
  }

  // Non-TTY: pipe-separated, no header
  if (rows.length === 0) return '';
  return rows.map(row => row.map(cell => cell || '').join('|')).join('\n');
}

module.exports = { compactOutput, colorize, isTTY, section, row, divider, table };
