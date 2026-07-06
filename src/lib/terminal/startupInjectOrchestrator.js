/**
 * startupInjectOrchestrator.js — single authority for cold-start PTY inject decisions.
 */

import { getPanelInitialCommandDispatch } from './panelInitialCommandLifecycle';

export function normalizeInjectCommand(command) {
  return String(command || '')
    .replace(/\s*#recovery-\d+\s*$/i, '')
    .trim();
}

/**
 * @returns {{ action: 'inject', command: string, reason: string } | { action: 'skip', reason: string }}
 */
export function resolvePanelStartupInjectIntent({
  panelId = null,
  panel = null,
  proposedCommand = null,
  phase = 'hydrate',
  runtimeTerminal = null,
  restorePolicy = 'auto',
  allowRecoverySuffix = false,
} = {}) {
  const normalizedProposed = normalizeInjectCommand(proposedCommand);
  if (!normalizedProposed) {
    return { action: 'skip', reason: 'empty-command' };
  }

  if (allowRecoverySuffix && /#recovery-\d+\s*$/i.test(String(proposedCommand || ''))) {
    return { action: 'inject', command: normalizedProposed, reason: 'explicit-recovery' };
  }

  if (restorePolicy === 'off') {
    return { action: 'skip', reason: 'policy-off' };
  }

  if (phase === 'startup-relaunch' && restorePolicy === 'manual') {
    return { action: 'skip', reason: 'policy-manual' };
  }

  if (runtimeTerminal?.alive) {
    return { action: 'skip', reason: 'runtime-live' };
  }

  const id = panelId || panel?.id || null;
  if (id) {
    const record = getPanelInitialCommandDispatch(id);
    const normalizedRecord = normalizeInjectCommand(record?.command);
    if (normalizedRecord && normalizedRecord === normalizedProposed) {
      return { action: 'skip', reason: 'already-dispatched' };
    }
  }

  return { action: 'inject', command: normalizedProposed, reason: `${phase}-inject` };
}
