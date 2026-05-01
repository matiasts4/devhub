/**
 * sessionStore.js — Persist and restore PTY session metadata across app restarts.
 *
 * Handles read/write of ~/.devhub/terminal-sessions.json with:
 * - Atomic writes (tmp+rename)
 * - Stale session eviction (7-day TTL based on lastSeenAt)
 * - Graceful first-run (no file → return [])
 * - Corrupted file handling (invalid JSON → warn + return [])
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

export const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns the session file path, always evaluating os.homedir() at call time.
 * Exported as a function so tests can mock os.homedir() before calling.
 */
export function getSessionFilePath() {
  return path.join(os.homedir(), '.devhub', 'terminal-sessions.json');
}

/**
 * Convenience constant — computed once at module load.
 * Use getSessionFilePath() in tests where os.homedir() may be mocked.
 */
export const SESSION_FILE_PATH = getSessionFilePath();

/**
 * saveSessions — atomically write sessions Map to disk.
 *
 * @param {Map<string, object>} sessionsMap - Map of terminalId → session data
 */
export function saveSessions(sessionsMap) {
  const filePath = getSessionFilePath();
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sessions = [];
  for (const [id, session] of sessionsMap.entries()) {
    sessions.push({
      id: session.id || id,
      cwd: session.cwd || '',
      shell: session.shell || '',
      title: session.title || null,
      createdAt: session.createdAt || new Date().toISOString(),
      lastSeenAt: session.lastSeenAt || new Date().toISOString(),
      restored: session.restored || false,
    });
  }

  const json = JSON.stringify({ version: 1, sessions }, null, 2);
  const tmpPath = filePath + '.tmp';

  fs.writeFileSync(tmpPath, json, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * loadSessions — read sessions from disk, filter stale ones, mark restored: true.
 *
 * @returns {Array<object>} array of session objects with restored: true
 */
export function loadSessions() {
  const filePath = getSessionFilePath();

  if (!fs.existsSync(filePath)) {
    return [];
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.warn('[sessionStore] Failed to read session file:', err);
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('[sessionStore] Corrupted session file, starting fresh:', err);
    return [];
  }

  if (!parsed || !Array.isArray(parsed.sessions)) {
    console.warn('[sessionStore] Invalid session file schema, starting fresh');
    return [];
  }

  const now = Date.now();
  const fresh = parsed.sessions.filter((s) => {
    if (!s.lastSeenAt) return false;
    const lastSeen = new Date(s.lastSeenAt).getTime();
    return now - lastSeen < STALE_TTL_MS;
  });

  return fresh.map((s) => ({ ...s, restored: true }));
}
