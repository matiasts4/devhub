/**
 * useTerminalWindowEventRouter — `resize` / `focus` / `pageshow` / `visibilitychange`.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 2).
 */
/* eslint-disable no-unused-vars -- ctxRef bag destructure */
import { useEffect } from 'react';
import {
  shouldAttachWebglRenderer,
  isWebglAddonContextLost,
  shouldRunTerminalViewportReactivation,
  prepareActiveTuiTerminalFocus,
} from '@/components/terminal/TerminalTTY.helpers';

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

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;

      restoreNativeSurfaceAfterAppResume();

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
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    ctxRef,
    isActivePanel,
    isVisibleInLayout,
    id,
    autoFocus,
  ]);
}
