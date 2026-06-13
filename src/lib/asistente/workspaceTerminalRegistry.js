/**
 * Merge client workspace terminal registry (panel ids + displayNames from UI)
 * with server-side `/api/terminal/processes` entries. Client registry wins
 * for displayName and panel id alignment; API entries fill gaps (tmux, sidecar).
 */

import { nameFromId } from './zedTerminalResolver';

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const terminalId =
    (typeof entry.terminalId === 'string' && entry.terminalId.trim()) ||
    (typeof entry.id === 'string' && entry.id.trim()) ||
    null;
  if (!terminalId) return null;
  const displayName =
    typeof entry.displayName === 'string' && entry.displayName.length > 0
      ? entry.displayName
      : nameFromId(terminalId);
  return {
    ...entry,
    terminalId,
    displayName,
  };
}

/**
 * @param {Array<object>|null|undefined} workspaceTerminals - from client context
 * @param {Array<object>|null|undefined} apiProcesses - from /api/terminal/processes
 * @returns {Array<object>}
 */
export function mergeWorkspaceTerminalProcesses(workspaceTerminals, apiProcesses) {
  const byId = new Map();

  const clientList = Array.isArray(workspaceTerminals) ? workspaceTerminals : [];
  for (const raw of clientList) {
    const entry = normalizeEntry(raw);
    if (entry) byId.set(entry.terminalId, entry);
  }

  const apiList = Array.isArray(apiProcesses) ? apiProcesses : [];
  for (const raw of apiList) {
    const entry = normalizeEntry(raw);
    if (!entry) continue;
    const existing = byId.get(entry.terminalId);
    if (existing) {
      byId.set(entry.terminalId, {
        ...entry,
        ...existing,
        displayName: existing.displayName || entry.displayName,
      });
    } else {
      byId.set(entry.terminalId, entry);
    }
  }

  return [...byId.values()];
}

/**
 * Build the terminal catalog Zed should trust: client UI registry first,
 * optional API/tmux enrichment via mergeWorkspaceTerminalProcesses.
 *
 * @param {object|null|undefined} context
 * @param {Array<object>|null|undefined} [apiProcesses]
 * @returns {Array<object>}
 */
export function buildZedTerminalCatalog(context, apiProcesses = null) {
  const client = workspaceTerminalsFromContext(context);
  if (apiProcesses === null) {
    return client.map((raw) => normalizeEntry(raw)).filter(Boolean);
  }
  return mergeWorkspaceTerminalProcesses(client, apiProcesses);
}

/**
 * @param {object|null|undefined} context - Zed request context from client
 * @returns {Array<object>}
 */
export function workspaceTerminalsFromContext(context) {
  const list = context?.workspace_terminals;
  return Array.isArray(list) ? list : [];
}
