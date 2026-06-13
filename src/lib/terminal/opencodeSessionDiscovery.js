import { openCodeResumableSessionAdapter } from '@/lib/agentSessions/resumableSessionAdapters';
import {
  extractOpenCodeSessionId,
  inferPanelSessionKind,
  isOpenCodePanel,
  normalizeWorkspacesOpenCodeCommands,
} from './restorePolicyResolver';

export function buildOpenCodeCatalogIndex(catalogSessions = []) {
  const bySessionId = new Map();
  const byActivePanelId = new Map();
  const byCwd = new Map();

  for (const session of catalogSessions) {
    const sessionId = String(session?.sessionId || '').trim();
    if (!sessionId) continue;

    bySessionId.set(sessionId, session);

    const activePanelId = String(session?.activePanelId || '').trim();
    if (activePanelId) {
      byActivePanelId.set(activePanelId, session);
    }

    const sessionCwd = String(session?.cwd || '').trim();
    if (sessionCwd) {
      const bucket = byCwd.get(sessionCwd) || [];
      bucket.push(session);
      byCwd.set(sessionCwd, bucket);
    }
  }

  return { bySessionId, byActivePanelId, byCwd };
}

/**
 * Resolves an OpenCode session id for a panel using CLI catalog data (OpenChamber-style),
 * without requiring `opencode --session` in initialCommand.
 */
export function resolvePanelOpenCodeSessionFromCatalog({
  panel = null,
  agentRun = null,
  catalogIndex = null,
  claimedSessionIds = new Set(),
} = {}) {
  const fromCommand = extractOpenCodeSessionId(panel?.initialCommand);
  if (fromCommand) {
    return { sessionId: fromCommand, source: 'command' };
  }

  const fromRun =
    typeof agentRun?.opencodeSessionId === 'string' ? agentRun.opencodeSessionId.trim() : '';
  if (fromRun) {
    return { sessionId: fromRun, source: 'agent-run' };
  }

  if (!catalogIndex) return null;

  const panelId = typeof panel?.id === 'string' ? panel.id.trim() : '';
  if (panelId) {
    const byActive = catalogIndex.byActivePanelId.get(panelId);
    if (byActive?.sessionId && !claimedSessionIds.has(byActive.sessionId)) {
      return { sessionId: byActive.sessionId, source: 'catalog-active-panel' };
    }
  }

  const panelCwd = typeof panel?.cwd === 'string' ? panel.cwd.trim() : '';
  if (panelCwd) {
    const candidates = (catalogIndex.byCwd.get(panelCwd) || []).filter(
      (session) => session?.sessionId && !claimedSessionIds.has(session.sessionId)
    );
    if (candidates.length === 1) {
      return { sessionId: candidates[0].sessionId, source: 'catalog-cwd-unique' };
    }
  }

  return null;
}

export function enrichOpenCodeRestoreContext({
  workspaces = [],
  agentRunsByPanel = {},
  catalogSessions = [],
} = {}) {
  const catalogIndex = buildOpenCodeCatalogIndex(catalogSessions);
  const claimedSessionIds = new Set();
  const discoveries = [];

  const enrichedRunsByPanel = { ...agentRunsByPanel };

  const enrichedWorkspaces = (workspaces || []).map((workspace) => ({
    ...workspace,
    columns: (workspace?.columns || []).map((column) => ({
      ...column,
      panels: (column?.panels || []).map((panel) => {
        const agentRun = enrichedRunsByPanel[panel.id] || null;
        if (!isOpenCodePanel(panel, agentRun)) return panel;

        const resolved = resolvePanelOpenCodeSessionFromCatalog({
          panel,
          agentRun,
          catalogIndex,
          claimedSessionIds,
        });

        if (!resolved?.sessionId) return panel;

        claimedSessionIds.add(resolved.sessionId);

        if (resolved.source !== 'command' && resolved.source !== 'agent-run') {
          discoveries.push({
            panelId: panel.id,
            sessionId: resolved.sessionId,
            source: resolved.source,
            cwd: panel?.cwd || null,
          });
        }

        const catalogSession = catalogIndex.bySessionId.get(resolved.sessionId);
        const nextRun = {
          ...(agentRun || {}),
          panelId: panel.id,
          opencodeSessionId: resolved.sessionId,
          selectedAgent: agentRun?.selectedAgent || 'opencode',
          launchedAt: agentRun?.launchedAt || Date.now(),
        };
        enrichedRunsByPanel[panel.id] = nextRun;

        const expectedCommand = `opencode --session ${resolved.sessionId}`;
        const current = String(panel.initialCommand || '').trim();
        if (current === expectedCommand) return panel;

        return {
          ...panel,
          initialCommand: expectedCommand,
          opencodeSessionTitle: catalogSession?.title || panel.opencodeSessionTitle || null,
        };
      }),
    })),
  }));

  const normalizedWorkspaces = normalizeWorkspacesOpenCodeCommands(
    enrichedWorkspaces,
    enrichedRunsByPanel
  );

  return {
    workspaces: normalizedWorkspaces,
    agentRunsByPanel: enrichedRunsByPanel,
    discoveries,
    hasDiscoveries: discoveries.length > 0,
  };
}

