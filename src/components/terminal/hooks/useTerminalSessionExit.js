/**
 * useTerminalSessionExit — session exit detection + overlay recovery click.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 3).
 */
/* eslint-disable no-unused-vars -- ctxRef bag destructure */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { cliLog } from '@/components/terminal/TerminalTTY.helpers';
import { disableTerminalFocusReporting } from '@/components/terminal/TerminalTTY.helpers';
import {
  buildTerminalExitOverlayCopy,
  clearPanelSessionExit,
  isAgentTuiCommand,
  parseTerminalExitReason,
  persistPanelSessionExit,
  readPanelSessionExit,
} from '@/lib/terminal/agentSessionExit';
import { extractOpenCodeSessionId } from '@/lib/terminal/restorePolicyResolver';
import { clearPanelSemanticState } from '@/components/terminal/utils/panelSemanticStateStore';
import { resetAgentNotificationBridgeState } from '@/components/terminal/utils/agentNotificationBridge';
import {
  cancelNativeVteLayoutHide,
  clearNativeVteLease,
  consumeHiddenNativeVteLease,
  deferNativeVteLayoutHide,
} from '@/lib/terminal/nativeVteLayoutLifecycle';
import { NATIVE_VTE_STUBS } from '@/lib/terminal/nativeVteNoopStubs';
import { getNativeTerminalBounds } from '@/components/terminal/TerminalTTY.helpers';

const { setNativeVtePanelVisibility } = NATIVE_VTE_STUBS;

