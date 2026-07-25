/**
 * useTerminalWindowEventRouter — `resize` / `focus` / `pageshow` / `visibilitychange`.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 2).
 *
 * Viewport/WebGL recovery paths are unchanged. OS resume additionally checks
 * transport health (dead/half-open sockets after sleep) and may call reconnect
 * without altering workspace-switch recovery.
 */

import { useEffect } from 'react';
import {
  shouldAttachWebglRenderer,
  isWebglAddonContextLost,
  shouldRunTerminalViewportReactivation,
  prepareActiveTuiTerminalFocus,
  shouldReconnectTerminalOnOsResume,
  shouldScrollAgentWheelLocally,
  cliLog,
} from '@/components/terminal/TerminalTTY.helpers';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';

/** Coalesce visibility+focus+pageshow storms after OS wake. */
const OS_RESUME_RECONNECT_COALESCE_MS = 150;
/** Per-panel cooldown so resume + auto-reconnect do not stampede connect(). */
const OS_RESUME_RECONNECT_COOLDOWN_MS = 2000;
/**
 * Alt+Tab back fires visibilitychange + focus (+ pageshow) within ~50 ms. Each one
 * used to run a full viewport sync (fit + atlas clear + 1-cell resize nudge), so the
 * terminal visibly re-rendered/resized on every app switch. Coalesce the whole storm
 * into a single light sync. The delay is short enough to be imperceptible.
 */
const OS_RESUME_VIEWPORT_COALESCE_MS = 100;

