/**
 * agentSessionBinder — spawn-time fs correlation between a DevHub terminal
 * session and the provider-side agent session it just created.
 *
 * Node-only (fs/os/path). Used by ttyServer for providers whose launch cannot
 * carry a reliable session id (kimi, codex have no pre-assign flag; grok and
 * qodercli get one only when launched by DevHub, not when typed by hand):
 * after the PTY spawns the agent TUI, we poll the provider's on-disk session
 * store for a session created at/after the spawn time whose cwd matches the
 * panel cwd.
 *
 * Correlation outcomes:
 * - exactly one new candidate → onBound(agentSessionId), polling stops;
 * - multiple new candidates  → ambiguous, bind nothing, polling stops
 *   (the caller falls back to continue-style restore);
 * - no candidate within timeoutMs → stop silently.
 *
 * Everything here is best-effort: bindAgentSession never throws and returns a
 * cancel function so the caller can abort polling when the session dies.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { normalizeCwdForCompare } from './cwdNormalize.js';

export { normalizeCwdForCompare };

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 30000;
// Tolerate small clock skew between the PTY spawn timestamp and the timestamp
// the provider CLI writes into its own session metadata.
const CLOCK_SKEW_MS = 5000;
const CODEX_HEAD_BYTES = 8192;
const CODEX_SCAN_MAX_DEPTH = 6;

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function statTimes(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return { mtimeMs: stat.mtimeMs, birthtimeMs: stat.birthtimeMs };
  } catch {
    return { mtimeMs: null, birthtimeMs: null };
  }
}

function parseTimestampMs(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/** Slash-normalizes both sides; case-insensitive on win32. */
// Implementation lives in ./cwdNormalize.js (pure, browser-safe); re-exported above.

/**
 * Binding requires an exact cwd match (no subdirectory tolerance): a fuzzy
 * match could steal a session that belongs to a different panel.
 */
function cwdMatchesExactly(sessionCwd, cwd) {
  const directory = normalizeCwdForCompare(sessionCwd);
  const filter = normalizeCwdForCompare(cwd);
  if (!directory || !filter) return false;
  return directory === filter;
}

function buildResult(candidates) {
  if (candidates.length === 0) return { status: 'none', sessionId: null, candidates: [] };
  if (candidates.length === 1) {
    return { status: 'unique', sessionId: candidates[0].sessionId, candidates };
  }
  return { status: 'ambiguous', sessionId: null, candidates };
}

/**
 * Scans ~/.kimi-code/sessions/wd_* /session_* /state.json for sessions created
 * at/after `spawnedAt` (minus clock skew) whose state.workDir matches `cwd`.
 *
 * @returns {{ status: 'none'|'unique'|'ambiguous', sessionId: string|null, candidates: Array }}
 */
export function findNewKimiSession({ homeDir = null, cwd = null, spawnedAt = 0 } = {}) {
  try {
    if (!cwd || !Number.isFinite(spawnedAt)) return buildResult([]);
    const home = homeDir || os.homedir();
    const root = path.join(home, '.kimi-code', 'sessions');
    const threshold = spawnedAt - CLOCK_SKEW_MS;
    const candidates = [];

    for (const wdEntry of safeReaddir(root)) {
      if (!wdEntry.isDirectory() || !wdEntry.name.startsWith('wd_')) continue;
      const wdPath = path.join(root, wdEntry.name);

      for (const sessionEntry of safeReaddir(wdPath)) {
        if (!sessionEntry.isDirectory() || !sessionEntry.name.startsWith('session_')) continue;
        const statePath = path.join(wdPath, sessionEntry.name, 'state.json');
        const state = readJsonFile(statePath);
        if (!state) continue;

        // Kimi session ids include the `session_` prefix: `kimi --session session_<uuid>`.
        const sessionId = sessionEntry.name;
        const workDir = typeof state.workDir === 'string' ? state.workDir : null;
        if (!cwdMatchesExactly(workDir, cwd)) continue;

        const createdAtMs =
          parseTimestampMs(state.createdAt) ?? statTimes(statePath).birthtimeMs ?? null;
        if (!Number.isFinite(createdAtMs) || createdAtMs < threshold) continue;

        candidates.push({ sessionId, createdAt: new Date(createdAtMs).toISOString() });
      }
    }

    candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return buildResult(candidates);
  } catch {
    return buildResult([]);
  }
}

function parseCodexRolloutHead(filePath) {
  let head;
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(CODEX_HEAD_BYTES);
      const bytesRead = fs.readSync(fd, buffer, 0, CODEX_HEAD_BYTES, 0);
      head = buffer.toString('utf8', 0, bytesRead);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }

  for (const line of head.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const payload = record?.payload && typeof record.payload === 'object' ? record.payload : record;
    const id = payload?.id || record?.session_id || null;
    const cwd = payload?.cwd || null;
    const timestamp = payload?.timestamp || record?.timestamp || null;
    if (id || cwd || timestamp) {
      return { id, cwd, timestamp };
    }
  }
  return null;
}

