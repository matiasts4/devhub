import { buildRestoreManifestFromWorkspaceState } from './startupRestoreCoordinator';
import {
  extractOpenCodeSessionId,
  normalizeWorkspacesOpenCodeCommands,
} from './restorePolicyResolver';
import { readTerminalRestorePreferences } from './restorePreferences';
import { detectAgentTypeFromCommand, extractAgentSessionId } from './agentTuiMetadata';
import { logRestoreDiagnostic, truncateForDiagnostics } from './restoreDiagnostics';

/**
 * Canonical resume command per provider for persisted panel state. opencode
 * keeps its own flow (restorePolicyResolver); grok/qodercli launch commands
 * carry pre-assigned ids (`--session-id`) that must be persisted in resume
 * form because the pre-assign form fails for already-existing ids.
 */
const AGENT_RESUME_COMMAND_BUILDERS = {
  kimi: (sessionId) => `kimi --session ${sessionId}`,
  grok: (sessionId) => `grok --resume ${sessionId}`,
  codex: (sessionId) => `codex resume ${sessionId}`,
  qodercli: (sessionId) => `qodercli --resume ${sessionId}`,
};

/** Normalizes event-name aliases ('qoder') to metadata types ('qodercli'). */
function normalizeProviderKey(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase();
  if (key === 'qoder') return 'qodercli';
  return key;
}

/**
 * Builds the provider resume command for a known session id, or null when the
 * provider has no durable resume form.
 */
export function buildAgentProviderResumeCommand(agentType, sessionId) {
  const key = normalizeProviderKey(agentType);
  const id = String(sessionId || '').trim();
  if (!key || !id) return null;
  const build = AGENT_RESUME_COMMAND_BUILDERS[key];
  return build ? build(id) : null;
}

