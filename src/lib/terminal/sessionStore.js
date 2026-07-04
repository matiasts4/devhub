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
import {
  applyOpencodeDurableMetadata,
  isOpencodeDurableSession,
  OPENCODE_SESSION_TYPE,
} from './opencodeSessionRegistry.js';

export const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SCHEMA_VERSION = 4;

const VALID_RESTORE_POLICIES = new Set(['auto', 'manual', 'off']);

/**
 * Sanitizes a restorePolicy value to a valid enum member.
 * Unknown, null, undefined, or empty-string values → 'auto'.
 */
function sanitizeRestorePolicy(policy) {
  if (VALID_RESTORE_POLICIES.has(policy)) return policy;
  return 'auto';
}

/**
 * Returns the session file path, honoring DEVHUB_HOME when present.
 * In dev mode DEVHUB_HOME points to ~/.devhub-dev; in packaged runs it is
 * unset and we fall back to ~/.devhub. This keeps dev and release instances
 * from clobbering each other's persisted terminal sessions.
 */
export function getSessionFilePath() {
  const devhubHome = process.env.DEVHUB_HOME;
  if (devhubHome) {
    return path.join(devhubHome, 'terminal-sessions.json');
  }
  return path.join(os.homedir(), '.devhub', 'terminal-sessions.json');
}

/**
 * Convenience constant — computed once at module load.
 * Use getSessionFilePath() in tests where os.homedir() may be mocked.
 */
export const SESSION_FILE_PATH = getSessionFilePath();

function readPersistedSessionsFile() {
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

  return parsed.sessions;
}

function buildPersistedSessionEvidence(session, availability) {
  return {
    provider: 'session_store',
    availability,
    handle_ref: null,
    evidence: {
      terminalId: session.id,
      cwd: session.cwd || '',
      shell: session.shell || '',
      title: session.title || null,
      createdAt: session.createdAt || null,
      lastSeenAt: session.lastSeenAt || null,
    },
  };
}

export function readPersistedSessionEvidence({ terminalId, now = Date.now() } = {}) {
  const persistedSessions = readPersistedSessionsFile();
  const matchedSession = persistedSessions.find((session) => session.id === terminalId);

  if (!matchedSession) {
    return {
      provider: 'session_store',
      availability: 'missing',
      handle_ref: null,
      evidence: terminalId ? { terminalId } : null,
    };
  }

  const lastSeen = new Date(matchedSession.lastSeenAt || 0).getTime();
  const isFresh = Number.isFinite(lastSeen) && now - lastSeen < STALE_TTL_MS;

  return buildPersistedSessionEvidence(matchedSession, isFresh ? 'restorable' : 'stale');
}

/**
 * Classifies a session into one of three mutually exclusive types.
 * @param {object} session
 * @returns {'pty-durable'|'opencode-durable'|'shell-ephemeral'}
 */
export function classifySession(session) {
  if (isOpencodeDurableSession(session)) return OPENCODE_SESSION_TYPE;
  if (session?.ptyPid) return 'pty-durable';
  return 'shell-ephemeral';
}

function enrichPersistedSession(session) {
  const sessionType = classifySession(session);
  const enriched =
    sessionType === OPENCODE_SESSION_TYPE ? applyOpencodeDurableMetadata(session) : session;

  return {
    ...enriched,
    sessionType,
    skipBackendRestore:
      sessionType === OPENCODE_SESSION_TYPE ? true : Boolean(enriched.skipBackendRestore),
    durableRestore: sessionType === OPENCODE_SESSION_TYPE ? true : Boolean(enriched.durableRestore),
  };
}

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
    const enriched = enrichPersistedSession(session);
    sessions.push({
      id: enriched.id || id,
      cwd: enriched.cwd || '',
      shell: enriched.shell || '',
      title: enriched.title || null,
      createdAt: enriched.createdAt || new Date().toISOString(),
      lastSeenAt: enriched.lastSeenAt || new Date().toISOString(),
      lastActivityAt: enriched.lastActivityAt || null,
      ptyPid: enriched.ptyPid ?? null,
      opencodeSessionId: enriched.opencodeSessionId ?? null,
      initialCommand: enriched.initialCommand ?? null,
      agentType: enriched.agentType ?? null,
      agentSessionId: enriched.agentSessionId ?? null,
      swarmRole: enriched.swarmRole ?? null,
      swarmId: enriched.swarmId ?? null,
      sessionType: enriched.sessionType,
      skipBackendRestore: enriched.skipBackendRestore ?? false,
      durableRestore: enriched.durableRestore ?? false,
      restored: enriched.restored || false,
      restorePolicy: enriched.restorePolicy || 'auto',
    });
  }

  const json = JSON.stringify({ version: SCHEMA_VERSION, sessions }, null, 2);
  const tmpPath = filePath + '.tmp';

  fs.writeFileSync(tmpPath, json, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * loadSessions — read sessions from disk, filter stale ones, mark restored: true.
 * Migrates version < 2 sessions to include sessionType.
 *
 * @returns {Array<object>} array of session objects with restored: true
 */
export function loadSessions() {
  const now = Date.now();
  const fresh = readPersistedSessionsFile().filter((s) => {
    if (!s.lastSeenAt) return false;
    const lastSeen = new Date(s.lastSeenAt).getTime();
    return now - lastSeen < STALE_TTL_MS;
  });

  return fresh.map((s) => {
    const enriched = enrichPersistedSession(s);
    const restorePolicy = sanitizeRestorePolicy(enriched.restorePolicy);
    return { ...enriched, restorePolicy, restored: true };
  });
}