export default function useTerminalWindowEventRouter({
  ctxRef,
  isActivePanel,
  isVisibleInLayout,
  id,
  autoFocus,
}) {
  useEffect(() => {
    const c = ctxRef.current;
    const {
      requestedRendererModeRef,
      isVisibleInLayoutRef,
      nativeLeaseRef,
      showAndResizeNativeLease,
      queueNativeVteProbeRetry,
      operationalRendererModeRef,
      webglAddonRef,
      disposeWebglAddonForContextLoss,
      syncTerminalViewportOnWorkspaceShowRef,
      needsViewportSyncOnShowRef,
      isDisposingRef,
      termRef,
      tuiSessionActiveRef,
      scheduleInactiveViewportRepaint,
      sendResize,
      fitAndResize,
      reactivateCoalesceTimerRef,
      logViewportDiagnostic,
      initialCommand,
      agentTypeRef,
    } = c;

    const restoreNativeSurfaceAfterAppResume = () => {
      if (requestedRendererModeRef.current !== 'vte-experimental') return;
      if (!isVisibleInLayoutRef.current) return;
      if (nativeLeaseRef.current) {
        showAndResizeNativeLease();
      }
      queueNativeVteProbeRetry(0);
    };

    /**
     * Transport recovery only — does not replace viewport/WebGL handlers below.
     * Reads live bag so reconnect/state stay current across resume events.
     */
    const maybeReconnectAfterOsResume = (reason) => {
      const live = ctxRef.current;
      if (!live || isDisposingRef.current) return;

      const socket = live.wsRef?.current;
      const openState = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1;
      const should = shouldReconnectTerminalOnOsResume({
        connectionState: live.connectionStateRef?.current,
        isVisibleInLayout: live.isVisibleInLayoutRef?.current ?? isVisibleInLayout,
        initError: live.initErrorRef?.current ?? null,
        sessionClosing: Boolean(live.sessionClosingRef?.current),
        hasConnectedOnce: Boolean(live.hasConnectedOnceRef?.current),
        socketReadyState: socket == null ? null : socket.readyState,
        websocketOpenState: openState,
      });
      if (!should) return;

      if (live.osResumeReconnectTimerRef?.current) return;

      const schedule = () => {
        if (!live.osResumeReconnectTimerRef) return;
        live.osResumeReconnectTimerRef.current = window.setTimeout(() => {
          live.osResumeReconnectTimerRef.current = null;
          if (isDisposingRef.current) return;

          const socketNow = live.wsRef?.current;
          const still = shouldReconnectTerminalOnOsResume({
            connectionState: live.connectionStateRef?.current,
            isVisibleInLayout: live.isVisibleInLayoutRef?.current ?? isVisibleInLayout,
            initError: live.initErrorRef?.current ?? null,
            sessionClosing: Boolean(live.sessionClosingRef?.current),
            hasConnectedOnce: Boolean(live.hasConnectedOnceRef?.current),
            socketReadyState: socketNow == null ? null : socketNow.readyState,
            websocketOpenState: openState,
          });
          if (!still) return;

          const now = Date.now();
          const lastAt = live.lastOsResumeReconnectAtRef?.current || 0;
          if (now - lastAt < OS_RESUME_RECONNECT_COOLDOWN_MS) {
            cliLog(`CLIENT:${id}`, 'os-resume reconnect skipped (cooldown)', {
              reason,
              sinceLastMs: now - lastAt,
            });
            return;
          }
          if (live.lastOsResumeReconnectAtRef) {
            live.lastOsResumeReconnectAtRef.current = now;
          }

          cliLog(`CLIENT:${id}`, 'os-resume reconnect', {
            reason,
            connectionState: live.connectionStateRef?.current,
            socketReadyState: socketNow == null ? null : socketNow.readyState,
          });
          logTerminalSession('terminal-os-resume-reconnect', {
            panelId: id,
            reason,
            connectionState: live.connectionStateRef?.current,
            socketReadyState: socketNow == null ? null : socketNow.readyState,
          });
          live.reconnect?.();
        }, OS_RESUME_RECONNECT_COALESCE_MS);
      };

      schedule();
    };

    /**
     * Run the disruptive viewport recovery as a single coalesced pass. The first
     * resume event schedules it; any further visibility/focus/pageshow events inside
     * the coalesce window just reset the timer, so the terminal re-renders at most
     * once per app switch instead of once per event. Native-surface restore and
     * transport reconnect are NOT coalesced here — they run immediately per event
     * and have their own coalescing/cooldown.
     */
    const scheduleCoalescedViewportReactivate = (reason) => {
      if (reactivateCoalesceTimerRef.current) {
        clearTimeout(reactivateCoalesceTimerRef.current);
      }
      reactivateCoalesceTimerRef.current = window.setTimeout(() => {
        reactivateCoalesceTimerRef.current = null;
        if (isDisposingRef.current) return;
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          return;
        }
        logViewportDiagnostic(`${reason}-coalesced`);
        // clearAtlas: false — a plain focus/visibility change does not invalidate the
        // GPU bitmap. Real context loss is already handled by
        // disposeWebglAddonForContextLoss before this runs, and the sync pass only
        // clears the atlas when it actually reattaches a released GPU addon.
        void syncTerminalViewportOnWorkspaceShowRef
          .current?.(reason, { clearAtlas: false, forceScroll: false })
          .then(() => {
            if (isDisposingRef.current || !termRef.current) return;
            prepareActiveTuiTerminalFocus(termRef.current, {
              // Inline-scroll agents never use host mouse — keep DECSET off.
              tuiSessionActive:
                tuiSessionActiveRef.current &&
                !shouldScrollAgentWheelLocally(initialCommand, agentTypeRef?.current),
            });
            if (autoFocus) {
              termRef.current?.focus?.();
            }
          });
      }, OS_RESUME_VIEWPORT_COALESCE_MS);
    };

    const runOsResumeViewportPass = (reason) => {
      restoreNativeSurfaceAfterAppResume();
      maybeReconnectAfterOsResume(reason);

      if (!isVisibleInLayout) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }

      if (
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        isWebglAddonContextLost(webglAddonRef.current)
      ) {
        logViewportDiagnostic(`${reason}-webgl-context-lost`);
        disposeWebglAddonForContextLoss(`${reason}-webgl-context-lost`);
      }

      if (
        shouldRunTerminalViewportReactivation({
          isActivePanel,
          isVisibleInLayout,
          documentVisibilityState: document.visibilityState,
        })
      ) {
        scheduleCoalescedViewportReactivate(reason);
      } else {
        scheduleInactiveViewportRepaint();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      runOsResumeViewportPass('visibility-visible');
    };

    const handleWindowResize = () => {
      if (!isVisibleInLayoutRef.current) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }
      logViewportDiagnostic('window-resize');
      if (isActivePanel) {
        sendResize();
      } else {
        fitAndResize({ clearAtlas: false });
      }
      queueNativeVteProbeRetry();
    };

    const handleWindowFocus = () => {
      runOsResumeViewportPass('window-focus');
    };

    const handlePageShow = () => {
      runOsResumeViewportPass('pageshow');
    };

    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (reactivateCoalesceTimerRef.current) {
        clearTimeout(reactivateCoalesceTimerRef.current);
        reactivateCoalesceTimerRef.current = null;
      }
      const live = ctxRef.current;
      if (live?.osResumeReconnectTimerRef?.current) {
        clearTimeout(live.osResumeReconnectTimerRef.current);
        live.osResumeReconnectTimerRef.current = null;
      }
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [ctxRef, isActivePanel, isVisibleInLayout, id, autoFocus]);
}
