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
  reconcileOpenCodeTuiWheelReadiness,
  reconcileGrokTuiWheelReadiness,
} from '@/components/terminal/TerminalTTY.helpers';

function reconcileTuiWheelOnPanelActivate(c, term) {
  const {
    initialCommand,
    tuiSessionActiveRef,
    tuiSessionFooterConfirmedRef,
    setNativeWheelPassthrough,
    isGrokSessionRef,
    grokTuiReadyRef,
  } = c;
  // Only force-ready when we already confirmed chrome before this hide.
  // Cold first activate must still scan the buffer (do not mark footer early).
  const assumeOpenCode = Boolean(tuiSessionFooterConfirmedRef?.current);
  const assumeGrok = Boolean(grokTuiReadyRef?.current);
  reconcileOpenCodeTuiWheelReadiness({
    term,
    initialCommand,
    tuiSessionActiveRef,
    tuiSessionFooterConfirmedRef,
    setNativeWheelPassthrough,
    assumeTuiIfReattached: assumeOpenCode,
  });
  reconcileGrokTuiWheelReadiness({
    term,
    initialCommand,
    tuiSessionActiveRef,
    isGrokSessionRef,
    grokTuiReadyRef,
    setNativeWheelPassthrough,
    assumeTuiIfReattached: assumeGrok,
  });
  // Always rebind mouse after deactivate cleared DECSET — even if footer
  // reconcile no-ops (already confirmed / buffer scan miss).
  prepareActiveTuiTerminalFocus(term, {
    tuiSessionActive: Boolean(tuiSessionActiveRef?.current || assumeOpenCode || assumeGrok),
  });
}

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
      reconcileTuiWheelOnPanelActivate(c, term);
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

    reconcileTuiWheelOnPanelActivate(c, term);
    if (autoFocus) {
      term.focus?.();
    }
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
