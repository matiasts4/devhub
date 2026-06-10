import { RESTORE_POLICY, readTerminalRestorePreferences } from './restorePreferences';

const VALID_POLICIES = new Set([RESTORE_POLICY.AUTO, RESTORE_POLICY.MANUAL, RESTORE_POLICY.OFF]);

const OPENCODE_SESSION_RE = /opencode\s+--session\s+([\w-]+)/i;
const SWARM_LAUNCH_WRAPPER_RE = /devhub-launch-[\w-]+\.sh/i;

export function isSwarmLaunchWrapperCommand(initialCommand) {
  return SWARM_LAUNCH_WRAPPER_RE.test(String(initialCommand || ''));
}

export function buildSwarmTmuxAttachCommand(launchId, roleKey) {
  const safeLaunch = String(launchId || '').trim();
  const safeRole = String(roleKey || '').trim();
  if (!safeLaunch || !safeRole) return null;
  return `tmux attach-session -t devhub-swarm-${safeLaunch}-${safeRole}`;
}

export function extractOpenCodeSessionId(initialCommand) {
  const command = String(initialCommand || '').trim();
  if (!command) return null;
  const match = command.match(OPENCODE_SESSION_RE);
  return match?.[1] || null;
}

/**
 * Classifies a panel for global restore preference lookup.
 * @returns {'opencode'|'generic'|'swarm'}
 */
export function inferPanelSessionKind({
  initialCommand = null,
  agentRun = null,
  panel = null,
} = {}) {
  if (agentRun?.opencodeSessionId || extractOpenCodeSessionId(initialCommand)) {
    return 'opencode';
  }
  if (
    panel?.swarmContext?.isSwarmRole ||
    agentRun?.swarmRole ||
    agentRun?.launchOrigin === 'swarm-control-launch' ||
    agentRun?.roleKey ||
    isSwarmLaunchWrapperCommand(initialCommand)
  ) {
    return 'swarm';
  }
  if (/opencode/i.test(String(initialCommand || ''))) {
    return 'opencode';
  }
  return 'generic';
}

export function normalizeRestorePolicyValue(policy) {
  return VALID_POLICIES.has(policy) ? policy : RESTORE_POLICY.AUTO;
}

/**
 * Per-session policy wins when set; otherwise workspace default from restorePreferences.
 */
export function resolveEffectiveRestorePolicy({
  sessionKind = 'generic',
  perSessionPolicy = null,
  preferences = null,
} = {}) {
  if (VALID_POLICIES.has(perSessionPolicy)) {
    return perSessionPolicy;
  }

  const prefs = preferences || {
    opencode: RESTORE_POLICY.AUTO,
    generic: RESTORE_POLICY.AUTO,
    swarm: RESTORE_POLICY.AUTO,
  };

  const globalPolicy = prefs[sessionKind] ?? prefs.generic ?? RESTORE_POLICY.AUTO;
  return normalizeRestorePolicyValue(globalPolicy);
}

export function readWorkspaceRestorePreferences(storage) {
  return readTerminalRestorePreferences(storage);
}

/**
 * Ensures durable OpenCode panels persist `opencode --session <id>` for reboot-safe resume.
 */
export function normalizeOpenCodePanelCommand(panel, agentRun = null) {
  if (!panel?.id) return panel;

  const sessionId =
    (typeof agentRun?.opencodeSessionId === 'string' && agentRun.opencodeSessionId.trim()) ||
    extractOpenCodeSessionId(panel.initialCommand);

  if (!sessionId) return panel;

  const expectedCommand = `opencode --session ${sessionId}`;
  const current = String(panel.initialCommand || '').trim();

  if (current === expectedCommand) return panel;

  if (!current || /opencode/i.test(current)) {
    return { ...panel, initialCommand: expectedCommand };
  }

  return panel;
}

export function normalizeWorkspacesOpenCodeCommands(workspaces = [], agentRunsByPanel = {}) {
  if (!Array.isArray(workspaces)) return [];

  return workspaces.map((workspace) => ({
    ...workspace,
    columns: (workspace?.columns || []).map((column) => ({
      ...column,
      panels: (column?.panels || []).map((panel) =>
        normalizeOpenCodePanelCommand(panel, agentRunsByPanel?.[panel.id] || null)
      ),
    })),
  }));
}

export function isOpenCodePanel(panel, agentRun = null) {
  return (
    inferPanelSessionKind({
      initialCommand: panel?.initialCommand,
      agentRun,
    }) === 'opencode'
  );
}

/**
 * Whether an opencode-session-detected event should update this panel's restore command.
 * Blocks cross-contamination into grok/hermes/swarm panels when another workspace closes.
 */
export function shouldPersistOpenCodeSessionForPanel(panel = null, agentRun = null) {
  if (!panel) return false;

  const command = String(panel.initialCommand || '')
    .replace(/\s*#recovery-\d+\s*$/i, '')
    .trim();

  if (/^(grok|groc)\b/i.test(command) || /^hermes\b/i.test(command)) return false;
  if (
    inferPanelSessionKind({
      initialCommand: panel.initialCommand,
      agentRun,
      panel,
    }) === 'swarm'
  ) {
    return false;
  }

  if (/^opencode\b/i.test(command) || agentRun?.opencodeSessionId) return true;
  if (!command) return true;

  return false;
}

/**
 * Best-effort OpenCode session id for manual resume (panel command → agent run → hint).
 */
export function resolveOpenCodeSessionIdForPanel({
  panel = null,
  agentRun = null,
  hintSessionId = null,
} = {}) {
  const fromCommand = extractOpenCodeSessionId(panel?.initialCommand);
  if (fromCommand) return fromCommand;

  const fromRun =
    typeof agentRun?.opencodeSessionId === 'string' ? agentRun.opencodeSessionId.trim() : '';
  if (fromRun) return fromRun;

  const panelId = typeof panel?.id === 'string' ? panel.id.trim() : '';
  const hint = typeof hintSessionId === 'string' ? hintSessionId.trim() : '';
  if (hint && hint !== panelId) return hint;

  return null;
}
