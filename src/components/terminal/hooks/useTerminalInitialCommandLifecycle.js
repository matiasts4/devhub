/**
 * useTerminalInitialCommandLifecycle — initial command / swarm / agent-ready dispatch.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 3).
 */
/* eslint-disable no-console -- parity with source TerminalTTY debug logs */
import { useCallback } from 'react';
import { cliLog } from '@/components/terminal/TerminalTTY.helpers';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';
import {
  isSwarmLaunchWrapperCommand,
  readAgentRunForPanel,
  resolveTerminalInjectCommand,
} from '@/lib/terminal/restorePolicyResolver';
import { buildSwarmTmuxSessionName } from '@/lib/terminal/viewportReadyMarker';
import {
  isSwarmLaunchWrapperDispatched,
  markSwarmLaunchWrapperDispatched,
} from '@/lib/terminal/swarmLaunchWrapperLifecycle';
import {
  getPanelInitialCommandDispatch,
  markPanelInitialCommandDispatched,
  shouldSkipRedundantInitialCommandSend,
} from '@/lib/terminal/panelInitialCommandLifecycle';
import { shouldBlockLateInitialCommandSend } from '@/components/terminal/TerminalTTY.helpers';
import { TERMINAL_PROJECTION_READY_TIMEOUT_MS } from '@/components/terminal/TerminalTTY.helpers';

