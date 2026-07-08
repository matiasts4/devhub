/**
 * Server-side crash / critical error logging.
 * Writes:
 *  - data/logs/browser.log  (all client logs, existing)
 *  - data/logs/crash.log    (errors tagged as crash / resource / react)
 *  - data/logs/crash-dumps/crash-<iso>.json  (structured dump for investigation)
 */

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const LOG_DIR = join(process.cwd(), 'data', 'logs');
const BROWSER_LOG = join(LOG_DIR, 'browser.log');
const CRASH_LOG = join(LOG_DIR, 'crash.log');
const CRASH_DUMP_DIR = join(LOG_DIR, 'crash-dumps');

/** @param {string} message */
export function isNoiseError(message) {
  const m = String(message || '');
  if (/ResizeObserver loop/i.test(m)) return true;
  // xterm teardown races — same family as dimensions / handleResize IdleTaskQueue
  if (
    /Cannot read properties of undefined \(reading '(dimensions|handleResize)'\)/i.test(m) ||
    /undefined is not an object \(evaluating '.*(dimensions|handleResize)/i.test(m) ||
    (/handleResize/i.test(m) && /xterm/i.test(m)) ||
    (/dimensions/i.test(m) && (/xterm/i.test(m) || /_innerRefresh|Viewport/i.test(m)))
  ) {
    return true;
  }
  if (/Loading chunk [\d]+ failed/i.test(m) === false && /Script error\.?/i.test(m)) {
    // cross-origin script errors without detail — keep as noise unless frequent
    return false;
  }
  return false;
}

/**
 * Classify severity for routing to crash.log + dumps.
 * @param {{ level?: string, message?: string, source?: string, details?: unknown }} entry
 */
export function classifyClientLogSeverity(entry) {
  const level = String(entry?.level || 'log').toLowerCase();
  const message = String(entry?.message || '');
  const source = String(entry?.source || '');

  if (isNoiseError(message)) return 'noise';

  if (
    source === 'react-error-boundary' ||
    source === 'window.onerror' ||
    source === 'unhandledrejection' ||
    source === 'resource-error' ||
    source === 'chunk-load'
  ) {
    if (
      /ReferenceError|TypeError|SyntaxError|ChunkLoadError|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(
        message
      )
    ) {
      return 'crash';
    }
    if (
      source === 'react-error-boundary' ||
      source === 'resource-error' ||
      source === 'chunk-load'
    ) {
      return 'crash';
    }
    if (level === 'error') return 'error';
  }

  if (level === 'error') return 'error';
  if (level === 'warn') return 'warn';
  return 'info';
}

/**
 * @param {object} entry
 * @returns {Promise<{ ok: boolean, severity: string, dumpPath?: string|null }>}
 */
export async function writeClientLogEntry(entry) {
  const severity = classifyClientLogSeverity(entry);
  const timestamp = entry.ts ? new Date(entry.ts).toISOString() : new Date().toISOString();
  const detailsStr = entry.details !== undefined ? ' ' + JSON.stringify(entry.details) : '';
  const sourceStr = entry.source ? ` (${entry.source})` : '';
  const line = `[${timestamp}] [${String(entry.level || 'log').toUpperCase()}]${sourceStr} ${entry.message || ''}${detailsStr}\n`;

  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(BROWSER_LOG, line, 'utf-8');

  let dumpPath = null;
  if (severity === 'crash' || severity === 'error') {
    const crashLine = `[${timestamp}] [${severity.toUpperCase()}]${sourceStr} ${entry.message || ''}${detailsStr}\n`;
    await appendFile(CRASH_LOG, crashLine, 'utf-8');
  }

  if (severity === 'crash') {
    await mkdir(CRASH_DUMP_DIR, { recursive: true });
    const stamp = timestamp.replace(/[:.]/g, '-');
    dumpPath = join(CRASH_DUMP_DIR, `crash-${stamp}.json`);
    const dump = {
      timestamp,
      severity,
      level: entry.level || 'error',
      message: entry.message || '',
      source: entry.source || null,
      details: entry.details ?? null,
      userAgent: entry.userAgent || null,
      href: entry.href || null,
      build: entry.build || null,
    };
    await writeFile(dumpPath, JSON.stringify(dump, null, 2), 'utf-8');
  }

  return { ok: true, severity, dumpPath };
}
