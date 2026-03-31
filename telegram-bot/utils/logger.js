/**
 * Simple logger with timestamps, levels, and ANSI colors.
 *
 * Format: [2026-03-31T21:00:00.000Z] [INFO] message
 * Colors: INFO=green, WARN=yellow, ERROR=red
 */

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

const LEVEL_COLORS = {
  INFO: COLORS.green,
  WARN: COLORS.yellow,
  ERROR: COLORS.red,
};

/**
 * Core log function.
 * @param {string} level - Log level (INFO, WARN, ERROR)
 * @param {string} msg - Message to log
 */
function log(level, msg) {
  const ts = new Date().toISOString();
  const color = LEVEL_COLORS[level] || COLORS.reset;
  const line = `${COLORS.gray}[${ts}]${COLORS.reset} ${color}[${level}]${COLORS.reset} ${msg}`;

  if (level === 'ERROR') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

/**
 * Log an informational message.
 * @param {string} msg
 */
function info(msg) {
  log('INFO', msg);
}

/**
 * Log a warning message.
 * @param {string} msg
 */
function warn(msg) {
  log('WARN', msg);
}

/**
 * Log an error message.
 * @param {string} msg
 */
function error(msg) {
  log('ERROR', msg);
}

module.exports = { info, warn, error };
