import { RESTORE_POLICY, readTerminalRestorePreferences } from './restorePreferences';
import { detectAgentTypeFromCommand, extractAgentSessionId } from './agentTuiMetadata.shared.js';

const VALID_POLICIES = new Set([RESTORE_POLICY.AUTO, RESTORE_POLICY.MANUAL, RESTORE_POLICY.OFF]);

const OPENCODE_SESSION_RE = /opencode\s+--session\s+([\w-]+)/i;
const SWARM_LAUNCH_WRAPPER_RE = /devhub-launch-[\w-]+\.sh/i;

/** Restore-preference kinds backed by a verified agent TUI provider. */
export const AGENT_PROVIDER_KINDS = Object.freeze(['opencode', 'kimi', 'grok', 'codex', 'qoder']);

const AGENT_TYPE_TO_RESTORE_KIND = Object.freeze({
  opencode: 'opencode',
  kimi: 'kimi',
  grok: 'grok',
  codex: 'codex',
  qodercli: 'qoder',
});

/** Verified per-provider resume-by-id command forms. */
const PROVIDER_RESUME_COMMAND_BUILDERS = Object.freeze({
  opencode: (id) => `opencode --session ${id}`,
  kimi: (id) => `kimi --session ${id}`,
  grok: (id) => `grok --resume ${id}`,
  codex: (id) => `codex resume ${id}`,
  qoder: (id) => `qodercli --resume ${id}`,
});

/** Verified per-provider "latest session per cwd" continue commands. */
const PROVIDER_CONTINUE_COMMANDS = Object.freeze({
  opencode: null, // no verified continue form — opencode restore requires a session id
  kimi: 'kimi --continue',
  grok: 'grok --continue',
  codex: 'codex resume --last',
  qoder: 'qodercli --continue',
});

/** Launch pre-assign forms (`grok --session-id <id>`, `qodercli --session-id <id>`). */
const PRE_ASSIGN_SESSION_RE = /--session-id\s+([\w-]+)/i;
const GROK_RESUME_RE = /(?:^|\b)grok\s+--resume\s+([\w-]+)/i;

/**
 * Maps an agent TUI type (agentTuiMetadata) to a restore preference kind.
 * Unknown/other agent types (claude, hermes, agy, …) map to null → generic.
 */
export function mapAgentTypeToRestoreKind(agentType) {
  return AGENT_TYPE_TO_RESTORE_KIND[agentType] || null;
}

export function normalizeProviderKind(provider) {
  if (!provider) return null;
  const normalized = String(provider).trim().toLowerCase();
  if (normalized === 'qodercli') return 'qoder';
  return AGENT_PROVIDER_KINDS.includes(normalized) ? normalized : null;
}

export function isAgentProviderKind(kind) {
  return normalizeProviderKind(kind) !== null;
}

export function buildProviderResumeCommand(provider, sessionId) {
  const kind = normalizeProviderKind(provider);
  const id = String(sessionId || '').trim();
  if (!kind || !id) return null;
  return PROVIDER_RESUME_COMMAND_BUILDERS[kind](id);
}

export function getProviderContinueCommand(provider) {
  const kind = normalizeProviderKind(provider);
  if (!kind) return null;
  return PROVIDER_CONTINUE_COMMANDS[kind] || null;
}

export function isSwarmLaunchWrapperCommand(initialCommand) {
  return SWARM_LAUNCH_WRAPPER_RE.test(String(initialCommand || ''));
}

export function buildSwarmTmuxSessionName(launchId, roleKey) {
  const safeLaunch = String(launchId || '').trim();
  const safeRole = String(roleKey || '').trim();
  if (!safeLaunch || !safeRole) return null;
  return `devhub-swarm-${safeLaunch}-${safeRole}`;
}

export function buildSwarmTmuxAttachCommand(launchId, roleKey) {
  const sessionName = buildSwarmTmuxSessionName(launchId, roleKey);
  if (!sessionName) return null;
  return `tmux attach-session -t ${sessionName}`;
}

