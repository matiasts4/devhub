/**
 * sidecarLog — durable JSONL event log for the sidecar terminal server.
 *
 * The sidecar previously wrote NO file logs: restore-relevant events (session
 * binding, session-detected broadcasts, input injection, exits) only existed
 * as ephemeral console lines that packaged builds never persist. This module
 * appends one JSON line per event to:
 *
 *   $DEVHUB_HOME/logs/sidecar-terminal.jsonl   (default ~/.devhub/logs/…)
 *
 * Rotation: at ~2MB the file is renamed to sidecar-terminal.1.jsonl (single
 * backup, overwritten on the next rotation). Best-effort by design:
 * logSidecarEvent never throws and never breaks the PTY server.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_LOG_BYTES = 2 * 1024 * 1024; // ~2MB
const LOG_FILE_NAME = 'sidecar-terminal.jsonl';
const BACKUP_FILE_NAME = 'sidecar-terminal.1.jsonl';

/** Resolved per call so tests can flip DEVHUB_HOME between cases. */
function resolveSidecarLogFile() {
  const home = process.env.DEVHUB_HOME || path.join(os.homedir(), '.devhub');
  return path.join(home, 'logs', LOG_FILE_NAME);
}

function rotateIfNeeded(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size < MAX_LOG_BYTES) return;
    const backup = path.join(path.dirname(file), BACKUP_FILE_NAME);
    try {
      // Windows rename fails when the target exists — remove the old backup.
      fs.rmSync(backup, { force: true });
    } catch {
      // best-effort
    }
    fs.renameSync(file, backup);
  } catch {
    // Missing file or fs hiccup — append will recreate it.
  }
}

/**
 * Appends one JSONL line {ts, source:'sidecar', event, ...details}.
 * Never throws.
 *
 * @param {string} event
 * @param {Record<string, unknown>} [details]
 */
function logSidecarEvent(event, details = {}) {
  try {
    const file = resolveSidecarLogFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotateIfNeeded(file);
    const safeDetails = details && typeof details === 'object' ? details : {};
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      source: 'sidecar',
      event: typeof event === 'string' && event ? event : 'unknown',
      ...safeDetails,
    });
    fs.appendFileSync(file, line + '\n');
  } catch {
    // Logging must never break the sidecar.
  }
}

module.exports = {
  BACKUP_FILE_NAME,
  LOG_FILE_NAME,
  MAX_LOG_BYTES,
  logSidecarEvent,
  resolveSidecarLogFile,
};