function stripRecoveryTag(command) {
  return String(command || '')
    .replace(/\s*#recovery-\d+\s*$/i, '')
    .trim();
}

/**
 * Reads the bound agent session id for a panel's provider from its agent run.
 * Returns null when the run carries no id or belongs to another provider.
 */
function resolveAgentRunSessionId(agentType, agentRun) {
  if (!agentRun) return null;
  const runType = normalizeProviderKey(agentRun.agentType || agentRun.selectedAgent);
  if (runType !== agentType) return null;
  const id = typeof agentRun.agentSessionId === 'string' ? agentRun.agentSessionId.trim() : '';
  return id || null;
}

function normalizeAgentPanelCommand(panel, agentRun) {
  const current = stripRecoveryTag(panel?.initialCommand);

  // Provider comes from the launch command; an empty command may still belong
  // to a bound run (typed launch inside a shell panel). A non-empty,
  // non-agent command is never rewritten, even if a run claims the panel.
  const detectedType = current ? detectAgentTypeFromCommand(current) : null;
  const agentType = detectedType || (!current ? normalizeProviderKey(agentRun?.agentType) : null);
  if (!agentType || agentType === 'opencode') return panel; // opencode keeps its own flow
  if (!AGENT_RESUME_COMMAND_BUILDERS[agentType]) return panel;

  const sessionId =
    resolveAgentRunSessionId(agentType, agentRun) ||
    (current ? extractAgentSessionId(agentType, current) : null);
  if (!sessionId) return panel;

  const expectedCommand = buildAgentProviderResumeCommand(agentType, sessionId);
  if (!expectedCommand) return panel;
  // Exact match only: a trailing #recovery tag must not survive into persisted
  // state (same convention as the opencode/provider resolver normalization).
  if (panel.initialCommand === expectedCommand) return panel;

  return { ...panel, initialCommand: expectedCommand };
}

/**
 * Generalizes the opencode-only flush normalization: any panel whose agent run
 * carries a known session id (or whose command already embeds one) gets its
 * initialCommand persisted in the provider's resume form. Idempotent — panels
 * already in resume form are returned unchanged.
 */
export function normalizeWorkspacesAgentCommands(workspaces = [], agentRunsByPanel = {}) {
  if (!Array.isArray(workspaces)) return [];

  return workspaces.map((workspace) => ({
    ...workspace,
    columns: (workspace?.columns || []).map((column) => ({
      ...column,
      panels: (column?.panels || []).map((panel) =>
        normalizeAgentPanelCommand(panel, agentRunsByPanel?.[panel?.id] || null)
      ),
    })),
  }));
}

export function resolveTerminalStorageKeys(projectId = null) {
  return {
    terminalStateKey: projectId ? `devhub_terminal_state:${projectId}` : 'devhub_terminal_state',
    restoreManifestKey: projectId
      ? `devhub_restore_manifest:${projectId}`
      : 'devhub_restore_manifest',
    legacyTerminalStateKey: 'devhub_terminal_state',
  };
}

export function buildCleanTerminalStatePayload({
  workspaces = [],
  activeWsId = null,
  activePanelIds = {},
  workspaceWindows = {},
  activeWindowIds = {},
} = {}) {
  const cleanWorkspaces = (workspaces || []).map((ws) => ({
    ...ws,
    columns: (ws?.columns || []).map((col) => ({
      ...col,
      panels: (col?.panels || []).map((panel) => ({
        id: panel.id,
        cwd: panel?.cwd || null,
        initialCommand: panel?.initialCommand || null,
      })),
    })),
  }));

  return {
    workspaces: cleanWorkspaces,
    activeWsId,
    activePanelIds,
    workspaceWindows,
    activeWindowIds,
  };
}

function readAgentRunsRecord(storage) {
  if (!storage || typeof storage.getItem !== 'function') return {};

  try {
    return JSON.parse(storage.getItem('devhub_agent_runs') || '{}');
  } catch {
    return {};
  }
}

function indexAgentRunsByPanel(runs = {}) {
  const indexed = {};

  Object.entries(runs || {}).forEach(([taskId, run]) => {
    const panelId = typeof run?.panelId === 'string' ? run.panelId.trim() : '';
    if (!panelId) return;

    const previous = indexed[panelId];
    const nextTimestamp = Number(run?.launchedAt) || 0;
    const previousTimestamp = Number(previous?.launchedAt) || 0;

    if (!previous || nextTimestamp >= previousTimestamp) {
      indexed[panelId] = { taskId, ...run };
    }
  });

  return indexed;
}

/**
 * Copies session ids from panels into devhub_agent_runs so reboot restore
 * does not depend on a pending React state flush. opencode keeps its legacy
 * `opencodeSessionId` field; other providers store `agentSessionId` +
 * `agentType` alongside it.
 */
export function syncAgentRunsFromWorkspacePanels(
  storage,
  workspaces = [],
  { agentRuns = null } = {}
) {
  if (!storage || typeof storage.setItem !== 'function') return false;

  const runs = agentRuns || readAgentRunsRecord(storage);
  let changed = false;

  (workspaces || []).forEach((workspace) => {
    (workspace?.columns || []).forEach((column) => {
      (column?.panels || []).forEach((panel) => {
        const panelId = panel?.id;
        if (!panelId) return;

        const indexedRun = indexAgentRunsByPanel(runs)[panelId] || null;
        const command = stripRecoveryTag(panel?.initialCommand);
        const agentType = detectAgentTypeFromCommand(command);

        const opencodeSessionId =
          extractOpenCodeSessionId(panel?.initialCommand) || indexedRun?.opencodeSessionId || null;

        const providerSessionId =
          agentType && agentType !== 'opencode'
            ? resolveAgentRunSessionId(agentType, indexedRun) ||
              extractAgentSessionId(agentType, command)
            : null;

        if (!opencodeSessionId && !providerSessionId) return;

        Object.entries(runs).forEach(([taskId, run]) => {
          if (run?.panelId !== panelId) return;

          let nextRun = run;
          if (opencodeSessionId && run?.opencodeSessionId !== opencodeSessionId) {
            nextRun = { ...nextRun, opencodeSessionId };
          }
          if (
            providerSessionId &&
            (run?.agentSessionId !== providerSessionId || run?.agentType !== agentType)
          ) {
            nextRun = { ...nextRun, agentSessionId: providerSessionId, agentType };
          }

          if (nextRun !== run) {
            runs[taskId] = nextRun;
            changed = true;
          }
        });
      });
    });
  });

  if (!changed) return false;

  try {
    storage.setItem('devhub_agent_runs', JSON.stringify(runs));
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronous persistence for abrupt app/OS shutdown (beforeunload / pagehide).
 */
export function flushTerminalSessionPersistence(
  storage,
  {
    workspaces = [],
    activeWsId = null,
    activePanelIds = {},
    workspaceWindows = {},
    activeWindowIds = {},
    projectId = null,
    appSessionId = null,
    agentRunsByPanel = null,
  } = {}
) {
  if (!storage || typeof storage.setItem !== 'function') return false;

  // Snapshot pre-normalization commands so the flush diagnostic can report
  // exactly which panels had their command rewritten to resume form.
  const originalCommandsByPanel = new Map();
  (workspaces || []).forEach((workspace) => {
    (workspace?.columns || []).forEach((column) => {
      (column?.panels || []).forEach((panel) => {
        if (panel?.id) originalCommandsByPanel.set(panel.id, panel?.initialCommand || null);
      });
    });
  });

  const keys = resolveTerminalStorageKeys(projectId);
  const runsRecord = readAgentRunsRecord(storage);
  const indexedRuns =
    agentRunsByPanel && typeof agentRunsByPanel === 'object'
      ? agentRunsByPanel
      : indexAgentRunsByPanel(runsRecord);

  const normalizedWorkspaces = normalizeWorkspacesAgentCommands(
    normalizeWorkspacesOpenCodeCommands(workspaces, indexedRuns),
    indexedRuns
  );
  syncAgentRunsFromWorkspacePanels(storage, normalizedWorkspaces, { agentRuns: runsRecord });

  const refreshedRuns = readAgentRunsRecord(storage);
  const refreshedIndex = indexAgentRunsByPanel(refreshedRuns);
  const payload = buildCleanTerminalStatePayload({
    workspaces: normalizeWorkspacesAgentCommands(
      normalizeWorkspacesOpenCodeCommands(normalizedWorkspaces, refreshedIndex),
      refreshedIndex
    ),
    activeWsId,
    activePanelIds,
    workspaceWindows,
    activeWindowIds,
  });

  try {
    const serialized = JSON.stringify(payload);
    storage.setItem(keys.terminalStateKey, serialized);
    if (keys.terminalStateKey !== keys.legacyTerminalStateKey) {
      storage.setItem(keys.legacyTerminalStateKey, serialized);
    }

    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: payload.workspaces,
      activeWorkspaceId: activeWsId,
      projectId,
      appSessionId: appSessionId || `flush-${Date.now()}`,
      agentRunsByPanel: refreshedIndex,
      restorePreferences: readTerminalRestorePreferences(storage),
    });
    storage.setItem(keys.restoreManifestKey, JSON.stringify(manifest));

    const commandChanges = [];
    (payload.workspaces || []).forEach((workspace) => {
      (workspace?.columns || []).forEach((column) => {
        (column?.panels || []).forEach((panel) => {
          if (!panel?.id) return;
          const before = originalCommandsByPanel.has(panel.id)
            ? originalCommandsByPanel.get(panel.id)
            : null;
          const after = panel?.initialCommand || null;
          if (before === after) return;
          commandChanges.push({
            panelId: panel.id,
            provider: detectAgentTypeFromCommand(stripRecoveryTag(after)) || null,
            from: truncateForDiagnostics(before),
            to: truncateForDiagnostics(after),
          });
        });
      });
    });
    logRestoreDiagnostic('flush-terminal-persistence', {
      panelCount: originalCommandsByPanel.size,
      normalizedCount: commandChanges.length,
      changes: commandChanges,
    });

    return true;
  } catch {
    return false;
  }
}
