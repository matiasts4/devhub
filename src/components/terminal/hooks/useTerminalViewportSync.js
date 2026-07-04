/**
 * useTerminalViewportSync — fit, resize, workspace-show recovery.
 * Extracted from TerminalTTY.jsx (terminal-decompose TTY-8).
 */
/* eslint-disable no-unused-vars -- ctxRef bag destructure */
import { useCallback, useEffect } from 'react';
import { cliLog } from '@/components/terminal/TerminalTTY.helpers';
import { usesLegacyTerminalSurvivorRecovery } from '@/lib/terminal/legacyTerminalSurvivorRecovery';
import {
  fitTerminalViewport,
  proposeTerminalViewportDimensions,
  shouldDeferTerminalConnectUntilViewportFitted,
  resolveColdMountStaggerMs,
  shouldClearAtlasForSplitCanvas,
  shouldSkipKimiTuiPtyResize,
  shouldRefitVisibleInactiveSplitPanel,
  isTerminalRendererReady,
  isWebglAddonContextLost,
  refreshTerminalViewport,
  forceTerminalViewportRepaint,
  stabilizeTerminalRenderer,
  nudgeTerminalPtyResize,
  shouldAttachWebglRenderer,
  shouldAttachCanvasRenderer,
  shouldMountCanvasAddon,
  shouldBlockV2WebglRecovery,
  shouldSkipGpuVisibilityReveal,
  isWorkspaceSurvivorRecoverLayoutReason,
  shouldFreezeKimiTuiViewportOnWorkspaceShow,
  detectKimiReadyFromTerminalBuffer,
  isKimiLaunchCommand,
  shouldFreezeSingleWebglViewportOnWorkspaceShow,
  shouldFreezeDomViewportOnWorkspaceShow,
  shouldSkipRedundantLayoutSettleViewportSync,
  shouldClearGpuAtlasOnWorkspaceShow,
  needsGpuRendererReattach,
  takeHiddenTerminalOutputBuffer,
  chunkTerminalOutputForCatchup,
  shouldDiscardHiddenOutputCatchup,
  terminalBufferHasRenderableContent,
  isKimiTuiLive,
  isTerminalViewportNearBottom,
  prepareActiveTuiTerminalFocus,
  isGrokTuiInitialCommand,
  shouldFreezeDomViewportOnAppResume,
  TERMINAL_SPLIT_WEBGL_PANEL_LIMIT,
  WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON,
} from '@/components/terminal/TerminalTTY.helpers';
import { getTerminalLayoutSettledGeneration } from '@/components/terminal/nativeLayoutSync';

