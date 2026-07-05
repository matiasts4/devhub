import { useEffect } from 'react';
import { markSwarmLaunchWrapperDispatched } from '@/lib/terminal/swarmLaunchWrapperLifecycle';
import {
  readAgentRunsByPanel,
  readWorkspaceRestorePreferences,
} from '@/components/terminal/models/swarmRoleModel';
import {
  inferPanelSessionKind,
  resolveEffectiveRestorePolicy,
  resolveOpenCodeSessionIdForPanel,
  shouldPersistOpenCodeSessionForPanel,
} from '@/lib/terminal/restorePolicyResolver';
import { flushTerminalSessionPersistence } from '@/lib/terminal/terminalSessionFlush';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';

export default function useWorkspaceEventBridge({
  activeWsId,
  activeWsIdRef,
  activePanelIdsRef,
  activeWindowIdsRef,
  applyPanelRelaunchCommand,
  failPendingReopen,
  panelsClosingRef,
  pendingReopenPanelsRef,
  projectId,
  relaunchInFlightRef,
  setPanelRestoreModes,
  setReopenActionError,
  setTerminalSettingsModal,
  setWorkspaces,
  storage,
  terminalStateStorageKey,
  workspaceWindowsRef,
  workspacesRef,
}) {
  useEffect(() => {
    const handleOpenCodeSessionDetected = (e) => {
      const { panelId, sessionId } = e.detail || {};
      if (!panelId || !sessionId) return;
      if (panelsClosingRef.current.has(panelId)) return;

      const panelEntry = workspacesRef.current
        .flatMap((ws) => ws.columns || [])
        .flatMap((col) => col.panels || [])
        .find((entry) => entry.id === panelId);

      if (!panelEntry) return;

      const panelAgentRun = readAgentRunsByPanel(storage)[panelId] || null;
      if (!shouldPersistOpenCodeSessionForPanel(panelEntry, panelAgentRun)) return;

      let runMetadata = null;
      try {
        const runs = JSON.parse(localStorage.getItem('devhub_agent_runs') || '{}');
        const taskEntry = Object.entries(runs || {}).find(
          ([, value]) => value?.panelId === panelId
        );
        runMetadata = taskEntry?.[1] || null;

        if (taskEntry?.[0]) {
          const restorePrefs = readWorkspaceRestorePreferences(storage);
          const sessionKind = inferPanelSessionKind({
            initialCommand: `opencode --session ${sessionId}`,
            agentRun: runs[taskEntry[0]],
          });
          const defaultRestorePolicy = resolveEffectiveRestorePolicy({
            sessionKind,
            perSessionPolicy: null,
            preferences: restorePrefs,
          });
          runs[taskEntry[0]] = {
            ...runs[taskEntry[0]],
            opencodeSessionId: sessionId,
            restorePolicy: runs[taskEntry[0]]?.restorePolicy || defaultRestorePolicy,
          };
          localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
        }

        if (
          runMetadata?.launchOrigin === 'swarm-control-launch' &&
          runMetadata?.sessionId &&
          runMetadata?.workspaceId &&
          runMetadata?.runId
        ) {
          fetch(`/api/agenthub/sessions/${runMetadata.sessionId}/binding`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace_id: runMetadata.workspaceId,
              run_id: runMetadata.runId,
              opencode_session_id: sessionId,
            }),
          }).catch(() => {});
        }
      } catch {
        // Ignore best-effort canonical reconciliation failures in UI layer.
      }

      const pending = pendingReopenPanelsRef.current.get(panelId);
      if (pending) {
        if (pending.sessionId !== sessionId) {
          failPendingReopen(panelId);
          return;
        }

        pendingReopenPanelsRef.current.delete(panelId);
        setReopenActionError(null);
      }

      const priorPanel = panelEntry;
      const nextWorkspaces = workspacesRef.current.map((ws) => ({
        ...ws,
        columns: ws.columns.map((col) => ({
          ...col,
          panels: col.panels.map((p) => {
            if (p.id !== panelId) return p;
            const newCommand = `opencode --session ${sessionId}`;
            if (p.initialCommand === newCommand) return p;
            if (!shouldPersistOpenCodeSessionForPanel(p, panelAgentRun)) return p;
            return { ...p, initialCommand: newCommand };
          }),
        })),
      }));

      logTerminalSession('opencode-session-detected', {
        panelId,
        sessionId,
        priorCommand: priorPanel?.initialCommand || null,
        nextCommand: `opencode --session ${sessionId}`,
      });

      flushTerminalSessionPersistence(storage, {
        workspaces: nextWorkspaces,
        activeWsId: activeWsIdRef.current,
        activePanelIds: activePanelIdsRef.current,
        workspaceWindows: workspaceWindowsRef.current,
        activeWindowIds: activeWindowIdsRef.current,
        projectId,
        appSessionId: `opencode-detect-${sessionId}`,
        agentRunsByPanel: readAgentRunsByPanel(storage),
      });

      setWorkspaces(nextWorkspaces);
    };

    const handleTerminalExit = (e) => {
      const { id: panelId, initialCommand } = e.detail || {};
      if (!panelId) return;

      const pending = pendingReopenPanelsRef.current.get(panelId);
      if (!pending) return;
      if (initialCommand && pending.command && initialCommand !== pending.command) return;

      failPendingReopen(panelId);
    };

    const handleTerminalSettingsModalRequested = (e) => {
      const { panelId } = e.detail || {};
      if (!panelId) return;

      let sessionId = null;
      let cwd = null;
      let sessionType = 'opencode-durable';

      for (const ws of workspacesRef.current) {
        for (const col of ws.columns) {
          const panel = col.panels.find((p) => p.id === panelId);
          if (panel) {
            cwd = panel.cwd;
            const sessionMatch = (panel.initialCommand || '').match(
              /opencode\s+--session\s+([\w-]+)/i
            );
            sessionId = sessionMatch ? sessionMatch[1] : null;
            if ((panel.initialCommand || '').includes('opencode')) {
              sessionType = 'opencode-durable';
            } else if ((panel.initialCommand || '').includes('pty')) {
              sessionType = 'pty-durable';
            } else {
              sessionType = 'shell-ephemeral';
            }
            break;
          }
        }
        if (sessionId) break;
      }

      setTerminalSettingsModal({
        open: true,
        panelId,
        sessionId: sessionId || panelId,
        cwd,
        sessionType,
        restorePolicy: 'manual',
      });
    };

    const handleManualReviveRequested = (e) => {
      const { panelId, sessionId: hintSessionId } = e.detail || {};
      if (!panelId) return;

      const panel = workspacesRef.current
        .flatMap((ws) => ws.columns || [])
        .flatMap((col) => col.panels || [])
        .find((entry) => entry.id === panelId);

      const agentRun = readAgentRunsByPanel(storage)[panelId] || null;
      const sessionKind = inferPanelSessionKind({
        initialCommand: panel?.initialCommand,
        agentRun,
        panel,
      });

      const clearSuspended = () => {
        setReopenActionError(null);
        setPanelRestoreModes((prev) => {
          const next = { ...prev };
          delete next[panelId];
          return next;
        });
      };

      if (sessionKind === 'opencode') {
        const opencodeSessionId = resolveOpenCodeSessionIdForPanel({
          panel,
          agentRun,
          hintSessionId,
        });

        if (!opencodeSessionId) {
          setReopenActionError(
            'No se encontró un id de sesión OpenCode guardado. Abrí una sesión nueva o usá política automática.'
          );
          return;
        }

        clearSuspended();
        applyPanelRelaunchCommand(
          panelId,
          `opencode --session ${opencodeSessionId}`,
          panel?.cwd || null,
          { forceBump: true, emitEvent: false }
        );
        window.dispatchEvent(
          new CustomEvent('devhub:terminal-resume-requested', { detail: { panelId } })
        );
        return;
      }

      if (sessionKind === 'swarm') {
        clearSuspended();
        window.dispatchEvent(
          new CustomEvent('devhub:terminal-resume-requested', { detail: { panelId } })
        );
        return;
      }

      clearSuspended();
      const shellCommand = String(panel?.initialCommand || '')
        .replace(/\s*#recovery-\d+\s*$/i, '')
        .trim();

      if (shellCommand) {
        applyPanelRelaunchCommand(panelId, shellCommand, panel?.cwd || null, {
          forceBump: true,
          emitEvent: false,
        });
      }

      window.dispatchEvent(
        new CustomEvent('devhub:terminal-resume-requested', { detail: { panelId } })
      );
    };

    const handleSwarmLaunchWrapperSent = (e) => {
      const { panelId } = e.detail || {};
      if (!panelId) return;

      let panel = null;
      for (const workspace of workspacesRef.current || []) {
        for (const column of workspace?.columns || []) {
          panel = (column.panels || []).find((candidate) => candidate.id === panelId) || null;
          if (panel) break;
        }
        if (panel) break;
      }
      if (panel?.swarmContext?.launchId && panel?.swarmContext?.roleKey) {
        markSwarmLaunchWrapperDispatched(
          {
            launchId: panel.swarmContext.launchId,
            roleKey: panel.swarmContext.roleKey,
            panelId,
          },
          storage
        );
      }

      setWorkspaces((prev) =>
        prev.map((ws) => ({
          ...ws,
          columns: ws.columns.map((col) => ({
            ...col,
            panels: col.panels.map((p) => {
              if (p.id !== panelId || !p.swarmContext?.needsLaunchWrapper) return p;
              return {
                ...p,
                swarmContext: {
                  ...p.swarmContext,
                  needsLaunchWrapper: false,
                },
              };
            }),
          })),
        }))
      );

      try {
        const savedState = JSON.parse(storage?.getItem(terminalStateStorageKey) || '{}');
        if (savedState.workspaces) {
          savedState.workspaces = savedState.workspaces.map((ws) => ({
            ...ws,
            columns: ws.columns.map((col) => ({
              ...col,
              panels: col.panels.map((p) => {
                if (p.id !== panelId || !p.swarmContext?.needsLaunchWrapper) return p;
                return {
                  ...p,
                  swarmContext: {
                    ...p.swarmContext,
                    needsLaunchWrapper: false,
                  },
                };
              }),
            })),
          }));
          storage?.setItem(terminalStateStorageKey, JSON.stringify(savedState));
        }
      } catch {
        // Best-effort persistence only.
      }
    };

    const handleRelaunchPanel = (e) => {
      const { panelId, command, cwd, reason } = e.detail || {};
      if (!panelId || !command) return;

      if (relaunchInFlightRef.current.has(panelId)) return;

      logTerminalSession('session-recovery-relaunch-event', {
        panelId,
        command,
        cwd,
        reason,
      });

      if (reason === 'panel-relaunch') return;

      const panel = workspacesRef.current
        .flatMap((ws) => ws.columns || [])
        .flatMap((col) => col.panels || [])
        .find((entry) => entry.id === panelId);
      const agentRun = readAgentRunsByPanel(storage)[panelId] || null;
      if (
        inferPanelSessionKind({
          initialCommand: command,
          agentRun,
          panel,
        }) === 'swarm'
      ) {
        return;
      }

      const recoveryCommand = `${command} #recovery-${Date.now()}`;

      setWorkspaces((prev) =>
        prev.map((ws) => ({
          ...ws,
          columns: ws.columns.map((col) => ({
            ...col,
            panels: col.panels.map((p) => {
              if (p.id !== panelId) return p;
              return { ...p, initialCommand: recoveryCommand, cwd: cwd || p.cwd };
            }),
          })),
        }))
      );

      try {
        const savedState = JSON.parse(storage?.getItem(terminalStateStorageKey) || '{}');
        if (savedState.workspaces) {
          savedState.workspaces = savedState.workspaces.map((ws) => ({
            ...ws,
            columns: ws.columns.map((col) => ({
              ...col,
              panels: col.panels.map((p) => {
                if (p.id !== panelId) return p;
                return { ...p, initialCommand: recoveryCommand, cwd: cwd || p.cwd };
              }),
            })),
          }));
          storage?.setItem(terminalStateStorageKey, JSON.stringify(savedState));
        }
      } catch {
        // Ignore persistence failures
      }
    };

    window.addEventListener('devhub:opencode-session-detected', handleOpenCodeSessionDetected);
    window.addEventListener('devhub:terminal-exit', handleTerminalExit);
    window.addEventListener('devhub:swarm-launch-wrapper-sent', handleSwarmLaunchWrapperSent);
    window.addEventListener('devhub:relaunch-panel', handleRelaunchPanel);
    window.addEventListener(
      'devhub:terminal-settings-modal-requested',
      handleTerminalSettingsModalRequested
    );
    window.addEventListener('devhub:manual-revive-requested', handleManualReviveRequested);

    return () => {
      window.removeEventListener('devhub:opencode-session-detected', handleOpenCodeSessionDetected);
      window.removeEventListener('devhub:terminal-exit', handleTerminalExit);
      window.removeEventListener('devhub:swarm-launch-wrapper-sent', handleSwarmLaunchWrapperSent);
      window.removeEventListener('devhub:relaunch-panel', handleRelaunchPanel);
      window.removeEventListener(
        'devhub:terminal-settings-modal-requested',
        handleTerminalSettingsModalRequested
      );
      window.removeEventListener('devhub:manual-revive-requested', handleManualReviveRequested);
    };
  }, [
    activeWsId,
    applyPanelRelaunchCommand,
    failPendingReopen,
    projectId,
    storage,
    terminalStateStorageKey,
  ]);
}