function collectRolloutFiles(dir, depth = 0, acc = []) {
  if (depth > CODEX_SCAN_MAX_DEPTH) return acc;
  for (const entry of safeReaddir(dir)) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRolloutFiles(entryPath, depth + 1, acc);
    } else if (
      entry.isFile() &&
      entry.name.startsWith('rollout-') &&
      entry.name.endsWith('.jsonl')
    ) {
      acc.push(entryPath);
    }
  }
  return acc;
}

/**
 * Best-effort scan of ~/.codex/sessions (rollout-*.jsonl, possibly nested by
 * date) for sessions created at/after `spawnedAt` whose recorded cwd matches.
 * The rollout format is not fully verified on all platforms, so every step is
 * defensive: unparseable files simply never become candidates.
 *
 * @returns {{ status: 'none'|'unique'|'ambiguous', sessionId: string|null, candidates: Array }}
 */
export function findNewCodexSession({ homeDir = null, cwd = null, spawnedAt = 0 } = {}) {
  try {
    if (!cwd || !Number.isFinite(spawnedAt)) return buildResult([]);
    const home = homeDir || os.homedir();
    const root = path.join(home, '.codex', 'sessions');
    const threshold = spawnedAt - CLOCK_SKEW_MS;
    const candidates = [];

    for (const filePath of collectRolloutFiles(root)) {
      const meta = parseCodexRolloutHead(filePath);
      const fileName = path.basename(filePath, '.jsonl');
      const idFromName = fileName.match(/([0-9a-fA-F]{8}-[0-9a-fA-F-]{27,})/)?.[1] || null;
      const sessionId = String(meta?.id || idFromName || '').trim();
      if (!sessionId) continue;

      const sessionCwd = typeof meta?.cwd === 'string' && meta.cwd.trim() ? meta.cwd.trim() : null;
      // Without a recorded cwd we cannot prove the session belongs to this
      // panel — skip rather than risk stealing another panel's conversation.
      if (!cwdMatchesExactly(sessionCwd, cwd)) continue;

      const createdAtMs =
        parseTimestampMs(meta?.timestamp) ??
        statTimes(filePath).birthtimeMs ??
        statTimes(filePath).mtimeMs ??
        null;
      if (!Number.isFinite(createdAtMs) || createdAtMs < threshold) continue;

      candidates.push({ sessionId, createdAt: new Date(createdAtMs).toISOString() });
    }

    candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return buildResult(candidates);
  } catch {
    return buildResult([]);
  }
}

/**
 * Scans ~/.qoder/projects/<slug>/<uuid>/state.json for sessions created
 * at/after `spawnedAt` (minus clock skew) whose workspaceDirectories contain
 * the panel cwd (exact match). State shape (verified qodercli 0.x):
 * { sessionId, createdAt, updatedAt, workspaceDirectories: [cwd, ...] }.
 * Resume: `qodercli --resume <uuid>`.
 *
 * @returns {{ status: 'none'|'unique'|'ambiguous', sessionId: string|null, candidates: Array }}
 */
export function findNewQoderSession({ homeDir = null, cwd = null, spawnedAt = 0 } = {}) {
  try {
    if (!cwd || !Number.isFinite(spawnedAt)) return buildResult([]);
    const home = homeDir || os.homedir();
    const root = path.join(home, '.qoder', 'projects');
    const threshold = spawnedAt - CLOCK_SKEW_MS;
    const candidates = [];

    for (const projectEntry of safeReaddir(root)) {
      if (!projectEntry.isDirectory()) continue;
      const projectPath = path.join(root, projectEntry.name);

      for (const sessionEntry of safeReaddir(projectPath)) {
        if (!sessionEntry.isDirectory()) continue;
        const statePath = path.join(projectPath, sessionEntry.name, 'state.json');
        const state = readJsonFile(statePath);
        if (!state) continue;

        const sessionId = String(state.sessionId || sessionEntry.name || '').trim();
        if (!sessionId) continue;

        const workspaceDirs = Array.isArray(state.workspaceDirectories)
          ? state.workspaceDirectories
          : [];
        if (!workspaceDirs.some((dir) => cwdMatchesExactly(dir, cwd))) continue;

        const createdAtMs =
          parseTimestampMs(state.createdAt) ?? statTimes(statePath).birthtimeMs ?? null;
        if (!Number.isFinite(createdAtMs) || createdAtMs < threshold) continue;

        candidates.push({ sessionId, createdAt: new Date(createdAtMs).toISOString() });
      }
    }

    candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return buildResult(candidates);
  } catch {
    return buildResult([]);
  }
}

/**
 * Scans ~/.grok/sessions/<encodeURIComponent(cwd)>/<uuid>/summary.json for
 * sessions created at/after `spawnedAt` (minus clock skew) whose info.cwd
 * matches the panel cwd (exact match). Summary shape:
 * { info: { id, cwd }, session_summary, created_at, updated_at }.
 * Resume: `grok --resume <uuid>`.
 *
 * @returns {{ status: 'none'|'unique'|'ambiguous', sessionId: string|null, candidates: Array }}
 */
