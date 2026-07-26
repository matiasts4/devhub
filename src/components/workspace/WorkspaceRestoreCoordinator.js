/**
 * WorkspaceRestoreCoordinator — startup restore async orchestration.
 * Extracted from TerminalWorkspacesManager.jsx.
 */

import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';
import {
  RESTORE_ACTION,
  buildRestoreManifestFromWorkspaceState,
  buildStartupRestorePlan,
} from '@/lib/terminal/startupRestoreCoordinator';
import {
  dispatchStartupRestoreQueue,
  runOpenCodeStartupRestoreMutex,
} from '@/lib/terminal/startupRestoreRunner';
import {
  collectOpenCodePanelsNeedingDiscovery,
  enrichOpenCodeRestoreContext,
  fetchOpenCodeSessionCatalog,
  mergeDiscoveryIntoAgentRunsRecord,
  patchTerminalStateWithDiscoveredCommands,
} from '@/lib/terminal/opencodeSessionDiscovery';
import {
  isOpenCodePanel,
  resolveEffectiveRestorePolicy,
} from '@/lib/terminal/restorePolicyResolver';

/**
 * @param {object} params
 * @returns {{ runStartupRestore: () => Promise<void>, abortStartupRestore: () => void }}
 */
export function createWorkspaceRestoreCoordinator({
  storage,
  terminalStateStorageKey,
  projectId,
  snapshotWorkspaces,
  activeWsIdRef,
  activeWsId,
  bootPanelIdsRef,
  restorePrefs,
  applyPanelRelaunchCommand,
  setWorkspaces,
  setPanelRestoreModes,
  setReopenActionError,
  markStartupRestoreCompleted,
}) {
  let cancelled = false;

  const abortStartupRestore = () => {
    cancelled = true;
  };

  const runStartupRestore = async () => {
    try {
      await runOpenCodeStartupRestoreMutex(storage, async () => {
        const runtimeResponse = await fetch('/api/swarm/runtime-diagnostics', {
          cache: 'no-store',
        });
        const runtimeSnapshot = runtimeResponse.ok ? await runtimeResponse.json() : null;

        if (cancelled) return;

        const latestAgentRuns = readAgentRunsByPanel(storage);
        let restoreWorkspaces = snapshotWorkspaces;
        let restoreAgentRuns = latestAgentRuns;

        const needsDiscovery = collectOpenCodePanelsNeedingDiscovery(
          restoreWorkspaces,
          latestAgentRuns
        );

        if (needsDiscovery.length > 0) {
          const catalog = await fetchOpenCodeSessionCatalog({ fetchImpl: fetch });
          if (!cancelled && catalog.sessions.length > 0) {
            const enriched = enrichOpenCodeRestoreContext({
              workspaces: restoreWorkspaces,
              agentRunsByPanel: latestAgentRuns,
              catalogSessions: catalog.sessions,
            });

            if (enriched.hasDiscoveries) {
              restoreWorkspaces = enriched.workspaces;
              restoreAgentRuns = enriched.agentRunsByPanel;

              try {
                const fullRuns = readAgentRuns(storage);
                const mergedRuns = mergeDiscoveryIntoAgentRunsRecord(
                  fullRuns,
                  enriched.discoveries
                );
                storage?.setItem('devhub_agent_runs', JSON.stringify(mergedRuns));
                patchTerminalStateWithDiscoveredCommands(
                  storage,
                  terminalStateStorageKey,
                  restoreWorkspaces
                );
                setWorkspaces((prev) => {
                  if (!Array.isArray(prev) || prev.length === 0) return restoreWorkspaces;
                  return restoreWorkspaces;
                });
              } catch {
                // Discovery persistence must not block restore.
              }
            }
          }
        }

        const manifest = buildRestoreManifestFromWorkspaceState({
          workspaces: restoreWorkspaces,
          activeWorkspaceId: activeWsIdRef.current || activeWsId,
          projectId,
          appSessionId: `startup-${Date.now()}`,
          agentRunsByPanel: restoreAgentRuns,
          restorePreferences: restorePrefs,
        });

        const plan = buildStartupRestorePlan({ manifest, runtimeSnapshot });

        logTerminalSession('startup-restore-plan', {
          actionCount: plan.actions.length,
          actions: plan.actions.map((action) => ({
            action: action.action,
            terminalId: action.terminalId,
            reason: action.reason,
            sessionKind: action.sessionKind,
          })),
        });

        if (plan.actions.some((action) => action.action === RESTORE_ACTION.QUOTA_BLOCKED)) {
          setReopenActionError(
            'OpenCode appears quota-blocked (429). Review runtime diagnostics before relaunching sessions.'
          );
        }

        const panelMap = new Map(
          restoreWorkspaces.flatMap((workspace) =>
            (workspace?.columns || []).flatMap((column) =>
              (column?.panels || []).map((panel) => [panel.id, panel])
            )
          )
        );

        const runtimeTerminalById = new Map(
          (runtimeSnapshot?.terminals || [])
            .filter((t) => t?.terminalId)
            .map((t) => [t.terminalId, t])
        );

        const restorePolicyByPanelId = new Map(
          (manifest.terminalSessions || [])
            .filter((s) => s?.terminalId)
            .map((s) => [s.terminalId, s.restorePolicy || 'auto'])
        );

        const queueResult = await dispatchStartupRestoreQueue({
          actions: plan.actions,
          activeWorkspaceId: activeWsIdRef.current || activeWsId,
          getPanel: (panelId) => panelMap.get(panelId),
          getRuntimeTerminal: (panelId) => runtimeTerminalById.get(panelId) || null,
          getRestorePolicy: (panelId) => restorePolicyByPanelId.get(panelId) || 'auto',
          shouldSkipAction: (action) => {
            const panelId = action?.terminalId;
            if (!panelId) return false;
            const bootIds = bootPanelIdsRef.current;
            if (bootIds.size === 0) {
              logTerminalSession('startup-restore-skip', {
                panelId,
                reason: 'no-boot-baseline',
                action: action.action,
              });
              return true;
            }
            if (bootIds.size > 0 && !bootIds.has(panelId)) {
              logTerminalSession('startup-restore-skip', {
                panelId,
                reason: 'panel-not-in-boot-baseline',
                action: action.action,
              });
              return true;
            }
            return false;
          },
          onRelaunch: async (action, panel, command) => {
            if (cancelled) return;
            logTerminalSession('startup-restore-relaunch', {
              panelId: action.terminalId,
              command,
              reason: action.reason,
              action: action.action,
            });
            applyPanelRelaunchCommand(action.terminalId, command, panel?.cwd || null, {
              bumpCommand: false,
              emitEvent: true,
            });
          },
          onPanelLive: (panelId) => {
            if (cancelled) return;
            const panel = panelMap.get(panelId);
            if (panel?.initialCommand && typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('devhub:panel-startup-reattach', {
                  detail: { panelId, initialCommand: panel.initialCommand },
                })
              );
            }
            setPanelRestoreModes((prev) => {
              const next = { ...prev };
              delete next[panelId];
              return next;
            });
          },
        });

        if (cancelled) return;

        setPanelRestoreModes((prev) => {
          const next = { ...prev };
          queueResult.manualPanelIds.forEach((panelId) => {
            next[panelId] = 'suspended';
          });
          manifest.terminalSessions.forEach((session) => {
            if (session.restorePolicy === 'off' && session.sessionKind === 'opencode') {
              next[session.terminalId] = 'suspended';
            }
          });
          queueResult.livePanelIds.forEach((panelId) => {
            delete next[panelId];
          });
          Object.keys(next).forEach((panelId) => {
            if (
              !queueResult.manualPanelIds.includes(panelId) &&
              !manifest.terminalSessions.some(
                (session) =>
                  session.terminalId === panelId &&
                  session.restorePolicy === 'off' &&
                  session.sessionKind === 'opencode'
              )
            ) {
              delete next[panelId];
            }
          });
          return next;
        });
      });
    } catch {
      // Startup restore must not block workspace boot.
    } finally {
      if (!cancelled) {
        markStartupRestoreCompleted();
      }
    }
  };

  return { runStartupRestore, abortStartupRestore };
}