export default function useTerminalSessionExit({ ctxRef, shouldUseNativeRenderer }) {
  const [sessionExitReason, setSessionExitReason] = useState(null);

  const applyTerminalSessionExit = useCallback(
    (detail = {}, { emitBrowserEvent = false } = {}) => {
      const c = ctxRef.current;
      const {
        id,
        initialCommand,
        setConnectionState,
        setNativeWheelPassthrough,
        processExitedRef,
        tuiSessionActiveRef,
        isGrokSessionRef,
        grokTuiReadyRef,
        tuiSessionFooterConfirmedRef,
        termRef,
        requestedRendererModeRef,
        nativeLeaseRef,
        containerRef,
        nativePlaceholderRef,
        setNativeVteOpened,
        setNativeVteProbeResult,
      } = c;
      const panelId = detail?.id || detail?.panelId;
      if (panelId && panelId !== id) return;

      const reason = detail?.reason || null;
      const command = detail?.initialCommand || initialCommand;
      const parsed = parseTerminalExitReason(reason);
      const agentSession = parsed.kind === 'agent' || isAgentTuiCommand(command);

      processExitedRef.current = true;
      tuiSessionActiveRef.current = false;
      isGrokSessionRef.current = false;
      grokTuiReadyRef.current = false;
      tuiSessionFooterConfirmedRef.current = false;
      setNativeWheelPassthrough(false);
      setSessionExitReason(reason);
      disableTerminalFocusReporting(termRef.current, { disableMouse: true });

      // N7/W7 client-side exit cleanup: drop the live semantic agent state so
      // stale "blocked"/"running" badges don't persist after the child exits,
      // and reset the notification bridge cooldown maps for this panel.
      clearPanelSemanticState(id);
      resetAgentNotificationBridgeState(id);

      if (agentSession && parsed.kind === 'agent') {
        setConnectionState('agent-exited');
        persistPanelSessionExit(id, { reason, connectionState: 'agent-exited' });
      } else if (agentSession && parsed.abnormal) {
        setConnectionState('terminated');
        clearPanelSessionExit(id);
      } else {
        setConnectionState('terminated');
        clearPanelSessionExit(id);
      }

      if (requestedRendererModeRef.current === 'vte-experimental' && nativeLeaseRef.current) {
        const bounds = getNativeTerminalBounds(
          containerRef.current || nativePlaceholderRef.current
        );
        if (bounds) {
          void Promise.resolve(
            setNativeVtePanelVisibility({
              panelId: id,
              visible: true,
              bounds,
            })
          ).catch(() => {});
        }
      }

      if (requestedRendererModeRef.current !== 'vte-experimental' && termRef.current) {
        const overlayCopy = buildTerminalExitOverlayCopy({
          initialCommand: command,
          reason,
          connectionState: agentSession && parsed.kind === 'agent' ? 'agent-exited' : 'terminated',
        });
        termRef.current?.writeln(`\r\n\x1b[33m[${overlayCopy.title}]\x1b[0m`);
      }

      if (emitBrowserEvent) {
        window.dispatchEvent(
          new CustomEvent('devhub:terminal-exit', {
            detail: { id, initialCommand: command, reason },
          })
        );
      }
    },
    [ctxRef]
  );

  useLayoutEffect(() => {
    const c = ctxRef.current;
    const {
      id,
      setConnectionState,
      setNativeVteOpened,
      setNativeVteProbeResult,
      nativeLeaseRef,
      restoredHiddenLeaseThisMountRef,
      processExitedRef,
    } = c;
    cancelNativeVteLayoutHide(id);
    const persistedExit = readPanelSessionExit(id);
    const restoredLease = consumeHiddenNativeVteLease(id);
    if (!restoredLease && !persistedExit) return;

    nativeLeaseRef.current = true;
    restoredHiddenLeaseThisMountRef.current = Boolean(restoredLease);
    setNativeVteOpened(true);
    setNativeVteProbeResult((prev) => prev ?? { ready: true, reason: null });

    if (persistedExit) {
      processExitedRef.current = true;
      setSessionExitReason(persistedExit.reason);
      setConnectionState(persistedExit.connectionState);
      return;
    }

    setConnectionState('connected');
  }, [ctxRef]);

  useEffect(() => {
    const c = ctxRef.current;
    const { id, isEngineV2Ref, wsRef, hideTimerRef, sessionClosingRef, hideNativeLease } = c;
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      if (isEngineV2Ref.current && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'unsubscribe' }));
        } catch {
          // ignore unsubscribe send errors during unmount
        }
      }

      if (sessionClosingRef.current) {
        cancelNativeVteLayoutHide(id);
        clearNativeVteLease(id);
        return;
      }
      deferNativeVteLayoutHide(id, () => {
        hideNativeLease('layout-unmount');
      });
    };
  }, [ctxRef]);

  useEffect(() => {
    if (!shouldUseNativeRenderer) return undefined;

    const handleNativeTerminalExit = (event) => {
      applyTerminalSessionExit(event.detail || {}, { emitBrowserEvent: false });
    };

    window.addEventListener('devhub:terminal-exit', handleNativeTerminalExit);
    return () => {
      window.removeEventListener('devhub:terminal-exit', handleNativeTerminalExit);
    };
  }, [applyTerminalSessionExit, shouldUseNativeRenderer]);

  useEffect(() => {
    if (!shouldUseNativeRenderer) return undefined;

    const handleNativeRuntimeEvent = (event) => {
      const c = ctxRef.current;
      const {
        id,
        onActivatePanel,
        nativeLeaseRef,
        setNativeVteOpened,
        setNativeVteOpenFailure,
        setConnectionState,
        nativeVteProbeRetryCountRef,
        clearNativeVteProbeRetryTimer,
        setNativeVteRecoveryAttempt,
      } = c;
      const detail = event.detail || {};
      if (detail.panelId !== id) return;
      if (detail.type === 'panel-activated') {
        onActivatePanel?.(id);
        return;
      }
      if (detail.type !== 'runtime-error') return;

      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      setNativeVteOpenFailure(detail.reason || 'open-failed');
      setConnectionState('error');
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
      setNativeVteRecoveryAttempt((attempt) => attempt + 1);
    };

    window.addEventListener('devhub:terminal-native-vte-event', handleNativeRuntimeEvent);
    return () => {
      window.removeEventListener('devhub:terminal-native-vte-event', handleNativeRuntimeEvent);
    };
  }, [ctxRef, shouldUseNativeRenderer]);

  const handleSessionRecoveryClick = useCallback(() => {
    const c = ctxRef.current;
    const { connectionState, initialCommand, id, reconnect, processExitedRef } = c;
    if (connectionState === 'agent-exited' || isAgentTuiCommand(initialCommand)) {
      clearPanelSessionExit(id);
      setSessionExitReason(null);
      processExitedRef.current = false;
      window.dispatchEvent(
        new CustomEvent('devhub:manual-revive-requested', {
          detail: { panelId: id, sessionId: extractOpenCodeSessionId(initialCommand) || id },
        })
      );
      return;
    }
    reconnect();
  }, [ctxRef]);

  return {
    sessionExitReason,
    setSessionExitReason,
    applyTerminalSessionExit,
    handleSessionRecoveryClick,
  };
}
