/**
 * Tracks initialCommand dispatch per panel across TerminalTTY remounts.
 * React remount resets component refs but the PTY session often stays live.
 */

function normalizeLifecycleCommand(command) {
  if (!command || typeof command !== 'string') return '';
  return command.replace(/\s*#recovery-\d+\s*$/i, '').trim();
}

function isOpenCodeLifecycleCommand(command) {
  return /^opencode\b/i.test(command);
}

function isGrokLifecycleCommand(command) {
  return /^(grok|groc)\b/i.test(command);
}

const dispatchedByPanelId = new Map();

export function markPanelInitialCommandDispatched(panelId, command) {
  const normalizedId = String(panelId || '').trim();
  if (!normalizedId) return;
  const normalizedCommand = normalizeLifecycleCommand(command);
  if (!normalizedCommand) return;
  dispatchedByPanelId.set(normalizedId, {
    command: normalizedCommand,
    at: Date.now(),
  });
}

export function clearPanelInitialCommandLifecycle(panelId) {
  const normalizedId = String(panelId || '').trim();
  if (!normalizedId) return;
  dispatchedByPanelId.delete(normalizedId);
}

export function getPanelInitialCommandDispatch(panelId) {
  const normalizedId = String(panelId || '').trim();
  if (!normalizedId) return null;
  return dispatchedByPanelId.get(normalizedId) || null;
}

export function shouldSkipRedundantInitialCommandSend({
  panelId,
  command,
  isRecoveryRelaunch = false,
  sessionReattached = false,
} = {}) {
  if (isRecoveryRelaunch) return false;
  if (sessionReattached) return true;

  const normalized = normalizeLifecycleCommand(command);
  if (!normalized) return false;

  const record = getPanelInitialCommandDispatch(panelId);
  if (!record?.command) return false;

  if (record.command === normalized) return true;

  if (isOpenCodeLifecycleCommand(record.command) && isOpenCodeLifecycleCommand(normalized)) {
    return true;
  }

  if (isGrokLifecycleCommand(record.command) && isGrokLifecycleCommand(normalized)) {
    return true;
  }

  return false;
}
