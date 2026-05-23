'use strict';

// Detects TTY once at module load
const isTTY = process.stdout.isTTY === true;

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

module.exports = { compactOutput, colorize, isTTY, section, row, divider };
