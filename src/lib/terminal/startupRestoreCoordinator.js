import { normalizeRestoreManifest } from './restoreManifest';
import {
  buildProviderResumeCommand,
  buildSwarmTmuxSessionName,
  extractOpenCodeSessionId,
  getProviderContinueCommand,
  inferPanelSessionKind,
  isAgentProviderKind,
  resolveAgentSessionIdForPanel,
  resolveEffectiveRestorePolicy,
  resolveProviderKindForPanel,
} from './restorePolicyResolver';
import { buildOpencodeResumeCommand } from './opencodeSessionRegistry.js';

export const RESTORE_ACTION = Object.freeze({
  RESTORE_READY: 'restore-ready',
  REATTACH_LIVE_TERMINAL: 'reattach-live-terminal',
  RESUME_AGENT_SESSION: 'resume-agent-session',
  // Legacy opencode-only resume action — kept for backwards compatibility;
  // opencode panels keep emitting it while other providers use RESUME_AGENT_SESSION.
  RESUME_OPENCODE_SESSION: 'resume-opencode-session',
  RESTORE_SHELL_EMERGENT: 'restore-shell-emergent',
  PROCESS_ORPHAN: 'process-orphan',
  METADATA_STALE: 'metadata-stale',
  QUOTA_BLOCKED: 'quota-blocked',
  TERMINATED: 'terminated',
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function actionKey(entry = {}) {
  return [
    entry.action,
    entry.terminalId || '',
    entry.panelId || '',
    entry.opencodeSessionId || '',
    entry.provider || '',
    entry.agentSessionId || '',
  ].join(':');
}

function createAction({
  action,
  terminalId = null,
  panelId = null,
  workspaceId = null,
  opencodeSessionId = null,
  provider = null,
  agentSessionId = null,
  sessionKind = null,
  reason = null,
} = {}) {
  return {
    action,
    terminalId,
    panelId,
    workspaceId,
    opencodeSessionId,
    provider,
    agentSessionId,
    sessionKind,
    reason,
  };
}

function indexByKey(records = [], keyName) {
  return new Map(
    asArray(records)
      .filter((record) => record && record[keyName])
      .map((record) => [record[keyName], record])
  );
}

function collectWorkspacePanels(workspaces = []) {
  return asArray(workspaces).flatMap((workspace) =>
    asArray(workspace?.columns).flatMap((column) =>
      asArray(column?.panels).map((panel) => ({ workspace, panel }))
    )
  );
}

export function collectWorkspacePanelIds(workspaces = []) {
  return collectWorkspacePanels(workspaces)
    .map(({ panel }) => panel?.id)
    .filter(Boolean);
}

function isTuiLaunchCommand(initialCommand) {
  const command = String(initialCommand || '')
    .replace(/\s*#recovery-\d+\s*$/i, '')
    .trim();
  return /^(opencode|hermes|grok|groc|kimi|codex|qodercli)\b/i.test(command);
}

/** Shell-ephemeral respawn only — never relaunch live TUI sessions (opencode/grok/hermes). */
export function isShellEphemeralRestoreCandidate(session = {}) {
  const sessionKind = session.sessionKind || null;
  if (sessionKind === 'swarm' || isAgentProviderKind(sessionKind)) return false;
  if (session.opencodeSessionId) return false;
  if (isTuiLaunchCommand(session.initialCommand)) return false;
  return true;
}

export function buildRestoreManifestFromWorkspaceState({
  workspaces = [],
  activeWorkspaceId = null,
  projectId = null,
  appSessionId = null,
  agentRunsByPanel = {},
  restorePreferences = null,
} = {}) {
  const panelEntries = collectWorkspacePanels(workspaces);

  const terminalSessions = panelEntries
    .map(({ workspace, panel }) => {
      if (!panel?.id) return null;

      const initialCommand = String(panel.initialCommand || '').trim();
      const agentRun = panel?.id ? agentRunsByPanel?.[panel.id] || null : null;
      const sessionKind = inferPanelSessionKind({ initialCommand, agentRun, panel });
      const opencodeSessionId =
        agentRun?.opencodeSessionId || extractOpenCodeSessionId(initialCommand) || null;
      const roleKey =
        panel?.swarmContext?.roleKey || agentRun?.swarmRole || agentRun?.roleKey || null;

      const agentType = isAgentProviderKind(sessionKind)
        ? resolveProviderKindForPanel({ initialCommand, agentRun }) || sessionKind
        : null;
      const agentSessionId =
        agentType === 'opencode'
          ? opencodeSessionId
          : agentType
            ? resolveAgentSessionIdForPanel({ provider: agentType, initialCommand, agentRun })
            : null;

      // Fallback chain: a bound session id pins the provider resume form; otherwise
      // keep the raw initialCommand so the runner can fall back to the provider's
      // continue command (`kimi --continue`, `codex resume --last`, …).
      let durableInitialCommand;
      if (opencodeSessionId && !extractOpenCodeSessionId(initialCommand)) {
        durableInitialCommand = buildOpencodeResumeCommand({ opencodeSessionId, initialCommand });
      } else if (agentType && agentType !== 'opencode' && agentSessionId) {
        // Bound id → pin the provider resume form. One-shot pre-assign forms
        // (`grok --session-id`, `qodercli --session-id`) are upgraded here too.
        const resumeCommand = buildProviderResumeCommand(agentType, agentSessionId);
        const strippedCommand = String(initialCommand || '')
          .replace(/\s*#recovery-\d+\s*$/i, '')
          .trim();
        durableInitialCommand =
          resumeCommand && strippedCommand !== resumeCommand
            ? resumeCommand
            : initialCommand || null;
      } else {
        durableInitialCommand = initialCommand || null;
      }

      return {
        terminalId: panel.id,
        panelId: panel.id,
        workspaceId: workspace?.id || null,
        cwd: panel?.cwd || null,
        initialCommand: durableInitialCommand,
        sessionKind,
        sessionType: opencodeSessionId ? 'opencode-durable' : null,
        skipBackendRestore: Boolean(opencodeSessionId),
        durableRestore: Boolean(opencodeSessionId),
        roleKey,
        opencodeSessionId,
        agentType,
        agentSessionId,
        restorePolicy: resolveEffectiveRestorePolicy({
          sessionKind,
          perSessionPolicy: agentRun?.restorePolicy || null,
          preferences: restorePreferences,
        }),
        runId: agentRun?.runId || null,
        launchId: agentRun?.launchId || null,
        missionId: agentRun?.missionId || null,
      };
    })
    .filter(Boolean);

  const swarmRuns = Object.values(agentRunsByPanel || {})
    .map((run) => {
      const runId = typeof run?.runId === 'string' && run.runId.trim() ? run.runId.trim() : null;
      if (!runId) return null;

      return {
        runId,
        launchId:
          typeof run?.launchId === 'string' && run.launchId.trim() ? run.launchId.trim() : null,
        missionId:
          typeof run?.missionId === 'string' && run.missionId.trim() ? run.missionId.trim() : null,
        agentId: typeof run?.agentId === 'string' && run.agentId.trim() ? run.agentId.trim() : null,
        role:
          typeof run?.swarmRole === 'string' && run.swarmRole.trim() ? run.swarmRole.trim() : null,
        panelId: typeof run?.panelId === 'string' && run.panelId.trim() ? run.panelId.trim() : null,
        terminalId:
          typeof run?.panelId === 'string' && run.panelId.trim() ? run.panelId.trim() : null,
        pid: Number.isFinite(run?.pid) ? Number(run.pid) : null,
        status:
          typeof run?.status === 'string' && run.status.trim() ? run.status.trim() : 'unknown',
        updatedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  return normalizeRestoreManifest({
    appSessionId,
    activeProjectId: projectId,
    activeWorkspaceId: activeWorkspaceId,
    workspaces: asArray(workspaces).map((workspace) => ({
      workspaceId: workspace?.id || null,
      name: workspace?.name || null,
      tabs: [],
      layout: { columns: asArray(workspace?.columns).length },
      activePanelId: null,
    })),
    terminalSessions,
    swarmRuns,
  });
}

export function buildStartupRestorePlan({ manifest = null, runtimeSnapshot = null } = {}) {
  const normalizedManifest = normalizeRestoreManifest(manifest);
  const terminals = asArray(runtimeSnapshot?.terminals);
  const processes = asArray(runtimeSnapshot?.processes);
  const anomalies = runtimeSnapshot?.anomalies || {};
  const tmuxSessionNames = asArray(runtimeSnapshot?.tmuxSessions)
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter(Boolean);

  const terminalById = indexByKey(terminals, 'terminalId');
  const processBySessionId = indexByKey(processes, 'sessionId');
  const dedupe = new Set();
  const actions = [];

  normalizedManifest.terminalSessions.forEach((session) => {
    const runtimeTerminal = terminalById.get(session.terminalId);
    const runtimeProcess = session.opencodeSessionId
      ? processBySessionId.get(session.opencodeSessionId)
      : null;

    let nextAction = null;
    const sessionKind = session.sessionKind || null;

    if (anomalies.quotaBlocked) {
      nextAction = createAction({
        action: RESTORE_ACTION.QUOTA_BLOCKED,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        sessionKind,
        reason: 'runtime-quota-blocked',
      });
    } else if (runtimeTerminal?.alive && Number(runtimeTerminal.socketCount || 0) === 0) {
      nextAction = createAction({
        action: RESTORE_ACTION.REATTACH_LIVE_TERMINAL,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'alive-without-sockets',
      });
    } else if (runtimeProcess && !runtimeTerminal) {
      nextAction = createAction({
        action: RESTORE_ACTION.PROCESS_ORPHAN,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'process-without-terminal',
      });
    } else if (!runtimeTerminal && session.opencodeSessionId) {
      nextAction = createAction({
        action: RESTORE_ACTION.RESUME_OPENCODE_SESSION,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'session-resume-needed',
      });
    } else if (
      !runtimeTerminal &&
      sessionKind !== 'opencode' &&
      isAgentProviderKind(sessionKind) &&
      (session.agentSessionId || getProviderContinueCommand(session.agentType || sessionKind))
    ) {
      // Provider TUI panels (kimi/grok/codex/qoder): resume by bound id when
      // known, otherwise fall back to the provider's continue command.
      nextAction = createAction({
        action: RESTORE_ACTION.RESUME_AGENT_SESSION,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        provider: session.agentType || sessionKind,
        agentSessionId: session.agentSessionId || null,
        sessionKind,
        reason: session.agentSessionId
          ? 'agent-session-resume-needed'
          : 'agent-session-continue-fallback',
      });
    } else if (session.sessionKind === 'swarm') {
      // Swarm panels reattach to an existing tmux session on WebSocket connect
      // (ttyServer). After a full reboot the tmux session is gone — only emit
      // the reattach when the runtime snapshot proves it is still alive;
      // otherwise fall through to the normal terminated/policy-gated path.
      const tmuxSessionName = buildSwarmTmuxSessionName(session.launchId, session.roleKey);
      if (tmuxSessionName && tmuxSessionNames.includes(tmuxSessionName)) {
        nextAction = createAction({
          action: RESTORE_ACTION.REATTACH_LIVE_TERMINAL,
          terminalId: session.terminalId,
          panelId: session.panelId,
          workspaceId: session.workspaceId,
          opencodeSessionId: session.opencodeSessionId,
          sessionKind,
          reason: 'swarm-tmux-reattach',
        });
      } else {
        nextAction = createAction({
          action: RESTORE_ACTION.TERMINATED,
          terminalId: session.terminalId,
          panelId: session.panelId,
          workspaceId: session.workspaceId,
          opencodeSessionId: session.opencodeSessionId,
          sessionKind,
          reason: 'swarm-tmux-missing',
        });
      }
    } else if (!runtimeTerminal && session.cwd && isShellEphemeralRestoreCandidate(session)) {
      // shell-ephemeral: no ptyPid, no opencode session — needs respawn via cwd/shell
      nextAction = createAction({
        action: RESTORE_ACTION.RESTORE_SHELL_EMERGENT,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: null,
        sessionKind,
        reason: 'shell-emergent-needs-respawn',
      });
    } else if (runtimeTerminal?.alive) {
      nextAction = createAction({
        action: RESTORE_ACTION.RESTORE_READY,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'terminal-already-live',
      });
    } else {
      nextAction = createAction({
        action: RESTORE_ACTION.TERMINATED,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'no-runtime-evidence',
      });
    }

    // Policy gating (per-session + workspace defaults applied in manifest build)
    const policy = session.restorePolicy;
    const isManual = policy === 'manual';
    const isOff = policy === 'off';

    // If 'off', do not emit any action — session stays in sessionStore but is not dispatched
    if (isOff) return;

    // If 'manual', emit TERMINATED action instead of the computed nextAction
    if (isManual) {
      nextAction = createAction({
        action: RESTORE_ACTION.TERMINATED,
        terminalId: session.terminalId,
        panelId: session.panelId,
        workspaceId: session.workspaceId,
        opencodeSessionId: session.opencodeSessionId,
        reason: 'restore-policy-manual',
      });
    }

    const key = actionKey(nextAction);
    if (dedupe.has(key)) return;
    dedupe.add(key);
    actions.push(nextAction);
  });

  return {
    generatedAt: new Date().toISOString(),
    actions,
  };
}
