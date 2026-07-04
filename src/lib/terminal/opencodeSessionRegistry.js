/**
 * opencodeSessionRegistry.js — durable opencode session map for Phase 7 restore.
 *
 * Tracks terminal panels that launched `opencode --session <id>` so the sidecar
 * can mark them opencode-durable and skip backend PTY respawn on restart.
 * The frontend relaunches via `opencode --session <id>`.
 */

import { extractOpenCodeSessionId } from './restorePolicyResolver.js';

export const OPENCODE_SESSION_TYPE = 'opencode-durable';

const registry = new Map();

function normalizeResumeCommand(initialCommand) {
  return String(initialCommand || '')
    .replace(/\s*#recovery-\d+\s*$/i, '')
    .trim();
}

export function parseOpenCodeSessionIdFromCommand(initialCommand) {
  return extractOpenCodeSessionId(initialCommand);
}

export function isOpencodeDurableSession(session = {}) {
  if (session?.opencodeSessionId) return true;
  return session?.sessionType === OPENCODE_SESSION_TYPE;
}

export function shouldSkipBackendRestore(session = {}) {
  return isOpencodeDurableSession(session);
}

export function buildOpencodeResumeCommand({
  opencodeSessionId = null,
  initialCommand = null,
} = {}) {
  const normalizedCommand = normalizeResumeCommand(initialCommand);
  if (normalizedCommand) return normalizedCommand;

  const sessionId = String(opencodeSessionId || '').trim();
  if (!sessionId) return null;

  return `opencode --session ${sessionId}`;
}

export function applyOpencodeDurableMetadata(
  session = {},
  { initialCommand = null, opencodeSessionId = null } = {}
) {
  const detectedId =
    String(opencodeSessionId || '').trim() ||
    parseOpenCodeSessionIdFromCommand(initialCommand || session.initialCommand) ||
    null;

  if (!detectedId) return session;

  const resumeCommand =
    normalizeResumeCommand(initialCommand || session.initialCommand) ||
    buildOpencodeResumeCommand({ opencodeSessionId: detectedId });

  return {
    ...session,
    opencodeSessionId: detectedId,
    sessionType: OPENCODE_SESSION_TYPE,
    skipBackendRestore: true,
    durableRestore: true,
    initialCommand: resumeCommand,
  };
}

export function registerOpencodeSession(
  terminalId,
  { opencodeSessionId = null, initialCommand = null } = {}
) {
  const safeTerminalId = String(terminalId || '').trim();
  const sessionId =
    String(opencodeSessionId || '').trim() ||
    parseOpenCodeSessionIdFromCommand(initialCommand) ||
    null;

  if (!safeTerminalId || !sessionId) return null;

  const entry = {
    terminalId: safeTerminalId,
    opencodeSessionId: sessionId,
    initialCommand: buildOpencodeResumeCommand({ opencodeSessionId: sessionId, initialCommand }),
    registeredAt: Date.now(),
  };

  registry.set(safeTerminalId, entry);
  return entry;
}

export function unregisterOpencodeSession(terminalId) {
  if (!terminalId) return false;
  return registry.delete(terminalId);
}

export function getOpencodeSession(terminalId) {
  if (!terminalId) return null;
  return registry.get(terminalId) || null;
}

export function listOpencodeSessions() {
  return [...registry.values()];
}

export function resetOpencodeSessionRegistryForTests() {
  registry.clear();
}
