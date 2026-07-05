/**
 * useTerminalPanelActivationRecovery — panel becomes active (false→true) recovery.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 2).
 */
/* eslint-disable no-unused-vars -- ctxRef bag destructure */
import { useLayoutEffect } from 'react';
import {
  shouldAttachWebglRenderer,
  shouldAttachCanvasRenderer,
  shouldClearWebglAtlasOnPanelActivation,
  shouldRecoverPanelOnActivation,
  shouldSkipReactivateViewportOnPanelActivation,
  prepareActiveTuiTerminalFocus,
} from '@/components/terminal/TerminalTTY.helpers';

export default function useTerminalPanelActivationRecovery({
  ctxRef,
  autoFocus,
  isActivePanel,
  operationalRendererMode,
  shouldUseNativeRenderer,
  syncTerminalViewportOnWorkspaceShow,
  logRenderHealth,
}) {
  useLayoutEffect(() => {
    const c = ctxRef.current;
    const {
      prevIsActivePanelRef,
      termRef,
      webglAddonRef,
      canvasAddonRef,
      containerRef,
      fitRef,
      tuiSessionActiveRef,
      hiddenOutputCatchupPendingRef,
      tryReattachWebglAddonRef,
      tryReattachCanvasAddonRef,
      reactivateTerminalViewportRef,
    } = c;

    const becameActive = shouldRecoverPanelOnActivation(
      prevIsActivePanelRef.current,
      isActivePanel
    );
    prevIsActivePanelRef.current = isActivePanel;

    if (!becameActive || shouldUseNativeRenderer) return;
    const term = termRef.current;
    if (!term) return;

    const hadGpuRenderer = Boolean(webglAddonRef.current || canvasAddonRef.current);
    const canUseWebgl = shouldAttachWebglRenderer({ operationalRendererMode });
    const canUseCanvas = shouldAttachCanvasRenderer({ operationalRendererMode });
    const clearAtlas =
      (canUseWebgl || canUseCanvas) && shouldClearWebglAtlasOnPanelActivation(hadGpuRenderer);

    if (
      shouldSkipReactivateViewportOnPanelActivation({
        hadGpuRenderer,
        clearAtlas,
        term,
        container: containerRef.current,
        fitAddon: fitRef.current,
      })
    ) {
      prepareActiveTuiTerminalFocus(term, {
        tuiSessionActive: tuiSessionActiveRef.current,
      });
      if (autoFocus) {
        term.focus?.();
      }
      return;
    }

    logRenderHealth('panel-activated-recover');
    if (canUseWebgl) {
      void tryReattachWebglAddonRef.current?.();
    } else if (canUseCanvas) {
      void tryReattachCanvasAddonRef.current?.();
    }
    reactivateTerminalViewportRef.current?.({
      clearAtlas,
    });

    if (hiddenOutputCatchupPendingRef.current && termRef.current) {
      void syncTerminalViewportOnWorkspaceShow('panel-activated-catchup', { clearAtlas: true });
    }

    if (!autoFocus) return;
    prepareActiveTuiTerminalFocus(term, {
      tuiSessionActive: tuiSessionActiveRef.current,
    });
    term.focus?.();
  }, [
    ctxRef,
    autoFocus,
    isActivePanel,
    logRenderHealth,
    operationalRendererMode,
    shouldUseNativeRenderer,
    syncTerminalViewportOnWorkspaceShow,
  ]);
}
