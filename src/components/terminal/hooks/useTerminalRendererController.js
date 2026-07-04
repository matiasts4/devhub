/**
 * useTerminalRendererController — WebGL/Canvas attach, reattach, context-loss.
 * Extracted from TerminalTTY.jsx (terminal-decompose TTY-7).
 */
/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps -- ctxRef bag: per-callback destructure */
import { useCallback, useEffect } from 'react';
import { cliLog } from '@/components/terminal/TerminalTTY.helpers';
import {
  neutralizeWebglAddonForDisposal,
  stabilizeTerminalRenderer,
  isTerminalRendererReady,
  fitTerminalViewport,
  proposeTerminalViewportDimensions,
  shouldAttachWebglRenderer,
  shouldAttachCanvasRenderer,
  shouldMountCanvasAddon,
  shouldBlockV2WebglRecovery,
  WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON,
} from '@/components/terminal/TerminalTTY.helpers';
import { shouldSkipKimiTuiPtyResize } from '@/lib/terminal/kimiReadyMarker';
import { TERMINAL_WEBGL_FALLBACK_REASONS } from '@/components/terminal/terminalRendererCapabilities';

export default function useTerminalRendererController({ ctxRef }) {
  const disposeWebglAddonForContextLoss = useCallback(
    (reason = 'webgl-context-lost') => {
      const {
        id,
        initialCommand,
        termRef,
        fitRef,
        containerRef,
        wsRef,
        webglAddonRef,
        canvasAddonRef,
        webglFallbackRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        webglRecoveryTimerRef,
        isEngineV2Ref,
        isVisibleInLayoutRef,
        isActivePanelRef,
        operationalRendererModeRef,
        visibleTerminalPanelCountRef,
        lastPtySizeRef,
        tuiSessionActiveRef,
        kimiReadyNotifiedRef,
        hasConnectedOnceRef,
        handleWebglContextLossRef,
        setWebglFallback,
        buildViewportSnapshot,
        scheduleInactiveViewportRepaint,
        scheduleBoundedGpuRecoverRef,
        scheduleBoundedFitRepaintRef,
        scheduleWorkspaceShowRecoveryRef,
      } = ctxRef.current;
      const addon = webglAddonRef.current;
      if (!addon) return false;

      cliLog(`RENDER:${id}`, reason, buildViewportSnapshot(reason));

      neutralizeWebglAddonForDisposal(addon);
      try {
        addon.dispose?.();
      } catch {
        // ignore double dispose
      }
      webglAddonRef.current = null;
      pendingWebglRecoveryRef.current = true;
      webglReleasedOnLayoutHideRef.current = true;

      stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
      return true;
    },
    [ctxRef]
  );

  const releaseCanvasAddon = useCallback(
    (reason = 'canvas-released') => {
      const {
        id,
        initialCommand,
        termRef,
        fitRef,
        containerRef,
        wsRef,
        webglAddonRef,
        canvasAddonRef,
        webglFallbackRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        webglRecoveryTimerRef,
        isEngineV2Ref,
        isVisibleInLayoutRef,
        isActivePanelRef,
        operationalRendererModeRef,
        visibleTerminalPanelCountRef,
        lastPtySizeRef,
        tuiSessionActiveRef,
        kimiReadyNotifiedRef,
        hasConnectedOnceRef,
        handleWebglContextLossRef,
        setWebglFallback,
        buildViewportSnapshot,
        scheduleInactiveViewportRepaint,
        scheduleBoundedGpuRecoverRef,
        scheduleBoundedFitRepaintRef,
        scheduleWorkspaceShowRecoveryRef,
      } = ctxRef.current;
      const addon = canvasAddonRef.current;
      if (!addon) return false;

      cliLog(`RENDER:${id}`, 'canvas-released', buildViewportSnapshot(reason));

      try {
        addon.dispose?.();
      } catch {
        // ignore double dispose
      }
      canvasAddonRef.current = null;
      canvasReleasedOnLayoutHideRef.current = true;
      stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
      return true;
    },
    [ctxRef]
  );

  const tryReattachCanvasAddon = useCallback(async () => {
    const {
      id,
      initialCommand,
      termRef,
      fitRef,
      containerRef,
      wsRef,
      webglAddonRef,
      canvasAddonRef,
      webglFallbackRef,
      pendingWebglRecoveryRef,
      webglReleasedOnLayoutHideRef,
      canvasReleasedOnLayoutHideRef,
      webglRecoveryTimerRef,
      isEngineV2Ref,
      isVisibleInLayoutRef,
      isActivePanelRef,
      operationalRendererModeRef,
      visibleTerminalPanelCountRef,
      lastPtySizeRef,
      tuiSessionActiveRef,
      kimiReadyNotifiedRef,
      hasConnectedOnceRef,
      handleWebglContextLossRef,
      setWebglFallback,
      buildViewportSnapshot,
      scheduleInactiveViewportRepaint,
      scheduleBoundedGpuRecoverRef,
      scheduleBoundedFitRepaintRef,
      scheduleWorkspaceShowRecoveryRef,
    } = ctxRef.current;
    const term = termRef.current;
    if (!term || canvasAddonRef.current) return false;
    if (
      !shouldMountCanvasAddon({
        operationalRendererMode: operationalRendererModeRef.current,
        isActivePanel: isActivePanelRef.current,
        isVisibleInLayout: isVisibleInLayoutRef.current,
        visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
      })
    ) {
      return false;
    }
    // ponytail: empty RenderService slot fails isTerminalRendererReady but loadAddon still revives GPU
    if (term.element && !term.element.isConnected) return false;
    if (term._core?._isDisposed) return false;

    try {
      const { CanvasAddon: CanvasAddonCtor } = await import('xterm-addon-canvas');
      if (!termRef.current || canvasAddonRef.current) return false;

      const canvasAddon = new CanvasAddonCtor();
      canvasAddonRef.current = canvasAddon;
      termRef.current.loadAddon(canvasAddon);

      const fitWorked = fitTerminalViewport({
        container: containerRef.current,
        fitAddon: fitRef.current,
        term: termRef.current,
        socket: wsRef.current,
        clearAtlas: true,
        lastPtySizeRef: lastPtySizeRef.current,
        skipPtyNotify:
          tuiSessionActiveRef.current ||
          shouldSkipKimiTuiPtyResize({
            initialCommand,
            hasConnectedOnce: hasConnectedOnceRef.current,
            kimiReady: kimiReadyNotifiedRef.current,
          }),
      });
      if (!fitWorked) {
        try {
          canvasAddon.dispose?.();
        } catch {
          // ignore double dispose
        }
        canvasAddonRef.current = null;
        canvasReleasedOnLayoutHideRef.current = true;
        return false;
      }
      stabilizeTerminalRenderer(termRef.current, { clearAtlas: true });
      canvasReleasedOnLayoutHideRef.current = false;
      cliLog(`RENDER:${id}`, 'canvas-attached', buildViewportSnapshot('canvas-reattach'));
      return true;
    } catch (error) {
      console.warn(
        `[TTY:${id}] Canvas reattach failed, staying on DOM renderer`,
        error?.message || error
      );
      return false;
    }
  }, [ctxRef]);

  const tryReattachWebglAddon = useCallback(
    async ({ clearAtlas = true, skipFitWhenUnchanged = false } = {}) => {
      const {
        id,
        initialCommand,
        termRef,
        fitRef,
        containerRef,
        wsRef,
        webglAddonRef,
        canvasAddonRef,
        webglFallbackRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        webglRecoveryTimerRef,
        isEngineV2Ref,
        isVisibleInLayoutRef,
        isActivePanelRef,
        operationalRendererModeRef,
        visibleTerminalPanelCountRef,
        lastPtySizeRef,
        tuiSessionActiveRef,
        kimiReadyNotifiedRef,
        hasConnectedOnceRef,
        handleWebglContextLossRef,
        setWebglFallback,
        buildViewportSnapshot,
        scheduleInactiveViewportRepaint,
        scheduleBoundedGpuRecoverRef,
        scheduleBoundedFitRepaintRef,
        scheduleWorkspaceShowRecoveryRef,
      } = ctxRef.current;
      const term = termRef.current;
      if (!term || webglAddonRef.current) return false;
      if (
        shouldBlockV2WebglRecovery({
          isEngineV2: isEngineV2Ref.current,
          webglFallback: webglFallbackRef.current,
        })
      ) {
        return false;
      }
      if (
        !shouldAttachWebglRenderer({ operationalRendererMode: operationalRendererModeRef.current })
      ) {
        return false;
      }
      if (!isVisibleInLayoutRef.current) {
        pendingWebglRecoveryRef.current = true;
        return false;
      }
      if (!isTerminalRendererReady(term)) return false;

      try {
        const { WebglAddon: WebglAddonCtor } = await import('xterm-addon-webgl');
        if (!termRef.current || webglAddonRef.current) return false;

        const webglAddon = new WebglAddonCtor();
        webglAddonRef.current = webglAddon;

        if (typeof webglAddon.onContextLoss === 'function') {
          webglAddon.onContextLoss(() => handleWebglContextLossRef.current?.());
        }

        termRef.current.loadAddon(webglAddon);
        setWebglFallback(null);
        pendingWebglRecoveryRef.current = false;
        webglReleasedOnLayoutHideRef.current = false;

        const colsBefore = Number(termRef.current.cols ?? 0);
        const rowsBefore = Number(termRef.current.rows ?? 0);
        const proposedDims = proposeTerminalViewportDimensions({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
        });
        const viewportUnchanged =
          skipFitWhenUnchanged &&
          colsBefore > 0 &&
          rowsBefore > 0 &&
          proposedDims?.cols === colsBefore &&
          proposedDims?.rows === rowsBefore;

        if (viewportUnchanged) {
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        } else {
          fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas,
            lastPtySizeRef: lastPtySizeRef.current,
            skipPtyNotify:
              tuiSessionActiveRef.current ||
              shouldSkipKimiTuiPtyResize({
                initialCommand,
                hasConnectedOnce: hasConnectedOnceRef.current,
                kimiReady: kimiReadyNotifiedRef.current,
              }),
          });
          stabilizeTerminalRenderer(termRef.current, { clearAtlas });
        }
        cliLog(`CLIENT:${id}`, 'WebGL addon reattached after context loss');
        return true;
      } catch (error) {
        console.warn(
          `[TTY:${id}] WebGL reattach failed, staying on DOM renderer`,
          error?.message || error
        );
        pendingWebglRecoveryRef.current = true;
        return false;
      }
    },
    [ctxRef]
  );

  const scheduleWebglRecovery = useCallback(
    (delayMs = 400, { clearAtlas = true } = {}) => {
      const {
        id,
        initialCommand,
        termRef,
        fitRef,
        containerRef,
        wsRef,
        webglAddonRef,
        canvasAddonRef,
        webglFallbackRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        webglRecoveryTimerRef,
        isEngineV2Ref,
        isVisibleInLayoutRef,
        isActivePanelRef,
        operationalRendererModeRef,
        visibleTerminalPanelCountRef,
        lastPtySizeRef,
        tuiSessionActiveRef,
        kimiReadyNotifiedRef,
        hasConnectedOnceRef,
        handleWebglContextLossRef,
        setWebglFallback,
        buildViewportSnapshot,
        scheduleInactiveViewportRepaint,
        scheduleBoundedGpuRecoverRef,
        scheduleBoundedFitRepaintRef,
        scheduleWorkspaceShowRecoveryRef,
      } = ctxRef.current;
      if (
        shouldBlockV2WebglRecovery({
          isEngineV2: isEngineV2Ref.current,
          webglFallback: webglFallbackRef.current,
        })
      ) {
        return;
      }
      if (webglRecoveryTimerRef.current) {
        clearTimeout(webglRecoveryTimerRef.current);
      }
      webglRecoveryTimerRef.current = setTimeout(() => {
        webglRecoveryTimerRef.current = null;
        void tryReattachWebglAddon({ clearAtlas });
      }, delayMs);
    },
    [ctxRef]
  );

  const handleWebglContextLoss = useCallback(() => {
    const {
      id,
      initialCommand,
      termRef,
      fitRef,
      containerRef,
      wsRef,
      webglAddonRef,
      canvasAddonRef,
      webglFallbackRef,
      pendingWebglRecoveryRef,
      webglReleasedOnLayoutHideRef,
      canvasReleasedOnLayoutHideRef,
      webglRecoveryTimerRef,
      isEngineV2Ref,
      isVisibleInLayoutRef,
      isActivePanelRef,
      operationalRendererModeRef,
      visibleTerminalPanelCountRef,
      lastPtySizeRef,
      tuiSessionActiveRef,
      kimiReadyNotifiedRef,
      hasConnectedOnceRef,
      handleWebglContextLossRef,
      setWebglFallback,
      buildViewportSnapshot,
      scheduleInactiveViewportRepaint,
      scheduleBoundedGpuRecoverRef,
      scheduleBoundedFitRepaintRef,
      scheduleWorkspaceShowRecoveryRef,
    } = ctxRef.current;
    const addon = webglAddonRef.current;
    console.warn(`[TTY:${id}] WebGL context lost — falling back to DOM renderer`);
    cliLog(
      `RENDER:${id}`,
      'webgl-context-lost-dom-fallback',
      buildViewportSnapshot('webgl-context-lost')
    );

    try {
      addon?.dispose?.();
    } catch {
      // Ignore double dispose
    }
    webglAddonRef.current = null;

    stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });

    // Phase 5 terminal-engine-v2: stay on DOM permanently — no WebGL recovery
    // timers, bounded GPU retries, or survivor-recovery repaints.
    if (isEngineV2Ref.current) {
      const fallback = {
        active: true,
        reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_LOST,
      };
      // Ref-only: WEBGL_CONTEXT_LOST does not block the viewport for v2, and
      // calling setWebglFallback here would re-run the xterm boot effect (via
      // coalescedSoftGpuVisibilityReveal identity churn) and tear down the live
      // surface we are keeping on DOM.
      webglFallbackRef.current = fallback;
      pendingWebglRecoveryRef.current = false;
      return;
    }

    setWebglFallback(null);
    pendingWebglRecoveryRef.current = true;

    if (isVisibleInLayoutRef.current) {
      scheduleWebglRecovery();
      scheduleBoundedGpuRecoverRef.current?.(40);
      scheduleBoundedFitRepaintRef.current?.(40);
      scheduleWorkspaceShowRecoveryRef.current?.(WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON);
      if (!isActivePanelRef.current) {
        scheduleInactiveViewportRepaint();
      }
    }
  }, [ctxRef]);

  useEffect(() => {
    const ref = ctxRef.current?.handleWebglContextLossRef;
    if (ref) ref.current = handleWebglContextLoss;
  }, [ctxRef, handleWebglContextLoss]);

  return {
    disposeWebglAddonForContextLoss,
    tryReattachWebglAddon,
    tryReattachCanvasAddon,
    releaseCanvasAddon,
    scheduleWebglRecovery,
    handleWebglContextLoss,
    attachRenderer: tryReattachWebglAddon,
    detachRenderer: releaseCanvasAddon,
    handleContextLoss: handleWebglContextLoss,
  };
}
