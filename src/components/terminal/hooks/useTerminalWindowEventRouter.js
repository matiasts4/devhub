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
  cliLog,
} from '@/components/terminal/TerminalTTY.helpers';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';

/** Coalesce visibility+focus+pageshow storms after OS wake. */
const OS_RESUME_RECONNECT_COALESCE_MS = 150;
/** Per-panel cooldown so resume + auto-reconnect do not stampede connect(). */
const OS_RESUME_RECONNECT_COOLDOWN_MS = 2000;

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

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;

      restoreNativeSurfaceAfterAppResume();
      maybeReconnectAfterOsResume('visibility-visible');

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
        logViewportDiagnostic('visibility-webgl-context-lost');
        disposeWebglAddonForContextLoss('visibility-webgl-context-lost');
      }

      if (
        shouldRunTerminalViewportReactivation({
          isActivePanel,
          isVisibleInLayout,
          documentVisibilityState: document.visibilityState,
        })
      ) {
        logViewportDiagnostic('visibility-visible');
        void syncTerminalViewportOnWorkspaceShowRef
          .current?.('visibility-visible', { clearAtlas: true, forceScroll: false })
          .then(() => {
            if (isDisposingRef.current || !termRef.current) return;
            prepareActiveTuiTerminalFocus(termRef.current, {
              tuiSessionActive: tuiSessionActiveRef.current,
            });
            if (autoFocus) {
              termRef.current?.focus?.();
            }
          });
      } else {
        scheduleInactiveViewportRepaint();
      }
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
      restoreNativeSurfaceAfterAppResume();
      maybeReconnectAfterOsResume('window-focus');

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
        logViewportDiagnostic('window-focus-webgl-context-lost');
        disposeWebglAddonForContextLoss('window-focus-webgl-context-lost');
      }

      if (shouldRunTerminalViewportReactivation({ isActivePanel, isVisibleInLayout })) {
        logViewportDiagnostic('window-focus');
        void syncTerminalViewportOnWorkspaceShowRef
          .current?.('window-focus', { clearAtlas: true, forceScroll: false })
          .then(() => {
            if (isDisposingRef.current || !termRef.current) return;
            prepareActiveTuiTerminalFocus(termRef.current, {
              tuiSessionActive: tuiSessionActiveRef.current,
            });
            if (autoFocus) {
              termRef.current?.focus?.();
            }
          });
      } else {
        scheduleInactiveViewportRepaint();
      }
    };

    const handlePageShow = () => {
      restoreNativeSurfaceAfterAppResume();
      maybeReconnectAfterOsResume('pageshow');

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
        logViewportDiagnostic('pageshow-webgl-context-lost');
        disposeWebglAddonForContextLoss('pageshow-webgl-context-lost');
      }

      if (shouldRunTerminalViewportReactivation({ isActivePanel, isVisibleInLayout })) {
        logViewportDiagnostic('pageshow');
        void syncTerminalViewportOnWorkspaceShowRef
          .current?.('pageshow', { clearAtlas: true, forceScroll: false })
          .then(() => {
            if (isDisposingRef.current || !termRef.current) return;
            prepareActiveTuiTerminalFocus(termRef.current, {
              tuiSessionActive: tuiSessionActiveRef.current,
            });
            if (autoFocus) {
              termRef.current?.focus?.();
            }
          });
      } else {
        scheduleInactiveViewportRepaint();
      }
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