function isTuiPanelForGenericPolicy(panel, _agentRun) {
  const cmd = String(panel?.initialCommand || '')
    .replace(/\s*#recovery-\d+\s*$/i, '')
    .trim();
  if (/^(grok|groc|kimi)\b/i.test(cmd)) return true;
  return false;
}

export function seedSuspendedPanelsByPolicy({
  snapshotWorkspaces,
  agentRunsByPanel,
  restorePrefs,
}) {
  const suspendedSeed = {};
  let hasGovernedPanels = false;

  snapshotWorkspaces.forEach((ws) => {
    ws.columns?.forEach((col) => {
      col.panels?.forEach((panel) => {
        const agentRun = agentRunsByPanel[panel.id];
        let sessionKind = 'generic';
        if (isOpenCodePanel(panel, agentRun)) {
          sessionKind = 'opencode';
          hasGovernedPanels = true;
        } else if (isTuiPanelForGenericPolicy(panel, agentRun)) {
          sessionKind = 'generic';
          hasGovernedPanels = true;
        } else {
          return;
        }

        const policy = resolveEffectiveRestorePolicy({
          sessionKind,
          perSessionPolicy: agentRun?.restorePolicy || null,
          preferences: restorePrefs,
        });

        if (policy === 'manual' || policy === 'off') {
          suspendedSeed[panel.id] = 'suspended';
        }
      });
    });
  });

  return { hasOpenCodePanels: hasGovernedPanels, suspendedSeed };
}

/** @deprecated name — use seedSuspendedPanelsByPolicy */
export function seedSuspendedOpenCodePanels(args) {
  return seedSuspendedPanelsByPolicy(args);
}

function readAgentRunsByPanel(storage) {
  if (!storage) return {};

  try {
    const rawRuns = JSON.parse(storage.getItem('devhub_agent_runs') || '{}');
    const indexedRuns = {};

    Object.values(rawRuns || {}).forEach((run) => {
      const panelId = typeof run?.panelId === 'string' ? run.panelId.trim() : '';
      if (!panelId) return;

      const previous = indexedRuns[panelId];
      const nextTimestamp = Number(run?.launchedAt) || 0;
      const previousTimestamp = Number(previous?.launchedAt) || 0;

      if (!previous || nextTimestamp >= previousTimestamp) {
        indexedRuns[panelId] = run;
      }
    });

    return indexedRuns;
  } catch {
    return {};
  }
}

function readAgentRuns(storage) {
  try {
    const raw = storage?.getItem('devhub_agent_runs');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