export function findNewGrokSession({ homeDir = null, cwd = null, spawnedAt = 0 } = {}) {
  try {
    if (!cwd || !Number.isFinite(spawnedAt)) return buildResult([]);
    const home = homeDir || os.homedir();
    const root = path.join(home, '.grok', 'sessions');
    const threshold = spawnedAt - CLOCK_SKEW_MS;
    const candidates = [];

    for (const cwdEntry of safeReaddir(root)) {
      if (!cwdEntry.isDirectory()) continue;
      const cwdPath = path.join(root, cwdEntry.name);

      for (const sessionEntry of safeReaddir(cwdPath)) {
        if (!sessionEntry.isDirectory()) continue;
        const summaryPath = path.join(cwdPath, sessionEntry.name, 'summary.json');
        const summary = readJsonFile(summaryPath);
        if (!summary) continue;

        const sessionId = String(summary?.info?.id || sessionEntry.name || '').trim();
        if (!sessionId) continue;

        const sessionCwd =
          typeof summary?.info?.cwd === 'string' && summary.info.cwd.trim()
            ? summary.info.cwd.trim()
            : null;
        // Without a recorded cwd we cannot prove the session belongs to this
        // panel — skip rather than risk stealing another panel's conversation.
        if (!cwdMatchesExactly(sessionCwd, cwd)) continue;

        const createdAtMs =
          parseTimestampMs(summary.created_at) ?? statTimes(summaryPath).birthtimeMs ?? null;
        if (!Number.isFinite(createdAtMs) || createdAtMs < threshold) continue;

        candidates.push({ sessionId, createdAt: new Date(createdAtMs).toISOString() });
      }
    }

    candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return buildResult(candidates);
  } catch {
    return buildResult([]);
  }
}

const PROVIDER_SCANNERS = {
  kimi: findNewKimiSession,
  codex: findNewCodexSession,
  grok: findNewGrokSession,
  qodercli: findNewQoderSession,
};

/**
 * Polls the provider session store until a unique new session appears, the
 * match turns ambiguous, or the timeout elapses. Never throws.
 *
 * @param {object} opts
 * @param {string} opts.sessionId - DevHub terminal session id (diagnostics only).
 * @param {string} opts.agentType - 'kimi' | 'codex' | 'grok' | 'qodercli' (fs-correlation providers).
 * @param {string} opts.cwd - panel cwd the provider session must match.
 * @param {number} opts.spawnedAt - epoch ms when the agent process was spawned.
 * @param {(agentSessionId: string) => void} opts.onBound - called once on a unique match.
 * @param {(status: 'bound'|'ambiguous'|'timeout', info?: object) => void} [opts.onSettled]
 *   Optional lifecycle hook fired exactly once when polling ends with an
 *   outcome (never on cancel): 'bound' (after onBound), 'ambiguous'
 *   (info.candidates), or 'timeout'. Listener errors are swallowed.
 * @param {string} [opts.homeDir] - home override for tests.
 * @param {() => number} [opts.now] - clock override for tests.
 * @param {number} [opts.intervalMs] - poll interval (default ~2s).
 * @param {number} [opts.timeoutMs] - give up after this (default ~30s).
 * @returns {() => void} cancel function (idempotent).
 */
export function bindAgentSession(options = {}) {
  const noop = () => {};

  try {
    const {
      sessionId = null,
      agentType = null,
      cwd = null,
      spawnedAt = 0,
      onBound = null,
      onSettled = null,
      homeDir = null,
      now = null,
      intervalMs = DEFAULT_INTERVAL_MS,
      timeoutMs = DEFAULT_TIMEOUT_MS,
    } = options || {};
    const scanner = PROVIDER_SCANNERS[agentType] || null;
    if (!scanner || typeof onBound !== 'function' || !cwd || !Number.isFinite(spawnedAt)) {
      return noop;
    }

    const clock = typeof now === 'function' ? now : () => Date.now();
    const startedAt = clock();
    const safeInterval =
      Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS;
    const safeTimeout =
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;

    let cancelled = false;
    let timer = null;

    const settle = (status, info = null) => {
      if (typeof onSettled !== 'function') return;
      try {
        onSettled(status, info);
      } catch {
        // Listener failures must never break the PTY server.
      }
    };

    const stop = () => {
      if (cancelled) return;
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const check = () => {
      if (cancelled) return;

      let result = null;
      try {
        result = scanner({ homeDir, cwd, spawnedAt });
      } catch {
        result = null;
      }

      if (result?.status === 'unique' && result.sessionId) {
        stop();
        try {
          onBound(result.sessionId);
        } catch {
          // Listener failures must never break the PTY server.
        }
        settle('bound', { sessionId: result.sessionId });
        return;
      }

      if (result?.status === 'ambiguous') {
        // Two or more new sessions in the same cwd — binding either one could
        // resume the wrong conversation. Stop and let the caller fall back to
        // continue-style restore.
        stop();
        settle('ambiguous', { candidates: result.candidates || [] });
        return;
      }

      if (clock() - startedAt >= safeTimeout) {
        stop();
        settle('timeout', { timeoutMs: safeTimeout });
        return;
      }

      timer = setTimeout(check, safeInterval);
      if (typeof timer.unref === 'function') timer.unref();
    };

    check();
    return stop;
  } catch {
    return noop;
  }
}