export default function useTerminalViewportSync({ ctxRef }) {
  const waitForVisibleDimensions = useCallback(async () => {
    const c = ctxRef.current;
    const {
      id,
      cwd,
      initialCommand,
      autoFocus,
      coldMountOrdinal,
      restored,
      termRef,
      fitRef,
      containerRef,
      wsRef,
      rafRef,
      timeoutRef,
      isDisposingRef,
      isActivePanelRef,
      isVisibleInLayoutRef,
      operationalRendererModeRef,
      visibleTerminalPanelCountRef,
      lastPtySizeRef,
      connectPendingUntilFitRef,
      connectDeferTimerRef,
      connectRef,
      sessionClosingRef,
      hasConnectedOnceRef,
      needsViewportSyncOnShowRef,
      layoutChurnedWhileHiddenRef,
      layoutHiddenGenerationRef,
      containerWasZeroSizedOnShowRef,
      workspaceShowRecoverTimerRef,
      workspaceShowZeroSizeObserverRef,
      inactiveRepaintRafRef,
      pendingWebglRecoveryRef,
      webglReleasedOnLayoutHideRef,
      canvasReleasedOnLayoutHideRef,
      hiddenOutputBufferRef,
      hiddenOutputCatchupPendingRef,
      sessionReattachedRef,
      tuiSessionActiveRef,
      kimiReadyNotifiedRef,
      isEngineV2Ref,
      webglFallbackRef,
      webglAddonRef,
      canvasAddonRef,
      viewportFitConfirmedRef,
      lastViewportReadyPostedRef,
      hasSentInitialCommand,
      isGrokSessionRef,
      clearTimers,
      clearConnectDeferTimer,
      scheduleConnectDeferForce,
      sendResizeRef,
      tryReattachWebglAddonRef,
      tryReattachCanvasAddonRef,
      syncTerminalViewportOnWorkspaceShowRef,
      scheduleWorkspaceShowRecoveryRef,
      reactivateTerminalViewportRef,
      notifyViewportReady,
      restoreInitialCommandDispatchGuard,
      scheduleInitialCommandAfterViewport,
      logViewportDiagnostic,
      scrollTerminalToBottom,
      scrollIfActivePanel,
      disposeWebglAddonForContextLoss,
      scheduleWebglRecovery,
      coalescedForceRepaint,
      confirmViewportFit,
      maybeConnectAfterViewportFit,
      fitAndResize,
      scheduleInactiveViewportRepaint,
      syncTerminalViewportOnWorkspaceShow,
      scheduleWorkspaceShowRecovery,
      sendResize,
      reactivateTerminalViewport,
      scheduleBoundedGpuRecover,
      scheduleBoundedFitRepaint,
      scheduleBoundedForceRepaint,
      buildViewportSnapshot,
    } = c;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const container = containerRef.current;
      if (!container) return false;

      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && document.visibilityState !== 'hidden') {
        return true;
      }

      await new Promise((resolve) => {
        rafRef.current = requestAnimationFrame(() => {
          timeoutRef.current = setTimeout(resolve, 16);
        });
      });
    }

    const rect = containerRef.current?.getBoundingClientRect();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  }, [ctxRef]);

  const confirmViewportFit = useCallback(
    (cols, rows) => {
      const c = ctxRef.current;
      const {
        id,
        cwd,
        initialCommand,
        autoFocus,
        coldMountOrdinal,
        restored,
        termRef,
        fitRef,
        containerRef,
        wsRef,
        rafRef,
        timeoutRef,
        isDisposingRef,
        isActivePanelRef,
        isVisibleInLayoutRef,
        operationalRendererModeRef,
        visibleTerminalPanelCountRef,
        lastPtySizeRef,
        connectPendingUntilFitRef,
        connectDeferTimerRef,
        connectRef,
        sessionClosingRef,
        hasConnectedOnceRef,
        needsViewportSyncOnShowRef,
        layoutChurnedWhileHiddenRef,
        layoutHiddenGenerationRef,
        containerWasZeroSizedOnShowRef,
        workspaceShowRecoverTimerRef,
        workspaceShowZeroSizeObserverRef,
        inactiveRepaintRafRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        hiddenOutputBufferRef,
        hiddenOutputCatchupPendingRef,
        sessionReattachedRef,
        tuiSessionActiveRef,
        kimiReadyNotifiedRef,
        isEngineV2Ref,
        webglFallbackRef,
        webglAddonRef,
        canvasAddonRef,
        viewportFitConfirmedRef,
        lastViewportReadyPostedRef,
        hasSentInitialCommand,
        isGrokSessionRef,
        clearTimers,
        clearConnectDeferTimer,
        scheduleConnectDeferForce,
        sendResizeRef,
        tryReattachWebglAddonRef,
        tryReattachCanvasAddonRef,
        syncTerminalViewportOnWorkspaceShowRef,
        scheduleWorkspaceShowRecoveryRef,
        reactivateTerminalViewportRef,
        notifyViewportReady,
        restoreInitialCommandDispatchGuard,
        scheduleInitialCommandAfterViewport,
        logViewportDiagnostic,
        scrollTerminalToBottom,
        scrollIfActivePanel,
        disposeWebglAddonForContextLoss,
        scheduleWebglRecovery,
        coalescedForceRepaint,
        confirmViewportFit,
        maybeConnectAfterViewportFit,
        fitAndResize,
        scheduleInactiveViewportRepaint,
        syncTerminalViewportOnWorkspaceShow,
        scheduleWorkspaceShowRecovery,
        sendResize,
        reactivateTerminalViewport,
        scheduleBoundedGpuRecover,
        scheduleBoundedFitRepaint,
        scheduleBoundedForceRepaint,
        buildViewportSnapshot,
      } = c;
      if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return;
      viewportFitConfirmedRef.current = true;

      const lastPosted = lastViewportReadyPostedRef.current;
      const sizeChanged = lastPosted.cols !== cols || lastPosted.rows !== rows;
      if (sizeChanged) {
        notifyViewportReady(cols, rows);
      }

      restoreInitialCommandDispatchGuard();
      if (!hasSentInitialCommand.current) {
        scheduleInitialCommandAfterViewport();
      }
    },
    [ctxRef]
  );

  const maybeConnectAfterViewportFit = useCallback(
    (fitWorked) => {
      const c = ctxRef.current;
      const {
        id,
        cwd,
        initialCommand,
        autoFocus,
        coldMountOrdinal,
        restored,
        termRef,
        fitRef,
        containerRef,
        wsRef,
        rafRef,
        timeoutRef,
        isDisposingRef,
        isActivePanelRef,
        isVisibleInLayoutRef,
        operationalRendererModeRef,
        visibleTerminalPanelCountRef,
        lastPtySizeRef,
        connectPendingUntilFitRef,
        connectDeferTimerRef,
        connectRef,
        sessionClosingRef,
        hasConnectedOnceRef,
        needsViewportSyncOnShowRef,
        layoutChurnedWhileHiddenRef,
        layoutHiddenGenerationRef,
        containerWasZeroSizedOnShowRef,
        workspaceShowRecoverTimerRef,
        workspaceShowZeroSizeObserverRef,
        inactiveRepaintRafRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        hiddenOutputBufferRef,
        hiddenOutputCatchupPendingRef,
        sessionReattachedRef,
        tuiSessionActiveRef,
        kimiReadyNotifiedRef,
        isEngineV2Ref,
        webglFallbackRef,
        webglAddonRef,
        canvasAddonRef,
        viewportFitConfirmedRef,
        lastViewportReadyPostedRef,
        hasSentInitialCommand,
        isGrokSessionRef,
        clearTimers,
        clearConnectDeferTimer,
        scheduleConnectDeferForce,
        sendResizeRef,
        tryReattachWebglAddonRef,
        tryReattachCanvasAddonRef,
        syncTerminalViewportOnWorkspaceShowRef,
        scheduleWorkspaceShowRecoveryRef,
        reactivateTerminalViewportRef,
        notifyViewportReady,
        restoreInitialCommandDispatchGuard,
        scheduleInitialCommandAfterViewport,
        logViewportDiagnostic,
        scrollTerminalToBottom,
        scrollIfActivePanel,
        disposeWebglAddonForContextLoss,
        scheduleWebglRecovery,
        coalescedForceRepaint,
        confirmViewportFit,
        maybeConnectAfterViewportFit,
        fitAndResize,
        scheduleInactiveViewportRepaint,
        syncTerminalViewportOnWorkspaceShow,
        scheduleWorkspaceShowRecovery,
        sendResize,
        reactivateTerminalViewport,
        scheduleBoundedGpuRecover,
        scheduleBoundedFitRepaint,
        scheduleBoundedForceRepaint,
        buildViewportSnapshot,
      } = c;
      if (!fitWorked || !termRef.current || !containerRef.current) {
        if (!hasConnectedOnceRef.current) {
          connectPendingUntilFitRef.current = true;
          scheduleConnectDeferForce();
        }
        return false;
      }

      const rect = containerRef.current.getBoundingClientRect();
      if (
        shouldDeferTerminalConnectUntilViewportFitted({
          ready: true,
          fitWorked,
          containerRect: rect,
          term: termRef.current,
          hasConnectedOnce: hasConnectedOnceRef.current,
        })
      ) {
        if (!hasConnectedOnceRef.current) {
          connectPendingUntilFitRef.current = true;
          scheduleConnectDeferForce();
        }
        return false;
      }

      clearConnectDeferTimer();
      connectPendingUntilFitRef.current = false;
      if (!hasConnectedOnceRef.current || wsRef.current?.readyState !== WebSocket.OPEN) {
        const staggerMs = resolveColdMountStaggerMs({
          coldMountOrdinal,
          isVisibleInLayout: isVisibleInLayoutRef.current,
        });
        if (staggerMs > 0 && !hasConnectedOnceRef.current) {
          connectDeferTimerRef.current = setTimeout(() => {
            connectDeferTimerRef.current = null;
            if (!hasConnectedOnceRef.current && !sessionClosingRef.current) {
              connectRef.current?.();
            }
          }, staggerMs);
        } else {
          connectRef.current?.();
        }
      }
      return true;
    },
    [ctxRef]
  );

  const fitAndResize = useCallback(
    (options = {}) => {
      const c = ctxRef.current;
      const {
        id,
        cwd,
        initialCommand,
        autoFocus,
        coldMountOrdinal,
        restored,
        termRef,
        fitRef,
        containerRef,
        wsRef,
        rafRef,
        timeoutRef,
        isDisposingRef,
        isActivePanelRef,
        isVisibleInLayoutRef,
        operationalRendererModeRef,
        visibleTerminalPanelCountRef,
        lastPtySizeRef,
        connectPendingUntilFitRef,
        connectDeferTimerRef,
        connectRef,
        sessionClosingRef,
        hasConnectedOnceRef,
        needsViewportSyncOnShowRef,
        layoutChurnedWhileHiddenRef,
        layoutHiddenGenerationRef,
        containerWasZeroSizedOnShowRef,
        workspaceShowRecoverTimerRef,
        workspaceShowZeroSizeObserverRef,
        inactiveRepaintRafRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        hiddenOutputBufferRef,
        hiddenOutputCatchupPendingRef,
        sessionReattachedRef,
        tuiSessionActiveRef,
        kimiReadyNotifiedRef,
        isEngineV2Ref,
        webglFallbackRef,
        webglAddonRef,
        canvasAddonRef,
        viewportFitConfirmedRef,
        lastViewportReadyPostedRef,
        hasSentInitialCommand,
        isGrokSessionRef,
        clearTimers,
        clearConnectDeferTimer,
        scheduleConnectDeferForce,
        sendResizeRef,
        tryReattachWebglAddonRef,
        tryReattachCanvasAddonRef,
        syncTerminalViewportOnWorkspaceShowRef,
        scheduleWorkspaceShowRecoveryRef,
        reactivateTerminalViewportRef,
        notifyViewportReady,
        restoreInitialCommandDispatchGuard,
        scheduleInitialCommandAfterViewport,
        logViewportDiagnostic,
        scrollTerminalToBottom,
        scrollIfActivePanel,
        disposeWebglAddonForContextLoss,
        scheduleWebglRecovery,
        coalescedForceRepaint,
        confirmViewportFit,
        maybeConnectAfterViewportFit,
        fitAndResize,
        scheduleInactiveViewportRepaint,
        syncTerminalViewportOnWorkspaceShow,
        scheduleWorkspaceShowRecovery,
        sendResize,
        reactivateTerminalViewport,
        scheduleBoundedGpuRecover,
        scheduleBoundedFitRepaint,
        scheduleBoundedForceRepaint,
        buildViewportSnapshot,
      } = c;
      // Never fit/resize while the runtime is being disposed: the WebGL/Canvas
      // addon's renderer slot may be half-cleared (A.4 guard).
      if (isDisposingRef.current) {
        logViewportDiagnostic('fit-skip');
        return false;
      }
      const clearAtlas =
        options.clearAtlas ??
        (isActivePanelRef.current ||
          shouldClearAtlasForSplitCanvas({
            operationalRendererMode: operationalRendererModeRef.current,
            visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
          }));
      const fitWorked = fitTerminalViewport({
        container: containerRef.current,
        fitAddon: fitRef.current,
        term: termRef.current,
        socket: wsRef.current,
        clearAtlas,
        lastPtySizeRef: lastPtySizeRef.current,
        skipPtyNotify:
          options.skipPtyNotify ??
          (hasConnectedOnceRef.current &&
            (tuiSessionActiveRef.current ||
              shouldSkipKimiTuiPtyResize({
                initialCommand,
                hasConnectedOnce: hasConnectedOnceRef.current,
                kimiReady: kimiReadyNotifiedRef.current,
              })) &&
            !options.forcePtyResize),
      });

      if (fitWorked && termRef.current) {
        confirmViewportFit(termRef.current.cols, termRef.current.rows);
      }

      if (connectPendingUntilFitRef.current) {
        maybeConnectAfterViewportFit(fitWorked);
      }

      logViewportDiagnostic(fitWorked ? 'fit-resize' : 'fit-skipped');
      return fitWorked;
    },
    [ctxRef]
  );

  const scheduleInactiveViewportRepaint = useCallback(() => {
    const c = ctxRef.current;
    const {
      id,
      cwd,
      initialCommand,
      autoFocus,
      coldMountOrdinal,
      restored,
      termRef,
      fitRef,
      containerRef,
      wsRef,
      rafRef,
      timeoutRef,
      isDisposingRef,
      isActivePanelRef,
      isVisibleInLayoutRef,
      operationalRendererModeRef,
      visibleTerminalPanelCountRef,
      lastPtySizeRef,
      connectPendingUntilFitRef,
      connectDeferTimerRef,
      connectRef,
      sessionClosingRef,
      hasConnectedOnceRef,
      needsViewportSyncOnShowRef,
      layoutChurnedWhileHiddenRef,
      layoutHiddenGenerationRef,
      containerWasZeroSizedOnShowRef,
      workspaceShowRecoverTimerRef,
      workspaceShowZeroSizeObserverRef,
      inactiveRepaintRafRef,
      pendingWebglRecoveryRef,
      webglReleasedOnLayoutHideRef,
      canvasReleasedOnLayoutHideRef,
      hiddenOutputBufferRef,
      hiddenOutputCatchupPendingRef,
      sessionReattachedRef,
      tuiSessionActiveRef,
      kimiReadyNotifiedRef,
      isEngineV2Ref,
      webglFallbackRef,
      webglAddonRef,
      canvasAddonRef,
      viewportFitConfirmedRef,
      lastViewportReadyPostedRef,
      hasSentInitialCommand,
      isGrokSessionRef,
      clearTimers,
      clearConnectDeferTimer,
      scheduleConnectDeferForce,
      sendResizeRef,
      tryReattachWebglAddonRef,
      tryReattachCanvasAddonRef,
      syncTerminalViewportOnWorkspaceShowRef,
      scheduleWorkspaceShowRecoveryRef,
      reactivateTerminalViewportRef,
      notifyViewportReady,
      restoreInitialCommandDispatchGuard,
      scheduleInitialCommandAfterViewport,
      logViewportDiagnostic,
      scrollTerminalToBottom,
      scrollIfActivePanel,
      disposeWebglAddonForContextLoss,
      scheduleWebglRecovery,
      coalescedForceRepaint,
      confirmViewportFit,
      maybeConnectAfterViewportFit,
      fitAndResize,
      scheduleInactiveViewportRepaint,
      syncTerminalViewportOnWorkspaceShow,
      scheduleWorkspaceShowRecovery,
      sendResize,
      reactivateTerminalViewport,
      scheduleBoundedGpuRecover,
      scheduleBoundedFitRepaint,
      scheduleBoundedForceRepaint,
      buildViewportSnapshot,
    } = c;
    if (isActivePanelRef.current && isVisibleInLayoutRef.current) return;
    if (!termRef.current) return;
    if (inactiveRepaintRafRef.current) return;

    inactiveRepaintRafRef.current = requestAnimationFrame(() => {
      inactiveRepaintRafRef.current = null;
      if (!isVisibleInLayoutRef.current) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }
      const term = termRef.current;
      const container = containerRef.current;
      const fitAddon = fitRef.current;
      const rect = container?.getBoundingClientRect();
      const splitCanvasClear = shouldClearAtlasForSplitCanvas({
        operationalRendererMode: operationalRendererModeRef.current,
        visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
      });
      let colsBefore = term?.cols;
      let rowsBefore = term?.rows;
      let geometryChanged = false;
      const kimiConnected = shouldSkipKimiTuiPtyResize({
        initialCommand,
        hasConnectedOnce: hasConnectedOnceRef.current,
        kimiReady: kimiReadyNotifiedRef.current,
      });

      if (!rect || rect.width <= 0 || rect.height <= 0) {
        needsViewportSyncOnShowRef.current = true;
        if (workspaceShowRecoverTimerRef.current) {
          clearTimeout(workspaceShowRecoverTimerRef.current);
        }
        workspaceShowRecoverTimerRef.current = window.setTimeout(() => {
          workspaceShowRecoverTimerRef.current = null;
          scheduleInactiveViewportRepaint();
        }, 80);
        return;
      }

      if (!kimiConnected && fitAddon && term) {
        colsBefore = term.cols;
        rowsBefore = term.rows;
        const fitWorked = fitTerminalViewport({
          container,
          fitAddon,
          term,
          socket: wsRef.current,
          clearAtlas: false,
          lastPtySizeRef: lastPtySizeRef.current,
        });
        geometryChanged = fitWorked && (term.cols !== colsBefore || term.rows !== rowsBefore);
        if (fitWorked) {
          confirmViewportFit(term.cols, term.rows);
          if (geometryChanged) {
            nudgeTerminalPtyResize({
              term,
              socket: wsRef.current,
              lastPtySizeRef: lastPtySizeRef.current,
            });
          }
          if (connectPendingUntilFitRef.current) {
            maybeConnectAfterViewportFit(fitWorked);
          }
        }
      }
      if (
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        isWebglAddonContextLost(webglAddonRef.current) &&
        !shouldBlockV2WebglRecovery({
          isEngineV2: isEngineV2Ref.current,
          webglFallback: webglFallbackRef.current,
        })
      ) {
        disposeWebglAddonForContextLoss('inactive-webgl-context-lost');
        void tryReattachWebglAddonRef.current?.({ clearAtlas: true }).then((reattached) => {
          if (reattached && termRef.current && isTerminalRendererReady(termRef.current)) {
            refreshTerminalViewport(termRef.current);
          }
        });
        return;
      }
      if (
        shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        !canvasAddonRef.current
      ) {
        void tryReattachCanvasAddonRef.current?.().then(() => {
          if (termRef.current && isTerminalRendererReady(termRef.current)) {
            refreshTerminalViewport(termRef.current);
          }
        });
        return;
      }
      if (termRef.current && isTerminalRendererReady(termRef.current)) {
        if (geometryChanged) {
          stabilizeTerminalRenderer(termRef.current, {
            clearAtlas: splitCanvasClear,
          });
        }
        refreshTerminalViewport(termRef.current);
        // Same stale-bitmap fix as reactivateTerminalViewport: an inactive split TUI
        // panel whose geometry didn't change won't redraw on OS window restore without
        // a real resize nudge (Bug A).
        if (tuiSessionActiveRef.current) {
          forceTerminalViewportRepaint(termRef.current);
        }
      }
    });
  }, [ctxRef]);

  const syncTerminalViewportOnWorkspaceShow = useCallback(
    async (reason = 'workspace-show', { clearAtlas, forceScroll = true } = {}) => {
      const c = ctxRef.current;
      const {
        id,
        cwd,
        initialCommand,
        autoFocus,
        coldMountOrdinal,
        restored,
        termRef,
        fitRef,
        containerRef,
        wsRef,
        rafRef,
        timeoutRef,
        isDisposingRef,
        isActivePanelRef,
        isVisibleInLayoutRef,
        operationalRendererModeRef,
        visibleTerminalPanelCountRef,
        lastPtySizeRef,
        connectPendingUntilFitRef,
        connectDeferTimerRef,
        connectRef,
        sessionClosingRef,
        hasConnectedOnceRef,
        needsViewportSyncOnShowRef,
        layoutChurnedWhileHiddenRef,
        layoutHiddenGenerationRef,
        containerWasZeroSizedOnShowRef,
        workspaceShowRecoverTimerRef,
        workspaceShowZeroSizeObserverRef,
        inactiveRepaintRafRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        hiddenOutputBufferRef,
        hiddenOutputCatchupPendingRef,
        sessionReattachedRef,
        tuiSessionActiveRef,
        kimiReadyNotifiedRef,
        isEngineV2Ref,
        webglFallbackRef,
        webglAddonRef,
        canvasAddonRef,
        viewportFitConfirmedRef,
        lastViewportReadyPostedRef,
        hasSentInitialCommand,
        isGrokSessionRef,
        clearTimers,
        clearConnectDeferTimer,
        scheduleConnectDeferForce,
        sendResizeRef,
        tryReattachWebglAddonRef,
        tryReattachCanvasAddonRef,
        syncTerminalViewportOnWorkspaceShowRef,
        scheduleWorkspaceShowRecoveryRef,
        reactivateTerminalViewportRef,
        notifyViewportReady,
        restoreInitialCommandDispatchGuard,
        scheduleInitialCommandAfterViewport,
        logViewportDiagnostic,
        scrollTerminalToBottom,
        scrollIfActivePanel,
        disposeWebglAddonForContextLoss,
        scheduleWebglRecovery,
        coalescedForceRepaint,
        confirmViewportFit,
        maybeConnectAfterViewportFit,
        fitAndResize,
        scheduleInactiveViewportRepaint,
        syncTerminalViewportOnWorkspaceShow,
        scheduleWorkspaceShowRecovery,
        sendResize,
        reactivateTerminalViewport,
        scheduleBoundedGpuRecover,
        scheduleBoundedFitRepaint,
        scheduleBoundedForceRepaint,
        buildViewportSnapshot,
      } = c;
      if (isDisposingRef.current) return;
      if (!termRef.current || !fitRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        containerWasZeroSizedOnShowRef.current = true;
        logViewportDiagnostic(`${reason}-skipped-zero-size`);
        needsViewportSyncOnShowRef.current = true;

        // Defensive recovery: the panel container may still be zero-sized because
        // react-resizable-panels has not laid out the right sibling yet. Schedule a
        // bounded retry so we don't rely on a later event that may never fire.
        const scheduleZeroSizeRecovery = ({
          attempt = 1,
          maxAttempts = /workspace-show/.test(reason) ? 12 : 2,
          baseDelayMs = 50,
        } = {}) => {
          if (workspaceShowRecoverTimerRef.current) {
            clearTimeout(workspaceShowRecoverTimerRef.current);
            workspaceShowRecoverTimerRef.current = null;
          }
          if (attempt > maxAttempts) {
            logViewportDiagnostic(`${reason}-zero-size-gave-up`);
            return;
          }
          logViewportDiagnostic(`${reason}-zero-size-retry-scheduled`, { attempt, maxAttempts });
          workspaceShowRecoverTimerRef.current = setTimeout(() => {
            workspaceShowRecoverTimerRef.current = null;
            if (isDisposingRef.current) return;
            if (!isVisibleInLayoutRef.current) {
              needsViewportSyncOnShowRef.current = true;
              return;
            }
            if (!termRef.current || !fitRef.current || !containerRef.current) return;
            const retryRect = containerRef.current.getBoundingClientRect();
            if (!retryRect || retryRect.width <= 0 || retryRect.height <= 0) {
              scheduleZeroSizeRecovery({ attempt: attempt + 1, maxAttempts, baseDelayMs });
              return;
            }
            void syncTerminalViewportOnWorkspaceShowRef.current?.(`${reason}-zero-size-recovered`, {
              clearAtlas,
            });
          }, baseDelayMs * attempt);
        };

        if (
          typeof ResizeObserver !== 'undefined' &&
          containerRef.current &&
          !workspaceShowZeroSizeObserverRef.current
        ) {
          const observed = containerRef.current;
          workspaceShowZeroSizeObserverRef.current = new ResizeObserver((entries) => {
            const entry = entries[0];
            const width = entry?.contentRect?.width ?? 0;
            const height = entry?.contentRect?.height ?? 0;
            if (width <= 0 || height <= 0) return;
            workspaceShowZeroSizeObserverRef.current?.disconnect();
            workspaceShowZeroSizeObserverRef.current = null;
            if (workspaceShowRecoverTimerRef.current) {
              clearTimeout(workspaceShowRecoverTimerRef.current);
              workspaceShowRecoverTimerRef.current = null;
            }
            void syncTerminalViewportOnWorkspaceShowRef.current?.(
              `${reason}-resize-observer-recovered`,
              { clearAtlas }
            );
          });
          workspaceShowZeroSizeObserverRef.current.observe(observed);
        }

        scheduleZeroSizeRecovery();
        return;
      }

      const recoveredFromZeroSizeThisPass = containerWasZeroSizedOnShowRef.current;
      containerWasZeroSizedOnShowRef.current = false;

      const colsBefore = Number(termRef.current.cols ?? 0);
      const rowsBefore = Number(termRef.current.rows ?? 0);
      const proposedDims = proposeTerminalViewportDimensions({
        container: containerRef.current,
        fitAddon: fitRef.current,
        term: termRef.current,
      });
      const proposedDimsMatch =
        proposedDims && proposedDims.cols === colsBefore && proposedDims.rows === rowsBefore;
      const sizeUnchanged =
        ((lastPtySizeRef.current.cols === colsBefore &&
          lastPtySizeRef.current.rows === rowsBefore) ||
          proposedDimsMatch) &&
        colsBefore > 0 &&
        rowsBefore > 0;
      const isDeferredShowPass = /workspace-show-(settled|recover|raf)/.test(reason);
      // When the GPU addon stayed attached (workspace switch with no release),
      // the first 'workspace-show-layout' pass is also safe to skip if dims are
      // unchanged. This removes a forced fit+repaint that caused visible flicker.
      const noGpuRecoveryPending =
        !pendingWebglRecoveryRef.current &&
        !canvasReleasedOnLayoutHideRef.current &&
        !webglReleasedOnLayoutHideRef.current;
      const isSurvivorRecover = isWorkspaceSurvivorRecoverLayoutReason(reason);
      const isLayoutSettledImmediate =
        String(reason).startsWith('layout-settled-') && String(reason).endsWith('-immediate');
      // Window-switch survivors actually toggled visibility; keep the recovery pass
      // non-skippable so the destination panel repaints. Workspace removals that
      // did not release the GPU and left dims untouched can skip the heavy burst.
      const isWindowSwitchRecover = String(reason).includes('workspace-window');
      if (
        shouldSkipGpuVisibilityReveal({
          reason,
          noGpuRecoveryPending,
          sizeUnchanged,
          proposedDimsMatch,
          hiddenOutputCatchupPending: hiddenOutputCatchupPendingRef.current,
          operationalRendererMode: operationalRendererModeRef.current,
        })
      ) {
        needsViewportSyncOnShowRef.current = false;
        logViewportDiagnostic(`${reason}-skipped-gpu-visibility-reveal`);
        return;
      }
      const canSkipUnchanged =
        isDeferredShowPass ||
        (reason === 'workspace-show-layout' && noGpuRecoveryPending) ||
        ((isSurvivorRecover || isLayoutSettledImmediate) &&
          noGpuRecoveryPending &&
          !isWindowSwitchRecover) ||
        // Option B keep-alive: if the GPU addon never detached and the geometry
        // did not change, the bitmap is still valid. Skip fit/refresh/force
        // repaint entirely — this removes the remaining flicker on the happy
        // path while leaving the heavy recovery path intact for real churn.
        // Live TUIs (OpenCode/Grok/etc.) still need at least a soft reveal with
        // a SIGWINCH nudge so they do not think the session hung and restart.
        (noGpuRecoveryPending &&
          sizeUnchanged &&
          proposedDimsMatch &&
          !hiddenOutputCatchupPendingRef.current &&
          !recoveredFromZeroSizeThisPass &&
          !tuiSessionActiveRef.current);
      if (
        canSkipUnchanged &&
        sizeUnchanged &&
        noGpuRecoveryPending &&
        !shouldFreezeKimiTuiViewportOnWorkspaceShow({
          initialCommand,
          kimiReady: kimiReadyNotifiedRef.current,
          proposedDimsMatch,
        })
      ) {
        logViewportDiagnostic(`${reason}-skipped-unchanged`);
        return;
      }

      if (!kimiReadyNotifiedRef.current && termRef.current) {
        const isKimiLaunch = isKimiLaunchCommand(initialCommand);
        if (isKimiLaunch || detectKimiReadyFromTerminalBuffer(termRef.current)) {
          kimiReadyNotifiedRef.current = true;
        }
      }

      if (
        shouldFreezeKimiTuiViewportOnWorkspaceShow({
          initialCommand,
          kimiReady: kimiReadyNotifiedRef.current,
          proposedDimsMatch,
        })
      ) {
        needsViewportSyncOnShowRef.current = false;
        logViewportDiagnostic(`${reason}-frozen-kimi-tui`);
        stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        if (hiddenOutputCatchupPendingRef.current && termRef.current) {
          const buffered = takeHiddenTerminalOutputBuffer(hiddenOutputBufferRef.current);
          hiddenOutputCatchupPendingRef.current = false;
          if (buffered) {
            for (const chunk of chunkTerminalOutputForCatchup(buffered)) {
              termRef.current.write(chunk);
            }
            stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
          }
        }
        if (pendingWebglRecoveryRef.current && !webglAddonRef.current) {
          await tryReattachWebglAddonRef.current?.({
            clearAtlas: false,
            skipFitWhenUnchanged: true,
          });
        } else if (
          webglReleasedOnLayoutHideRef.current &&
          shouldAttachWebglRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          })
        ) {
          await tryReattachWebglAddonRef.current?.({
            clearAtlas: false,
            skipFitWhenUnchanged: true,
          });
        } else if (
          canvasReleasedOnLayoutHideRef.current &&
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          })
        ) {
          await tryReattachCanvasAddonRef.current?.();
        } else {
          fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: false,
            lastPtySizeRef: lastPtySizeRef.current,
            skipPtyNotify: true,
          });
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        }

        // If this panel just recovered from a zero-sized container, nudge the
        // viewport without notifying the PTY. This forces xterm to repaint with
        // real dimensions without sending SIGWINCH to Kimi's Ink TUI.
        if (
          recoveredFromZeroSizeThisPass &&
          termRef.current &&
          containerRef.current &&
          fitRef.current
        ) {
          logViewportDiagnostic(`${reason}-kimi-viewport-fit-probe`);
          fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: false,
            lastPtySizeRef: lastPtySizeRef.current,
            skipPtyNotify: true,
          });
        }

        if (termRef.current && isTerminalRendererReady(termRef.current)) {
          refreshTerminalViewport(termRef.current);
          coalescedForceRepaint(termRef.current, { reason });
        }
        return;
      }

      if (
        shouldFreezeSingleWebglViewportOnWorkspaceShow({
          reason,
          sizeUnchanged,
          operationalRendererMode: operationalRendererModeRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
          proposedDimsMatch,
        })
      ) {
        needsViewportSyncOnShowRef.current = false;
        logViewportDiagnostic(`${reason}-frozen-single-webgl`);
        if (pendingWebglRecoveryRef.current && !webglAddonRef.current) {
          await tryReattachWebglAddonRef.current?.({
            clearAtlas: false,
            skipFitWhenUnchanged: true,
          });
        } else if (
          webglReleasedOnLayoutHideRef.current &&
          shouldAttachWebglRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          })
        ) {
          await tryReattachWebglAddonRef.current?.({
            clearAtlas: true,
            skipFitWhenUnchanged: true,
          });
        } else if (
          canvasReleasedOnLayoutHideRef.current &&
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          })
        ) {
          await tryReattachCanvasAddonRef.current?.();
        } else {
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        }
        if (termRef.current && isTerminalRendererReady(termRef.current)) {
          refreshTerminalViewport(termRef.current);
          const skipForceRepaintOnReveal =
            reason === 'workspace-show-visible' &&
            !pendingWebglRecoveryRef.current &&
            !webglReleasedOnLayoutHideRef.current &&
            !canvasReleasedOnLayoutHideRef.current;
          if (!skipForceRepaintOnReveal) {
            coalescedForceRepaint(termRef.current, { reason });
          }
        }
        return;
      }

      if (
        shouldFreezeDomViewportOnWorkspaceShow({
          reason,
          sizeUnchanged,
          operationalRendererMode: operationalRendererModeRef.current,
          tuiSessionActive: tuiSessionActiveRef.current,
          proposedDimsMatch,
        })
      ) {
        needsViewportSyncOnShowRef.current = false;
        logViewportDiagnostic(`${reason}-frozen-dom-tui`);
        fitTerminalViewport({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
          socket: wsRef.current,
          clearAtlas: false,
          lastPtySizeRef: lastPtySizeRef.current,
          skipPtyNotify: true,
        });
        stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        refreshTerminalViewport(termRef.current);
        if (termRef.current && isTerminalRendererReady(termRef.current)) {
          coalescedForceRepaint(termRef.current, { reason });
        }
        return;
      }

      // If the container was zero-sized earlier in this show transition, force a
      // real viewport sync now that it finally has dimensions. Otherwise the
      // redundant-skip guard can leave a blank panel forever.
      const recoveredFromZeroSize = containerWasZeroSizedOnShowRef.current;

      if (
        shouldSkipRedundantLayoutSettleViewportSync({
          reason,
          sizeUnchanged,
          pendingWebglRecovery: pendingWebglRecoveryRef.current,
          canvasReleasedOnLayoutHide: canvasReleasedOnLayoutHideRef.current,
          hasGpuRenderer: Boolean(webglAddonRef.current || canvasAddonRef.current),
        }) &&
        proposedDimsMatch &&
        !hiddenOutputCatchupPendingRef.current &&
        !recoveredFromZeroSize
      ) {
        needsViewportSyncOnShowRef.current = false;
        logViewportDiagnostic(`${reason}-skipped-unchanged-dims`);
        stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        return;
      }

      needsViewportSyncOnShowRef.current = false;
      logViewportDiagnostic(reason);

      const shouldClearAtlas =
        clearAtlas ??
        shouldClearGpuAtlasOnWorkspaceShow({
          operationalRendererMode: operationalRendererModeRef.current,
          reason,
          canvasReleasedOnLayoutHide: canvasReleasedOnLayoutHideRef.current,
        });

      let fitWorked = false;

      if (
        webglReleasedOnLayoutHideRef.current &&
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        })
      ) {
        fitWorked = await tryReattachWebglAddonRef.current?.({ clearAtlas: shouldClearAtlas });
      } else if (
        canvasReleasedOnLayoutHideRef.current &&
        shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        })
      ) {
        fitWorked = await tryReattachCanvasAddonRef.current?.();
      } else {
        if (shouldClearAtlas && canvasReleasedOnLayoutHideRef.current) {
          canvasReleasedOnLayoutHideRef.current = false;
        }

        fitWorked = fitTerminalViewport({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
          socket: wsRef.current,
          clearAtlas: shouldClearAtlas,
          lastPtySizeRef: lastPtySizeRef.current,
        });

        stabilizeTerminalRenderer(termRef.current, { clearAtlas: shouldClearAtlas });

        if (fitWorked && termRef.current) {
          confirmViewportFit(termRef.current.cols, termRef.current.rows);
        }
      }

      const kimiTuiLive = isKimiTuiLive({
        initialCommand,
        kimiReady: kimiReadyNotifiedRef.current,
      });

      if (fitWorked && isActivePanelRef.current && !kimiTuiLive) {
        scrollTerminalToBottom(forceScroll);
      }

      if (
        isActivePanelRef.current &&
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        (pendingWebglRecoveryRef.current || !webglAddonRef.current) &&
        !shouldBlockV2WebglRecovery({
          isEngineV2: isEngineV2Ref.current,
          webglFallback: webglFallbackRef.current,
        })
      ) {
        scheduleWebglRecovery(80, { clearAtlas: false });
      }

      if (
        shouldMountCanvasAddon({
          operationalRendererMode: operationalRendererModeRef.current,
          isActivePanel: isActivePanelRef.current,
          isVisibleInLayout: isVisibleInLayoutRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
        }) &&
        !canvasAddonRef.current
      ) {
        await tryReattachCanvasAddonRef.current?.();
      }

      if (hiddenOutputCatchupPendingRef.current && termRef.current) {
        const buffered = takeHiddenTerminalOutputBuffer(hiddenOutputBufferRef.current);
        hiddenOutputCatchupPendingRef.current = false;
        if (buffered) {
          const discardCatchup = shouldDiscardHiddenOutputCatchup({
            bufferedBytes: buffered.length,
            sessionReattached: sessionReattachedRef.current,
            tuiSessionActive: tuiSessionActiveRef.current,
            bufferText: buffered,
            termHasContent: terminalBufferHasRenderableContent(termRef.current),
          });
          if (discardCatchup) {
            const discardBecauseTermHasContent =
              terminalBufferHasRenderableContent(termRef.current) &&
              !sessionReattachedRef.current &&
              !tuiSessionActiveRef.current;
            if (
              !discardBecauseTermHasContent &&
              !shouldSkipKimiTuiPtyResize({
                initialCommand,
                hasConnectedOnce: hasConnectedOnceRef.current,
                kimiReady: kimiReadyNotifiedRef.current,
              })
            ) {
              nudgeTerminalPtyResize({
                term: termRef.current,
                socket: wsRef.current,
                lastPtySizeRef: lastPtySizeRef.current,
              });
            }
            stabilizeTerminalRenderer(termRef.current, { clearAtlas: true });
            refreshTerminalViewport(termRef.current);
            if (isTerminalRendererReady(termRef.current)) {
              coalescedForceRepaint(termRef.current, { reason: `${reason}-catchup-discard` });
            }
          } else {
            for (const chunk of chunkTerminalOutputForCatchup(buffered)) {
              termRef.current.write(chunk);
            }
            stabilizeTerminalRenderer(termRef.current, { clearAtlas: true });
            refreshTerminalViewport(termRef.current);
            if (isTerminalRendererReady(termRef.current)) {
              coalescedForceRepaint(termRef.current, { reason: `${reason}-catchup-keep` });
            }
            if (tuiSessionActiveRef.current && !kimiTuiLive) {
              nudgeTerminalPtyResize({
                term: termRef.current,
                socket: wsRef.current,
                lastPtySizeRef: lastPtySizeRef.current,
              });
            }
          }
        }
      }

      if (
        fitWorked &&
        visibleTerminalPanelCountRef.current > TERMINAL_SPLIT_WEBGL_PANEL_LIMIT &&
        canvasAddonRef.current &&
        termRef.current &&
        !shouldSkipKimiTuiPtyResize({
          initialCommand,
          hasConnectedOnce: hasConnectedOnceRef.current,
          kimiReady: kimiReadyNotifiedRef.current,
        })
      ) {
        nudgeTerminalPtyResize({
          term: termRef.current,
          socket: wsRef.current,
          lastPtySizeRef: lastPtySizeRef.current,
        });
      }

      // ponytail: force a real canvas repaint, not just term.refresh(). refresh()
      // only marks rows dirty — it does NOT recreate the canvas/webgl bitmap, so a
      // panel that was hidden (or recovered from a zero-sized container) stays black
      // when cols/rows are unchanged. This is the only terminal-ready repaint spot
      // that previously lacked the 1-cell nudge; without it the zero-size-recovery
      // pass (and any general-path show pass) leaves the destination terminal black
      // until a manual resize. See docs/errores/06-terminal-status-and-workspace-switch.
      if (termRef.current && isTerminalRendererReady(termRef.current)) {
        refreshTerminalViewport(termRef.current);
        coalescedForceRepaint(termRef.current, { reason });
      }

      // Panel-close churn can discard the GPU bitmap of a live TUI even when the
      // viewport dimensions never changed. The force repaint above redraws the
      // current xterm buffer, but if the TUI itself needs to repaint (OpenCode,
      // Grok, etc.) we must send a same-dimension SIGWINCH so it emits fresh frames.
      if (
        String(reason).includes('panel-closed') &&
        tuiSessionActiveRef.current &&
        wsRef.current &&
        !shouldSkipKimiTuiPtyResize({
          initialCommand,
          hasConnectedOnce: hasConnectedOnceRef.current,
          kimiReady: kimiReadyNotifiedRef.current,
        })
      ) {
        nudgeTerminalPtyResize({
          term: termRef.current,
          socket: wsRef.current,
          lastPtySizeRef: lastPtySizeRef.current,
          force: true,
        });
      }
    },
    [ctxRef]
  );

  const scheduleWorkspaceShowRecovery = useCallback(
    (layoutReason = 'workspace-show-layout') => {
      const c = ctxRef.current;
      const {
        id,
        cwd,
        initialCommand,
        autoFocus,
        coldMountOrdinal,
        restored,
        termRef,
        fitRef,
        containerRef,
        wsRef,
        rafRef,
        timeoutRef,
        isDisposingRef,
        isActivePanelRef,
        isVisibleInLayoutRef,
        operationalRendererModeRef,
        visibleTerminalPanelCountRef,
        lastPtySizeRef,
        connectPendingUntilFitRef,
        connectDeferTimerRef,
        connectRef,
        sessionClosingRef,
        hasConnectedOnceRef,
        needsViewportSyncOnShowRef,
        layoutChurnedWhileHiddenRef,
        layoutHiddenGenerationRef,
        containerWasZeroSizedOnShowRef,
        workspaceShowRecoverTimerRef,
        workspaceShowZeroSizeObserverRef,
        inactiveRepaintRafRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        hiddenOutputBufferRef,
        hiddenOutputCatchupPendingRef,
        sessionReattachedRef,
        tuiSessionActiveRef,
        kimiReadyNotifiedRef,
        isEngineV2Ref,
        webglFallbackRef,
        webglAddonRef,
        canvasAddonRef,
        viewportFitConfirmedRef,
        lastViewportReadyPostedRef,
        hasSentInitialCommand,
        isGrokSessionRef,
        clearTimers,
        clearConnectDeferTimer,
        scheduleConnectDeferForce,
        sendResizeRef,
        tryReattachWebglAddonRef,
        tryReattachCanvasAddonRef,
        syncTerminalViewportOnWorkspaceShowRef,
        scheduleWorkspaceShowRecoveryRef,
        reactivateTerminalViewportRef,
        notifyViewportReady,
        restoreInitialCommandDispatchGuard,
        scheduleInitialCommandAfterViewport,
        logViewportDiagnostic,
        scrollTerminalToBottom,
        scrollIfActivePanel,
        disposeWebglAddonForContextLoss,
        scheduleWebglRecovery,
        coalescedForceRepaint,
        confirmViewportFit,
        maybeConnectAfterViewportFit,
        fitAndResize,
        scheduleInactiveViewportRepaint,
        syncTerminalViewportOnWorkspaceShow,
        scheduleWorkspaceShowRecovery,
        sendResize,
        reactivateTerminalViewport,
        scheduleBoundedGpuRecover,
        scheduleBoundedFitRepaint,
        scheduleBoundedForceRepaint,
        buildViewportSnapshot,
      } = c;
      if (isDisposingRef.current || !termRef.current) return;
      // Phase 6 terminal-engine-v2: rehydration/graveyard owns show recovery.
      if (!usesLegacyTerminalSurvivorRecovery(isEngineV2Ref.current)) return;

      const survivorRecover = isWorkspaceSurvivorRecoverLayoutReason(layoutReason);
      const gpuShowRecover =
        pendingWebglRecoveryRef.current ||
        webglReleasedOnLayoutHideRef.current ||
        canvasReleasedOnLayoutHideRef.current;
      const splitGridVisible = visibleTerminalPanelCountRef.current > 1;
      const gpuStillAttached = !needsGpuRendererReattach({
        operationalRendererMode: operationalRendererModeRef.current,
        webglAddon: webglAddonRef.current,
        canvasAddon: canvasAddonRef.current,
      });
      const clearAtlasForShow = gpuShowRecover || (splitGridVisible && !gpuStillAttached);
      // Option B: GPU addons stay attached while the workspace is mounted. A plain
      // visibility toggle (tab switch, window park) only needs the freeze-path sync
      // (stabilize + one repaint) — not bounded fit/GPU recover loops.
      const needsHeavyRecovery =
        gpuShowRecover ||
        (survivorRecover && !gpuStillAttached) ||
        (splitGridVisible && !gpuStillAttached);
      const needsRafRecovery = needsHeavyRecovery;
      const needsForcedRepaint = needsHeavyRecovery;

      if (!needsHeavyRecovery) {
        void syncTerminalViewportOnWorkspaceShow(layoutReason, { clearAtlas: false });
        return;
      }

      const runPass = (reason) => {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          if (gpuShowRecover || survivorRecover) {
            scheduleBoundedGpuRecover();
          }
          if (needsForcedRepaint) {
            scheduleBoundedFitRepaint(survivorRecover ? 40 : 24);
          }
          return;
        }
        void syncTerminalViewportOnWorkspaceShow(reason, { clearAtlas: clearAtlasForShow });
        if (needsForcedRepaint) {
          scheduleBoundedForceRepaint(survivorRecover ? 32 : 24);
          scheduleBoundedFitRepaint(survivorRecover ? 40 : 24);
        }
        if (gpuShowRecover || survivorRecover) {
          scheduleBoundedGpuRecover(survivorRecover ? 48 : 40);
        }
        if (
          !splitGridVisible &&
          shouldRefitVisibleInactiveSplitPanel({
            isActivePanel: isActivePanelRef.current,
            isVisibleInLayout: isVisibleInLayoutRef.current,
          })
        ) {
          scheduleInactiveViewportRepaint();
        }
      };

      requestAnimationFrame(() => {
        runPass(layoutReason);
        if (needsRafRecovery) {
          requestAnimationFrame(() => {
            if (!isVisibleInLayoutRef.current) return;
            runPass(
              survivorRecover
                ? `${WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON}-raf`
                : 'workspace-show-raf'
            );
          });
        }
      });
    },
    [ctxRef]
  );

  const sendResize = useCallback(() => {
    const c = ctxRef.current;
    const {
      id,
      cwd,
      initialCommand,
      autoFocus,
      coldMountOrdinal,
      restored,
      termRef,
      fitRef,
      containerRef,
      wsRef,
      rafRef,
      timeoutRef,
      isDisposingRef,
      isActivePanelRef,
      isVisibleInLayoutRef,
      operationalRendererModeRef,
      visibleTerminalPanelCountRef,
      lastPtySizeRef,
      connectPendingUntilFitRef,
      connectDeferTimerRef,
      connectRef,
      sessionClosingRef,
      hasConnectedOnceRef,
      needsViewportSyncOnShowRef,
      layoutChurnedWhileHiddenRef,
      layoutHiddenGenerationRef,
      containerWasZeroSizedOnShowRef,
      workspaceShowRecoverTimerRef,
      workspaceShowZeroSizeObserverRef,
      inactiveRepaintRafRef,
      pendingWebglRecoveryRef,
      webglReleasedOnLayoutHideRef,
      canvasReleasedOnLayoutHideRef,
      hiddenOutputBufferRef,
      hiddenOutputCatchupPendingRef,
      sessionReattachedRef,
      tuiSessionActiveRef,
      kimiReadyNotifiedRef,
      isEngineV2Ref,
      webglFallbackRef,
      webglAddonRef,
      canvasAddonRef,
      viewportFitConfirmedRef,
      lastViewportReadyPostedRef,
      hasSentInitialCommand,
      isGrokSessionRef,
      clearTimers,
      clearConnectDeferTimer,
      scheduleConnectDeferForce,
      sendResizeRef,
      tryReattachWebglAddonRef,
      tryReattachCanvasAddonRef,
      syncTerminalViewportOnWorkspaceShowRef,
      scheduleWorkspaceShowRecoveryRef,
      reactivateTerminalViewportRef,
      notifyViewportReady,
      restoreInitialCommandDispatchGuard,
      scheduleInitialCommandAfterViewport,
      logViewportDiagnostic,
      scrollTerminalToBottom,
      scrollIfActivePanel,
      disposeWebglAddonForContextLoss,
      scheduleWebglRecovery,
      coalescedForceRepaint,
      confirmViewportFit,
      maybeConnectAfterViewportFit,
      fitAndResize,
      scheduleInactiveViewportRepaint,
      syncTerminalViewportOnWorkspaceShow,
      scheduleWorkspaceShowRecovery,
      sendResize,
      reactivateTerminalViewport,
      scheduleBoundedGpuRecover,
      scheduleBoundedFitRepaint,
      scheduleBoundedForceRepaint,
      buildViewportSnapshot,
    } = c;
    if (!termRef.current || !fitRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    if (connectPendingUntilFitRef.current) {
      const worked = fitAndResize({ clearAtlas: true });
      maybeConnectAfterViewportFit(worked);
      return;
    }

    if (!isVisibleInLayoutRef.current) {
      needsViewportSyncOnShowRef.current = true;
      return;
    }

    // Visible inactive siblings still need fit+PTY resize when split geometry changes.
    if (
      shouldRefitVisibleInactiveSplitPanel({
        isActivePanel: isActivePanelRef.current,
        isVisibleInLayout: isVisibleInLayoutRef.current,
      })
    ) {
      scheduleInactiveViewportRepaint();
      return;
    }

    const kimiConnected = shouldSkipKimiTuiPtyResize({
      initialCommand,
      hasConnectedOnce: hasConnectedOnceRef.current,
      kimiReady: kimiReadyNotifiedRef.current,
    });
    fitAndResize({ clearAtlas: true, forcePtyResize: true });
    if (!kimiConnected) scrollTerminalToBottom();
    clearTimers();
    rafRef.current = requestAnimationFrame(() => {
      fitAndResize({ clearAtlas: false, forcePtyResize: true });
      if (!kimiConnected) scrollTerminalToBottom();
    });
  }, [ctxRef]);

  const reactivateTerminalViewport = useCallback(
    (options = {}) => {
      const c = ctxRef.current;
      const {
        id,
        cwd,
        initialCommand,
        autoFocus,
        coldMountOrdinal,
        restored,
        termRef,
        fitRef,
        containerRef,
        wsRef,
        rafRef,
        timeoutRef,
        isDisposingRef,
        isActivePanelRef,
        isVisibleInLayoutRef,
        operationalRendererModeRef,
        visibleTerminalPanelCountRef,
        lastPtySizeRef,
        connectPendingUntilFitRef,
        connectDeferTimerRef,
        connectRef,
        sessionClosingRef,
        hasConnectedOnceRef,
        needsViewportSyncOnShowRef,
        layoutChurnedWhileHiddenRef,
        layoutHiddenGenerationRef,
        containerWasZeroSizedOnShowRef,
        workspaceShowRecoverTimerRef,
        workspaceShowZeroSizeObserverRef,
        inactiveRepaintRafRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        hiddenOutputBufferRef,
        hiddenOutputCatchupPendingRef,
        sessionReattachedRef,
        tuiSessionActiveRef,
        kimiReadyNotifiedRef,
        isEngineV2Ref,
        webglFallbackRef,
        webglAddonRef,
        canvasAddonRef,
        viewportFitConfirmedRef,
        lastViewportReadyPostedRef,
        hasSentInitialCommand,
        isGrokSessionRef,
        clearTimers,
        clearConnectDeferTimer,
        scheduleConnectDeferForce,
        sendResizeRef,
        tryReattachWebglAddonRef,
        tryReattachCanvasAddonRef,
        syncTerminalViewportOnWorkspaceShowRef,
        scheduleWorkspaceShowRecoveryRef,
        reactivateTerminalViewportRef,
        notifyViewportReady,
        restoreInitialCommandDispatchGuard,
        scheduleInitialCommandAfterViewport,
        logViewportDiagnostic,
        scrollTerminalToBottom,
        scrollIfActivePanel,
        disposeWebglAddonForContextLoss,
        scheduleWebglRecovery,
        coalescedForceRepaint,
        confirmViewportFit,
        maybeConnectAfterViewportFit,
        fitAndResize,
        scheduleInactiveViewportRepaint,
        syncTerminalViewportOnWorkspaceShow,
        scheduleWorkspaceShowRecovery,
        sendResize,
        reactivateTerminalViewport,
        scheduleBoundedGpuRecover,
        scheduleBoundedFitRepaint,
        scheduleBoundedForceRepaint,
        buildViewportSnapshot,
      } = c;
      const rect = containerRef.current?.getBoundingClientRect();
      const zeroSized = !rect || rect.width <= 0 || rect.height <= 0;
      if (zeroSized) {
        logViewportDiagnostic('reactivate-skipped-zero-size');
        if (autoFocus && isActivePanelRef.current) {
          prepareActiveTuiTerminalFocus(termRef.current, {
            tuiSessionActive: tuiSessionActiveRef.current,
          });
          termRef.current?.focus?.();
        }
        return;
      }

      const clearAtlas =
        options.clearAtlas ??
        shouldMountCanvasAddon({
          operationalRendererMode: operationalRendererModeRef.current,
          isActivePanel: isActivePanelRef.current,
          isVisibleInLayout: isVisibleInLayoutRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
        });

      const skipDomFit =
        !options.survivorRecover &&
        shouldFreezeDomViewportOnAppResume({
          operationalRendererMode: operationalRendererModeRef.current,
          tuiSessionActive: tuiSessionActiveRef.current,
          term: termRef.current,
          container: containerRef.current,
          fitAddon: fitRef.current,
        });

      const kimiConnected = shouldSkipKimiTuiPtyResize({
        initialCommand,
        hasConnectedOnce: hasConnectedOnceRef.current,
        kimiReady: kimiReadyNotifiedRef.current,
      });

      logViewportDiagnostic('reactivate-start');
      prepareActiveTuiTerminalFocus(termRef.current, {
        tuiSessionActive: tuiSessionActiveRef.current,
      });
      if (skipDomFit) {
        logViewportDiagnostic('reactivate-frozen-dom-tui');
        nudgeTerminalPtyResize({
          term: termRef.current,
          socket: wsRef.current,
          lastPtySizeRef: lastPtySizeRef.current,
        });
        stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        refreshTerminalViewport(termRef.current);
      } else if (options.survivorRecover) {
        const grokLive = isGrokSessionRef.current || isGrokTuiInitialCommand(initialCommand);
        const liveTui = tuiSessionActiveRef.current || grokLive;
        if (liveTui) {
          logViewportDiagnostic('reactivate-survivor-dom-tui');
          fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: Boolean(clearAtlas),
            lastPtySizeRef: lastPtySizeRef.current,
            skipPtyNotify: true,
          });
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
          refreshTerminalViewport(termRef.current);
        } else {
          fitAndResize({ clearAtlas });
          stabilizeTerminalRenderer(termRef.current, { clearAtlas });
        }
      } else if (!kimiConnected) {
        fitAndResize({ clearAtlas });
        stabilizeTerminalRenderer(termRef.current, { clearAtlas });
        if (isActivePanelRef.current) scrollTerminalToBottom();
      } else {
        stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
      }

      // OS window restore (Alt+Tab back to DevHub) leaves the GPU canvas bitmap stale
      // when cols/rows are unchanged — fitAndResize no-ops and clearAtlas+refresh alone
      // don't redraw alt-screen Ink TUIs, so grok/OpenCode render garbled until the user
      // clicks. Force a real 1-cell resize nudge so the canvas bitmap redraws (Bug A).
      // No PTY SIGWINCH is sent (forceTerminalViewportRepaint never notifies the PTY).
      if (clearAtlas && tuiSessionActiveRef.current) {
        coalescedForceRepaint(termRef.current, { reason: 'reactivate-tui' });
      }

      if (autoFocus) {
        termRef.current?.focus?.();
      }

      rafRef.current = requestAnimationFrame(() => {
        if (skipDomFit) {
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        } else if (!kimiConnected) {
          fitAndResize({ clearAtlas: false });
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
          if (isActivePanelRef.current) scrollTerminalToBottom();
        } else {
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
        }
        logViewportDiagnostic('reactivate-settled');
      });
    },
    [ctxRef]
  );

  useEffect(() => {
    const c = ctxRef.current;
    if (c?.syncTerminalViewportOnWorkspaceShowRef) {
      c.syncTerminalViewportOnWorkspaceShowRef.current = syncTerminalViewportOnWorkspaceShow;
    }
    if (c?.scheduleWorkspaceShowRecoveryRef) {
      c.scheduleWorkspaceShowRecoveryRef.current = scheduleWorkspaceShowRecovery;
    }
    if (c?.reactivateTerminalViewportRef) {
      c.reactivateTerminalViewportRef.current = reactivateTerminalViewport;
    }
    if (c?.sendResizeRef) {
      c.sendResizeRef.current = sendResize;
    }
  }, [
    ctxRef,
    syncTerminalViewportOnWorkspaceShow,
    scheduleWorkspaceShowRecovery,
    reactivateTerminalViewport,
    sendResize,
  ]);

  return {
    waitForVisibleDimensions,
    confirmViewportFit,
    maybeConnectAfterViewportFit,
    fitAndResize,
    sendResize,
    reactivateTerminalViewport,
    scheduleInactiveViewportRepaint,
    syncTerminalViewportOnWorkspaceShow,
    scheduleWorkspaceShowRecovery,
  };
}