export default function useTerminalInitialCommandLifecycle({
  ctxRef,
  id,
  initialCommand,
  swarmContext,
}) {
  const resolveSwarmTmuxSessionName = useCallback(() => {
    if (!swarmContext?.isSwarmRole) return null;
    return buildSwarmTmuxSessionName(swarmContext.launchId, swarmContext.roleKey);
  }, [swarmContext]);

  const notifyAgentReady = useCallback(
    async (program = 'opencode', opencodeSessionId, reason = 'client-tui-footer') => {
      const c = ctxRef.current;
      const { opencodeReadyNotifiedRef, kimiReadyNotifiedRef } = c;
      const normalizedProgram = String(program || 'opencode').trim() || 'opencode';
      const notifiedRef =
        normalizedProgram === 'kimi' ? kimiReadyNotifiedRef : opencodeReadyNotifiedRef;
      if (notifiedRef.current) return;
      const tmuxSession = resolveSwarmTmuxSessionName();
      if (!tmuxSession) return;

      const storageKey = `devhub:agent-ready-posted:${normalizedProgram}:${tmuxSession}`;
      try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(storageKey)) {
          notifiedRef.current = true;
          return;
        }
      } catch {
        /* ignore */
      }

      notifiedRef.current = true;
      try {
        await fetch('/api/terminal/opencode-ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: id,
            tmuxSession,
            program: normalizedProgram,
            opencodeSessionId: opencodeSessionId || null,
            reason,
          }),
        });
        cliLog(`CLIENT:${id}`, 'agent-ready-notified', {
          tmuxSession,
          program: normalizedProgram,
          opencodeSessionId,
          reason,
        });
        try {
          sessionStorage?.setItem(storageKey, String(Date.now()));
        } catch {
          /* ignore */
        }
      } catch (error) {
        notifiedRef.current = false;
        cliLog(`CLIENT:${id}`, 'agent-ready-failed', {
          program: normalizedProgram,
          error: error?.message,
        });
      }
    },
    [ctxRef, id, resolveSwarmTmuxSessionName]
  );

  const notifyOpencodeReady = useCallback(
    (opencodeSessionId, reason = 'client-tui-footer') =>
      notifyAgentReady('opencode', opencodeSessionId, reason),
    [notifyAgentReady]
  );

  const notifyViewportReady = useCallback(
    (cols, rows) => {
      const c = ctxRef.current;
      const { lastViewportReadyPostedRef, viewportReadyNotifyTimerRef } = c;
      const tmuxSession = resolveSwarmTmuxSessionName();
      if (!tmuxSession) return;

      const lastPosted = lastViewportReadyPostedRef.current;
      if (lastPosted.cols === cols && lastPosted.rows === rows) return;

      if (viewportReadyNotifyTimerRef.current) {
        clearTimeout(viewportReadyNotifyTimerRef.current);
      }

      viewportReadyNotifyTimerRef.current = setTimeout(() => {
        viewportReadyNotifyTimerRef.current = null;
        lastViewportReadyPostedRef.current = { cols, rows };

        void (async () => {
          try {
            await fetch('/api/terminal/viewport-ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: id,
                tmuxSession,
                cols,
                rows,
              }),
            });
            cliLog(`CLIENT:${id}`, 'viewport-ready-notified', { tmuxSession, cols, rows });
          } catch (error) {
            cliLog(`CLIENT:${id}`, 'viewport-ready-failed', { error: error?.message });
          }
        })();
      }, 200);
    },
    [ctxRef, id, resolveSwarmTmuxSessionName]
  );

  const skipRedundantInitialCommandSend = useCallback(
    (commandToSend, isRecoveryRelaunch = false) =>
      shouldSkipRedundantInitialCommandSend({
        panelId: id,
        command: commandToSend,
        isRecoveryRelaunch,
        sessionReattached: ctxRef.current.sessionReattachedRef.current,
      }),
    [ctxRef, id]
  );

  const restoreInitialCommandDispatchGuard = useCallback(() => {
    const c = ctxRef.current;
    const {
      hasSentInitialCommand,
      sessionReattachedRef,
      hasConnectedOnceRef,
      initialCommand: cmd,
    } = c;
    if (hasSentInitialCommand.current) return;
    const record = getPanelInitialCommandDispatch(id);
    if (record?.command) {
      hasSentInitialCommand.current = true;
      sessionReattachedRef.current = true;
      return;
    }
    if (sessionReattachedRef.current && hasConnectedOnceRef.current && cmd) {
      sessionReattachedRef.current = true;
      hasSentInitialCommand.current = true;
    }
  }, [ctxRef, id]);

  const resolveInjectCommand = useCallback(() => {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    const agentRun = readAgentRunForPanel(storage, id);
    return resolveTerminalInjectCommand(initialCommand, agentRun);
  }, [id, initialCommand]);

  const sendInitialCommandIfReady = useCallback(() => {
    const c = ctxRef.current;
    const {
      hasSentInitialCommand,
      serverReadyReceivedRef,
      sessionReattachedRef,
      viewportFitConfirmedRef,
      wsRef,
      panelCreatedAtRef,
      projectionReadyRef,
      initialCommandProjectionRetryTimerRef,
      transportRef,
    } = c;
    if (!initialCommand || hasSentInitialCommand.current) return;
    if (
      shouldSkipRedundantInitialCommandSend({
        panelId: id,
        command: initialCommand,
        sessionReattached: sessionReattachedRef.current,
      })
    ) {
      logTerminalSession('initial-command-skipped', {
        panelId: id,
        reason: 'redundant-lifecycle-early',
        command: initialCommand,
        sessionReattached: sessionReattachedRef.current,
      });
      hasSentInitialCommand.current = true;
      return;
    }
    if (!serverReadyReceivedRef.current) return;
    if (sessionReattachedRef.current) {
      hasSentInitialCommand.current = true;
      markPanelInitialCommandDispatched(id, initialCommand);
      return;
    }
    if (!viewportFitConfirmedRef.current) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    const projectionElapsedMs = Date.now() - panelCreatedAtRef.current;
    console.log(
      `[DEBUG TTY:${id}] sendInitialCommandIfReady called. cmd=${initialCommand}, projectionReady=${projectionReadyRef.current}, elapsed=${projectionElapsedMs}ms, viewportFit=${viewportFitConfirmedRef.current}, wsOpen=${wsRef.current?.readyState === WebSocket.OPEN}`
    );
    if (!projectionReadyRef.current && projectionElapsedMs < TERMINAL_PROJECTION_READY_TIMEOUT_MS) {
      if (initialCommandProjectionRetryTimerRef.current) {
        window.clearTimeout(initialCommandProjectionRetryTimerRef.current);
      }
      console.log(`[DEBUG TTY:${id}] projection not ready, scheduling retry in 50ms`);
      initialCommandProjectionRetryTimerRef.current = window.setTimeout(() => {
        initialCommandProjectionRetryTimerRef.current = null;
        sendInitialCommandIfReady();
      }, 50);
      return;
    }

    const isRecoveryRelaunch = /#recovery-\d+\s*$/i.test(initialCommand);
    let commandToSend = null;

    if (swarmContext?.isSwarmRole) {
      const wrapperAlreadyDispatched = isSwarmLaunchWrapperDispatched(
        {
          launchId: swarmContext.launchId,
          roleKey: swarmContext.roleKey,
        },
        typeof window !== 'undefined' ? window.localStorage : null
      );
      if (wrapperAlreadyDispatched || swarmContext?.needsLaunchWrapper !== true) {
        logTerminalSession('initial-command-skipped', {
          panelId: id,
          reason: wrapperAlreadyDispatched
            ? 'swarm-wrapper-already-dispatched'
            : 'swarm-tmux-reattach',
          command: initialCommand,
        });
        hasSentInitialCommand.current = true;
        markPanelInitialCommandDispatched(id, initialCommand);
        return;
      }

      commandToSend = String(initialCommand || '')
        .replace(/\s*#recovery-\d+\s*$/i, '')
        .trim();
      if (!commandToSend || !isSwarmLaunchWrapperCommand(commandToSend)) {
        logTerminalSession('initial-command-skipped', {
          panelId: id,
          reason: 'swarm-wrapper-command-missing',
          command: initialCommand,
        });
        hasSentInitialCommand.current = true;
        return;
      }
    } else {
      commandToSend = resolveInjectCommand();
      if (!commandToSend) {
        logTerminalSession('initial-command-skipped', {
          panelId: id,
          reason: 'no-resolved-inject-command',
          command: initialCommand,
          isRecoveryRelaunch,
        });
        hasSentInitialCommand.current = true;
        return;
      }
    }

    if (skipRedundantInitialCommandSend(commandToSend, isRecoveryRelaunch)) {
      logTerminalSession('initial-command-skipped', {
        panelId: id,
        reason: 'redundant-lifecycle',
        command: initialCommand,
        isRecoveryRelaunch,
      });
      hasSentInitialCommand.current = true;
      markPanelInitialCommandDispatched(id, initialCommand);
      return;
    }
    if (
      shouldBlockLateInitialCommandSend({
        hasConnectedOnce: c.hasConnectedOnceRef.current,
        isRecoveryRelaunch,
        snapshotCommand: c.initialCommandConnectSnapshotRef.current,
        currentCommand: initialCommand,
      })
    ) {
      logTerminalSession('initial-command-blocked', {
        panelId: id,
        reason: 'late-command-change',
        snapshotCommand: c.initialCommandConnectSnapshotRef.current,
        currentCommand: initialCommand,
      });
      hasSentInitialCommand.current = true;
      markPanelInitialCommandDispatched(id, initialCommand);
      return;
    }

    const cleanCommand = commandToSend.replace(/\s*#recovery-\d+\s*$/, '');
    logTerminalSession('initial-command-sent', {
      panelId: id,
      command: cleanCommand,
      sourceCommand: initialCommand,
      isRecoveryRelaunch,
      transport: transportRef.current,
    });
    console.log(`[TTY:${id}] Sending initial command: ${cleanCommand}`);
    if (transportRef.current === 'raw') {
      wsRef.current.send(cleanCommand + '\r');
    } else {
      wsRef.current.send(JSON.stringify({ type: 'input', data: cleanCommand + '\r' }));
    }
    hasSentInitialCommand.current = true;
    markPanelInitialCommandDispatched(id, commandToSend);
    if (swarmContext?.isSwarmRole && swarmContext?.needsLaunchWrapper === true) {
      markSwarmLaunchWrapperDispatched(
        {
          launchId: swarmContext.launchId,
          roleKey: swarmContext.roleKey,
          panelId: id,
        },
        typeof window !== 'undefined' ? window.localStorage : null
      );
      window.dispatchEvent(
        new CustomEvent('devhub:swarm-launch-wrapper-sent', { detail: { panelId: id } })
      );
    }
  }, [
    ctxRef,
    id,
    initialCommand,
    resolveInjectCommand,
    skipRedundantInitialCommandSend,
    swarmContext,
  ]);

  const scheduleInitialCommandAfterViewport = useCallback(() => {
    const c = ctxRef.current;
    const { initialCommandDelayScheduledRef, initialCommandDelayTimerRef } = c;
    if (initialCommandDelayScheduledRef.current) return;
    initialCommandDelayScheduledRef.current = true;

    const delayMs = Math.max(0, Number(swarmContext?.startAfterMs) || 0);
    if (initialCommandDelayTimerRef.current) {
      window.clearTimeout(initialCommandDelayTimerRef.current);
      initialCommandDelayTimerRef.current = null;
    }
    if (delayMs > 0) {
      initialCommandDelayTimerRef.current = window.setTimeout(() => {
        initialCommandDelayTimerRef.current = null;
        sendInitialCommandIfReady();
      }, delayMs);
      return;
    }
    sendInitialCommandIfReady();
  }, [ctxRef, sendInitialCommandIfReady, swarmContext?.startAfterMs]);

  return {
    resolveSwarmTmuxSessionName,
    notifyAgentReady,
    notifyOpencodeReady,
    notifyViewportReady,
    skipRedundantInitialCommandSend,
    restoreInitialCommandDispatchGuard,
    resolveInjectCommand,
    sendInitialCommandIfReady,
    scheduleInitialCommandAfterViewport,
  };
}