export function extractOpenCodeSessionId(initialCommand) {
  const command = String(initialCommand || '').trim();
  if (!command) return null;
  const match = command.match(OPENCODE_SESSION_RE);
  return match?.[1] || null;
}

/**
 * Per-provider session-id extraction from a launch command. Uses the shared
 * agentTuiMetadata patterns first, then tolerates forms they do not cover yet
 * (grok resume, `--session-id` pre-assign launch forms).
 */
export function extractProviderSessionIdFromCommand(provider, initialCommand) {
  const kind = normalizeProviderKind(provider);
  if (!kind) return null;
  const command = String(initialCommand || '')
    .replace(/\s*#recovery-\d+\s*$/i, '')
    .trim();
  if (!command) return null;

  const agentType = kind === 'qoder' ? 'qodercli' : kind;
  const sharedId = extractAgentSessionId(agentType, command);
  if (sharedId) return sharedId;

  // Pre-assign launch forms carry the session id even though they are one-shot;
  // restore normalizes them to the provider resume form.
  const preAssign = command.match(PRE_ASSIGN_SESSION_RE);
  if (preAssign) return preAssign[1];

  if (kind === 'grok') {
    const resume = command.match(GROK_RESUME_RE);
    if (resume) return resume[1];
  }

  return null;
}

/**
 * Best-effort session id for a provider panel: bound agent-run fields win over
 * (possibly stale) launch commands. Tolerates providers without extraction
 * support (returns null instead of throwing).
 */
export function resolveAgentSessionIdForPanel({
  provider = null,
  initialCommand = null,
  agentRun = null,
} = {}) {
  const kind = normalizeProviderKind(provider);
  if (!kind) return null;

  const fromRun = firstNonEmptyString(
    agentRun?.[`${kind}SessionId`],
    kind === 'qoder' ? agentRun?.qodercliSessionId : null,
    agentRun?.agentSessionId
  );
  if (fromRun) return fromRun;

  return extractProviderSessionIdFromCommand(kind, initialCommand);
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Resolve the restore provider kind for a panel: the launch command wins, then
 * bound agent-run signals (opencode id / explicit agentType).
 */
export function resolveProviderKindForPanel({ initialCommand = null, agentRun = null } = {}) {
  const fromCommand = mapAgentTypeToRestoreKind(detectAgentTypeFromCommand(initialCommand));
  if (fromCommand) return fromCommand;
  if (agentRun?.opencodeSessionId) return 'opencode';
  const fromRun = mapAgentTypeToRestoreKind(agentRun?.agentType);
  if (fromRun) return fromRun;
  return normalizeProviderKind(agentRun?.agentType);
}

/**
 * Classifies a panel for global restore preference lookup.
 * Swarm signals win first (tmux-backed panels restore via reattach), then the
 * verified TUI provider detected from the launch command.
 * @returns {'opencode'|'kimi'|'grok'|'codex'|'qoder'|'swarm'|'generic'}
 */
export function inferPanelSessionKind({
  initialCommand = null,
  agentRun = null,
  panel = null,
} = {}) {
  if (
    panel?.swarmContext?.isSwarmRole ||
    agentRun?.swarmRole ||
    agentRun?.launchOrigin === 'swarm-control-launch' ||
    agentRun?.roleKey
  ) {
    return 'swarm';
  }
  // A bound opencode id beats the bare launch-wrapper signal: zed/bash wrappers
  // with a known session id still restore through the opencode resume command.
  if (agentRun?.opencodeSessionId || extractOpenCodeSessionId(initialCommand)) {
    return 'opencode';
  }
  if (isSwarmLaunchWrapperCommand(initialCommand)) {
    return 'swarm';
  }
  const providerKind = mapAgentTypeToRestoreKind(detectAgentTypeFromCommand(initialCommand));
  if (providerKind) {
    return providerKind;
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

  const prefs = preferences || readTerminalRestorePreferences(null);

  const globalPolicy = prefs[sessionKind] ?? prefs.generic ?? RESTORE_POLICY.AUTO;
  return normalizeRestorePolicyValue(globalPolicy);
}

export function readWorkspaceRestorePreferences(storage) {
  return readTerminalRestorePreferences(storage);
}

/**
 * Read the newest agent run linked to a panel from localStorage.
 */
export function readAgentRunForPanel(storage, panelId) {
  if (!storage || typeof storage.getItem !== 'function' || !panelId) return null;

  try {
    const rawRuns = JSON.parse(storage.getItem('devhub_agent_runs') || '{}');
    let match = null;

    Object.values(rawRuns || {}).forEach((run) => {
      if (run?.panelId !== panelId) return;
      const nextTimestamp = Number(run?.launchedAt) || 0;
      const previousTimestamp = Number(match?.launchedAt) || 0;
      if (!match || nextTimestamp >= previousTimestamp) {
        match = run;
      }
    });

    return match;
  } catch {
    return null;
  }
}

/**
 * Ensures durable provider panels persist their resume command for reboot-safe
 * resume. Upgrades plain launch commands, pre-assign forms (`grok --session-id`,
 * `qodercli --session-id`), and Zed/bash launch wrappers once a session id is
 * known — never keep re-sending the original one-shot command on restore.
 */
export function normalizeProviderPanelCommand(panel, agentRun = null) {
  if (!panel?.id) return panel;

  const provider = resolveProviderKindForPanel({
    initialCommand: panel.initialCommand,
    agentRun,
  });
  if (!provider) return panel;

  const sessionId = resolveAgentSessionIdForPanel({
    provider,
    initialCommand: panel.initialCommand,
    agentRun,
  });
  if (!sessionId) return panel;

  const expectedCommand = buildProviderResumeCommand(provider, sessionId);
  if (!expectedCommand) return panel;

  const current = String(panel.initialCommand || '')
    .replace(/\s*#recovery-\d+\s*$/i, '')
    .trim();

  if (current === expectedCommand) return panel;

  return { ...panel, initialCommand: expectedCommand };
}

/** @alias Kept for existing imports — now provider-aware. */
export function normalizeOpenCodePanelCommand(panel, agentRun = null) {
  return normalizeProviderPanelCommand(panel, agentRun);
}

/**
 * Resolve the command that should be injected into a PTY after reconnect.
 * When a session id is known, emits the provider's resume form; never re-emits
 * one-shot pre-assign forms (`grok --session-id`, `qodercli --session-id`),
 * materialized swarm launch wrappers, or other one-shot launchers on restore.
 */
export function resolveTerminalInjectCommand(initialCommand, agentRun = null) {
  const stripped = String(initialCommand || '')
    .replace(/\s*#recovery-\d+\s*$/i, '')
    .trim();
  if (!stripped) return null;

  const provider = resolveProviderKindForPanel({ initialCommand: stripped, agentRun });
  if (provider) {
    const sessionId = resolveAgentSessionIdForPanel({
      provider,
      initialCommand: stripped,
      agentRun,
    });
    if (sessionId) {
      return buildProviderResumeCommand(provider, sessionId);
    }
  }

  // One-shot materialized wrappers must not be re-injected after sidecar/dev-server restart.
  if (isSwarmLaunchWrapperCommand(stripped)) {
    return null;
  }

  return stripped;
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
  const fromRun =
    typeof agentRun?.opencodeSessionId === 'string' ? agentRun.opencodeSessionId.trim() : '';
  if (fromRun) return fromRun;

  const fromCommand = extractOpenCodeSessionId(panel?.initialCommand);
  if (fromCommand) return fromCommand;

  const panelId = typeof panel?.id === 'string' ? panel.id.trim() : '';
  const hint = typeof hintSessionId === 'string' ? hintSessionId.trim() : '';
  if (hint && hint !== panelId) return hint;

  return null;
}