export function mergeDiscoveryIntoAgentRunsRecord(agentRunsRecord = {}, discoveries = []) {
  if (!discoveries.length) return agentRunsRecord;

  const next = { ...agentRunsRecord };

  discoveries.forEach(({ panelId, sessionId, cwd = null }) => {
    if (!panelId || !sessionId) return;

    const existingKey = Object.keys(next).find((key) => next[key]?.panelId === panelId);
    if (existingKey) {
      next[existingKey] = {
        ...next[existingKey],
        opencodeSessionId: sessionId,
        selectedAgent: next[existingKey]?.selectedAgent || 'opencode',
      };
      return;
    }

    const key = `oc-discovered-${sessionId}`;
    next[key] = {
      panelId,
      opencodeSessionId: sessionId,
      selectedAgent: 'opencode',
      launchOrigin: 'discovered-session',
      launchedAt: Date.now(),
      cwd,
    };
  });

  return next;
}

export function patchTerminalStateWithDiscoveredCommands(storage, storageKey, workspaces = []) {
  if (!storage || typeof storage.getItem !== 'function') return false;

  const keysToTry = [
    storageKey,
    storageKey !== 'devhub_terminal_state' ? 'devhub_terminal_state' : null,
  ].filter(Boolean);

  try {
    const resolvedKey = keysToTry.find((key) => storage.getItem(key));
    if (!resolvedKey) return false;

    const raw = storage.getItem(resolvedKey);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.workspaces)) return false;

    const panelCommands = new Map();
    workspaces.forEach((workspace) => {
      (workspace?.columns || []).forEach((column) => {
        (column?.panels || []).forEach((panel) => {
          if (!panel?.id) return;
          const command = String(panel.initialCommand || '').trim();
          if (command) panelCommands.set(panel.id, command);
        });
      });
    });

    if (panelCommands.size === 0) return false;

    let changed = false;
    parsed.workspaces = parsed.workspaces.map((workspace) => ({
      ...workspace,
      columns: (workspace?.columns || []).map((column) => ({
        ...column,
        panels: (column?.panels || []).map((panel) => {
          const nextCommand = panelCommands.get(panel.id);
          if (!nextCommand || panel.initialCommand === nextCommand) return panel;
          changed = true;
          return { ...panel, initialCommand: nextCommand };
        }),
      })),
    }));

    if (changed) {
      storage.setItem(resolvedKey, JSON.stringify(parsed));
    }

    return changed;
  } catch {
    return false;
  }
}

export async function fetchOpenCodeSessionCatalog({ cwd = null, fetchImpl = fetch } = {}) {
  try {
    const result = await openCodeResumableSessionAdapter.listSessions({ cwd, fetchImpl });
    return {
      status: result?.status || 'empty',
      sessions: Array.isArray(result?.sessions) ? result.sessions : [],
      error: result?.error || null,
    };
  } catch (error) {
    return {
      status: 'error',
      sessions: [],
      error: {
        code: 'catalog-failed',
        message: error?.message || 'OpenCode sessions could not be loaded.',
        retryable: true,
      },
    };
  }
}

export function collectOpenCodePanelsNeedingDiscovery(workspaces = [], agentRunsByPanel = {}) {
  const pending = [];

  (workspaces || []).forEach((workspace) => {
    (workspace?.columns || []).forEach((column) => {
      (column?.panels || []).forEach((panel) => {
        const agentRun = agentRunsByPanel?.[panel.id] || null;
        const kind = inferPanelSessionKind({
          initialCommand: panel?.initialCommand,
          agentRun,
        });
        if (kind !== 'opencode') return;

        const hasSession =
          extractOpenCodeSessionId(panel?.initialCommand) ||
          (typeof agentRun?.opencodeSessionId === 'string' && agentRun.opencodeSessionId.trim());

        if (!hasSession) {
          pending.push(panel.id);
        }
      });
    });
  });

  return pending;
}