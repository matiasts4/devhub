import { Buffer } from 'node:buffer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';

const DEFAULT_LIMIT = 20;
const QODER_TIMEOUT_MS = 4000;
const CODEX_HEAD_BYTES = 8192;

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

function statMtime(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

/** Slash-normalizes both sides; case-insensitive on win32. */
function normalizeCwdForCompare(value) {
  let normalized = String(value || '')
    .trim()
    .replace(/\\+/g, '/')
    .replace(/\/+$/, '');
  if (process.platform === 'win32') {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

function cwdMatches(sessionCwd, cwdFilter) {
  if (!cwdFilter) return true;
  const directory = normalizeCwdForCompare(sessionCwd);
  const filter = normalizeCwdForCompare(cwdFilter);
  if (!filter) return true;
  if (!directory) return false;
  return directory === filter || directory.startsWith(`${filter}/`);
}

function sortNewestFirst(left, right) {
  const leftTs = left?.updatedAt ? new Date(left.updatedAt).getTime() : 0;
  const rightTs = right?.updatedAt ? new Date(right.updatedAt).getTime() : 0;
  return rightTs - leftTs;
}

function sortAndCap(sessions, limit) {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT;
  return sessions.sort(sortNewestFirst).slice(0, cap);
}

function pickTitle(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

/**
 * Scans ~/.kimi-code/sessions/wd_* /session_* /state.json.
 * State shape: { createdAt, updatedAt, title, workDir, lastPrompt }.
 * Resume: `kimi --session session_<uuid>` (the id IS the dir name, prefix included).
 */
export function scanKimiSessions({ cwd = null, limit = DEFAULT_LIMIT, homeDir } = {}) {
  try {
    const home = homeDir || os.homedir();
    const root = path.join(home, '.kimi-code', 'sessions');
    const sessions = [];

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
        const sessionCwd =
          typeof state.workDir === 'string' && state.workDir.trim() ? state.workDir.trim() : null;
        if (!cwdMatches(sessionCwd, cwd)) continue;

        sessions.push({
          provider: 'kimi',
          sessionId,
          title: pickTitle(state.title, state.lastPrompt, sessionId),
          cwd: sessionCwd,
          updatedAt: normalizeTimestamp(state.updatedAt || state.createdAt) || statMtime(statePath),
          resumeCommand: `kimi --session ${sessionId}`,
          durable: true,
        });
      }
    }

    return { sessions: sortAndCap(sessions, limit) };
  } catch {
    return { sessions: [] };
  }
}

/**
 * Scans ~/.grok/sessions/<encodeURIComponent(cwd)>/<uuid>/summary.json.
 * Summary shape: { info: { id, cwd }, session_summary, created_at, updated_at }.
 * Resume: `grok --resume <uuid>`.
 */
export function scanGrokSessions({ cwd = null, limit = DEFAULT_LIMIT, homeDir } = {}) {
  try {
    const home = homeDir || os.homedir();
    const root = path.join(home, '.grok', 'sessions');
    const sessions = [];

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
        const rawCwd = summary?.info?.cwd;
        const sessionCwd = typeof rawCwd === 'string' && rawCwd.trim() ? rawCwd.trim() : null;
        if (!cwdMatches(sessionCwd, cwd)) continue;

        sessions.push({
          provider: 'grok',
          sessionId,
          title: pickTitle(summary.session_summary, summary.generated_title, sessionId),
          cwd: sessionCwd,
          updatedAt:
            normalizeTimestamp(
              summary.updated_at || summary.last_active_at || summary.created_at
            ) || statMtime(summaryPath),
          resumeCommand: `grok --resume ${sessionId}`,
          durable: true,
        });
      }
    }

    return { sessions: sortAndCap(sessions, limit) };
  } catch {
    return { sessions: [] };
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
  if (depth > 6) return acc;
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
 * Best-effort scan of ~/.codex/sessions (rollout-*.jsonl, possibly nested by date).
 * Extracts id/cwd/timestamp from the first parseable JSONL lines (session_meta).
 * Resume: `codex resume <uuid>`.
 */
export function scanCodexSessions({ cwd = null, limit = DEFAULT_LIMIT, homeDir } = {}) {
  try {
    const home = homeDir || os.homedir();
    const root = path.join(home, '.codex', 'sessions');
    const sessions = [];

    for (const filePath of collectRolloutFiles(root)) {
      const meta = parseCodexRolloutHead(filePath);
      const fileName = path.basename(filePath, '.jsonl');
      const idFromName = fileName.match(/([0-9a-fA-F]{8}-[0-9a-fA-F-]{27,})/)?.[1] || null;
      const sessionId = String(meta?.id || idFromName || '').trim();
      if (!sessionId) continue;

      const sessionCwd = typeof meta?.cwd === 'string' && meta.cwd.trim() ? meta.cwd.trim() : null;
      if (!cwdMatches(sessionCwd, cwd)) continue;

      sessions.push({
        provider: 'codex',
        sessionId,
        title: sessionId,
        cwd: sessionCwd,
        updatedAt: normalizeTimestamp(meta?.timestamp) || statMtime(filePath),
        resumeCommand: `codex resume ${sessionId}`,
        durable: true,
      });
    }

    return { sessions: sortAndCap(sessions, limit) };
  } catch {
    return { sessions: [] };
  }
}

function execFileWithTimeout(execFileImpl, file, args, options) {
  return new Promise((resolve, reject) => {
    execFileImpl(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function normalizeQoderEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const sessionId = String(entry.id || entry.sessionId || entry.session_id || '').trim();
  if (!sessionId) return null;
  const rawCwd = entry.cwd || entry.workDir || entry.directory || null;
  return {
    provider: 'qoder',
    sessionId,
    title: pickTitle(entry.title, entry.summary, entry.name, sessionId),
    cwd: typeof rawCwd === 'string' && rawCwd.trim() ? rawCwd.trim() : null,
    updatedAt: normalizeTimestamp(entry.updatedAt || entry.updated_at || entry.lastActiveAt),
    resumeCommand: `qodercli --resume ${sessionId}`,
    durable: true,
  };
}

function parseQoderListOutput(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : parsed?.sessions;
    if (Array.isArray(list)) {
      return list.map(normalizeQoderEntry).filter(Boolean);
    }
  } catch {
    // Fall through to line-based parsing.
  }

  // Line-based fallback: "<id> [<title...>]" per line; no cwd info available.
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([A-Za-z0-9][\w.-]{1,})\s*(.*)$/);
      if (!match) return null;
      const [, sessionId, title] = match;
      return {
        provider: 'qoder',
        sessionId,
        title: title?.trim() || sessionId,
        cwd: null,
        updatedAt: null,
        resumeCommand: `qodercli --resume ${sessionId}`,
        durable: true,
      };
    })
    .filter(Boolean);
}

/**
 * Runs `qodercli --list-sessions` with a short timeout and parses best-effort.
 * Any error (missing CLI, timeout, garbage output) resolves to { sessions: [] }.
 * When the output carries no cwd info the list is returned unfiltered.
 * Resume: `qodercli --resume <id>`.
 */
export async function scanQoderSessions({
  cwd = null,
  limit = DEFAULT_LIMIT,
  timeoutMs = QODER_TIMEOUT_MS,
  execFileImpl = execFile,
} = {}) {
  try {
    const { stdout } = await execFileWithTimeout(execFileImpl, 'qodercli', ['--list-sessions'], {
      timeout: timeoutMs,
      windowsHide: true,
    });

    const sessions = parseQoderListOutput(stdout);
    const hasCwdInfo = sessions.some((session) => session.cwd);
    const filtered = cwd && hasCwdInfo ? sessions.filter((s) => cwdMatches(s.cwd, cwd)) : sessions;
    return { sessions: sortAndCap(filtered, limit) };
  } catch {
    return { sessions: [] };
  }
}
