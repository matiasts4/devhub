/**
 * useTerminalWorkspaceShowRecovery — workspace-show recovery orchestration and bounded repaint.
 * Split from useTerminalViewportSync.js (terminal-decompose Slice C).
 * Viewport sync pass: useTerminalWorkspaceShowRecoveryViewportSync.js.
 */
/* eslint-disable no-unused-vars -- ctxRef bag destructure */
import { useCallback, useEffect, useLayoutEffect } from 'react';
import { usesLegacyTerminalSurvivorRecovery } from '@/lib/terminal/legacyTerminalSurvivorRecovery';
import {
  fitTerminalViewport,
  proposeTerminalViewportDimensions,
  shouldClearAtlasForSplitCanvas,
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
  needsGpuRendererReattach,
  isWorkspaceSurvivorRecoverLayoutReason,
  shouldSyncTerminalViewportOnLayoutShow,
  shouldSoftGpuWorkspaceReveal,
  resolveWorkspaceLayoutShowRevealMode,
  isTerminalViewportNearBottom,
  restoreTerminalViewportAfterReveal,
  TERMINAL_SPLIT_WEBGL_PANEL_LIMIT,
  WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON,
} from '@/components/terminal/TerminalTTY.helpers';
import { shouldSkipKimiTuiPtyResize } from '@/lib/terminal/kimiReadyMarker';
import { getTerminalLayoutSettledGeneration } from '@/components/terminal/nativeLayoutSync';
import useTerminalWorkspaceShowRecoveryViewportSync from './useTerminalWorkspaceShowRecoveryViewportSync';

export default function useTerminalWorkspaceShowRecovery({
  ctxRef,
  isVisibleInLayout,
  isWorkspaceShellVisible,
  operationalRendererMode,
  shouldUseNativeRenderer,
  nativeVteOpened,
}) {
  const { syncTerminalViewportOnWorkspaceShow } = useTerminalWorkspaceShowRecoveryViewportSync({
    ctxRef,
  });
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
  const scheduleBoundedForceRepaint = useCallback(
    (maxAttempts = 24) => {
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
        scheduleBoundedFitRepaintRef,
        scheduleBoundedGpuRecoverRef,
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
      if (isEngineV2Ref.current) return;
      let attempts = 0;
      const attempt = () => {
        if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
          return;
        }
        if (coalescedForceRepaint(termRef.current, { reason: 'bounded-force-repaint' })) return;
        // Sin-parpadeo fase 2: stop at the first verified-painted tick. A `false`
        // above often means the repaint was merely coalesced (one already landed
        // inside the 200 ms window); when the grid also matches the container and
        // the GPU addon is attached, more rAF spins cannot improve the frame.
        const proposed = proposeTerminalViewportDimensions({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
        });
        const dimsMatch =
          proposed &&
          Number(proposed.cols) === Number(termRef.current.cols) &&
          Number(proposed.rows) === Number(termRef.current.rows);
        const gpuReady = !needsGpuRendererReattach({
          operationalRendererMode: operationalRendererModeRef.current,
          webglAddon: webglAddonRef.current,
          canvasAddon: canvasAddonRef.current,
        });
        if (dimsMatch && gpuReady && isTerminalRendererReady(termRef.current)) return;
        if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
      };
      attempt();
    },
    [ctxRef]
  );

  const scheduleBoundedFitRepaint = useCallback(
    (maxAttempts = 24) => {
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
        scheduleBoundedFitRepaintRef,
        scheduleBoundedGpuRecoverRef,
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
      if (isEngineV2Ref.current) return;
      let attempts = 0;
      // ponytail: require the container's proposed dims to be STABLE across 2
      // consecutive frames before stopping. On a workspace switch the PanelGroup /
      // xterm canvas is still settling a frame or two after the first fit, so the
      // container often reports a transient narrow width; stopping on the first
      // settled frame leaves the term at those narrow cols → black strip on the
      // right (Grok/DOM TUI symptom). Waiting one extra frame for stability costs
      // one no-op fit and catches the container's final width. Ceiling: a container
      // that keeps oscillating forever would burn maxAttempts no-op fits then stop;
      // upgrade path is a ResizeObserver-driven fit instead of rAF polling.
      let lastProposed = null;
      const attempt = () => {
        if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
          return;
        }
        const fitWorked = fitTerminalViewport({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
          socket: wsRef.current,
          clearAtlas: false,
          lastPtySizeRef: lastPtySizeRef.current,
        });
        const proposed = proposeTerminalViewportDimensions({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
        });
        const settled =
          fitWorked &&
          proposed &&
          Number(proposed.cols) === Number(termRef.current.cols) &&
          Number(proposed.rows) === Number(termRef.current.rows);
        const stable =
          lastProposed !== null &&
          proposed &&
          Number(lastProposed.cols) === Number(proposed.cols) &&
          Number(lastProposed.rows) === Number(proposed.rows);
        lastProposed =
          proposed && Number(proposed.cols) > 0
            ? { cols: Number(proposed.cols), rows: Number(proposed.rows) }
            : lastProposed;
        if (settled && stable) {
          coalescedForceRepaint(termRef.current, { reason: 'bounded-fit-repaint' });
          return;
        }
        if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
      };
      attempt();
    },
    [ctxRef]
  );

  const scheduleBoundedGpuRecover = useCallback(
    (maxAttempts = 30) => {
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
        scheduleBoundedFitRepaintRef,
        scheduleBoundedGpuRecoverRef,
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
      if (isEngineV2Ref.current) return;
      let attempts = 0;
      // ponytail: same 2-frame stability gate as scheduleBoundedFitRepaint — stopping
      // when forceTerminalViewportRepaint "succeeds" at stale narrow cols leaves Grok
      // TUIs drawing in a tiny corner with a black gutter on the right.
      let lastProposed = null;
      const tick = async () => {
        if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          if (attempts++ < maxAttempts) requestAnimationFrame(tick);
          return;
        }
        if (
          needsGpuRendererReattach({
            operationalRendererMode: operationalRendererModeRef.current,
            webglAddon: webglAddonRef.current,
            canvasAddon: canvasAddonRef.current,
          })
        ) {
          if (
            shouldAttachWebglRenderer({
              operationalRendererMode: operationalRendererModeRef.current,
            })
          ) {
            await tryReattachWebglAddonRef.current?.({
              clearAtlas: false,
              skipFitWhenUnchanged: true,
            });
          } else {
            await tryReattachCanvasAddonRef.current?.();
          }
        }
        if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
        let fitWorked = false;
        fitWorked = fitTerminalViewport({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
          socket: wsRef.current,
          clearAtlas: false,
          lastPtySizeRef: lastPtySizeRef.current,
        });
        const proposed = proposeTerminalViewportDimensions({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
        });
        const settled =
          fitWorked &&
          proposed &&
          Number(proposed.cols) === Number(termRef.current.cols) &&
          Number(proposed.rows) === Number(termRef.current.rows);
        const stable =
          lastProposed !== null &&
          proposed &&
          Number(lastProposed.cols) === Number(proposed.cols) &&
          Number(lastProposed.rows) === Number(proposed.rows);
        lastProposed =
          proposed && Number(proposed.cols) > 0
            ? { cols: Number(proposed.cols), rows: Number(proposed.rows) }
            : lastProposed;
        const gpuReady = !needsGpuRendererReattach({
          operationalRendererMode: operationalRendererModeRef.current,
          webglAddon: webglAddonRef.current,
          canvasAddon: canvasAddonRef.current,
        });
        if (gpuReady && settled && stable) {
          coalescedForceRepaint(termRef.current, { reason: 'bounded-gpu-recover' });
          return;
        }
        if (attempts++ < maxAttempts) requestAnimationFrame(tick);
      };
      tick();
    },
    [ctxRef]
  );

  useEffect(() => {
    const c = ctxRef.current;
    if (c?.scheduleBoundedFitRepaintRef) {
      c.scheduleBoundedFitRepaintRef.current = scheduleBoundedFitRepaint;
    }
    if (c?.scheduleBoundedGpuRecoverRef) {
      c.scheduleBoundedGpuRecoverRef.current = scheduleBoundedGpuRecover;
    }
    if (c?.syncTerminalViewportOnWorkspaceShowRef) {
      c.syncTerminalViewportOnWorkspaceShowRef.current = syncTerminalViewportOnWorkspaceShow;
    }
    if (c?.scheduleWorkspaceShowRecoveryRef) {
      c.scheduleWorkspaceShowRecoveryRef.current = scheduleWorkspaceShowRecovery;
    }
  }, [
    ctxRef,
    scheduleBoundedFitRepaint,
    scheduleBoundedGpuRecover,
    syncTerminalViewportOnWorkspaceShow,
    scheduleWorkspaceShowRecovery,
  ]);

  // Layout-show dispatch effect: false→true recovery for route / workspace / window switches.
  useLayoutEffect(() => {
    const c = ctxRef.current;
    const {
      id,
      termRef,
      containerRef,
      fitRef,
      wsRef,
      lastPtySizeRef,
      webglAddonRef,
      canvasAddonRef,
      isDisposingRef,
      isEngineV2Ref,
      isVisibleInLayoutRef,
      operationalRendererModeRef,
      visibleTerminalPanelCountRef,
      tuiSessionActiveRef,
      hiddenOutputBufferRef,
      hiddenOutputCatchupPendingRef,
      pendingWebglRecoveryRef,
      webglReleasedOnLayoutHideRef,
      canvasReleasedOnLayoutHideRef,
      layoutChurnedWhileHiddenRef,
      layoutHiddenGenerationRef,
      needsViewportSyncOnShowRef,
      workspaceShowSyncTimerRef,
      workspaceShowRecoverTimerRef,
      workspaceShowZeroSizeObserverRef,
      prevVisibleInLayoutRef,
      prevWorkspaceShellVisibleRef,
      tryReattachWebglAddonRef,
      tryReattachCanvasAddonRef,
      showAndResizeNativeLease,
      restoreInitialCommandDispatchGuard,
      logViewportDiagnostic,
      coalescedForceRepaint,
      coalescedSoftGpuVisibilityReveal,
      scheduleBoundedGpuRecover,
    } = c;

    const prevVisible = prevVisibleInLayoutRef.current;
    const nextVisible = isVisibleInLayout;

    // Snapshot the global layout-settled generation when this panel becomes hidden.
    // On reveal we compare it against the live generation to detect churn that
    // happened in other workspaces; those events carry panelIds of the active
    // workspace, so they never reach this hidden panel via the normal listener.
    if (!nextVisible && layoutHiddenGenerationRef.current === 0) {
      layoutHiddenGenerationRef.current = getTerminalLayoutSettledGeneration();
    }

    if (workspaceShowSyncTimerRef.current) {
      clearTimeout(workspaceShowSyncTimerRef.current);
      workspaceShowSyncTimerRef.current = null;
    }
    if (workspaceShowRecoverTimerRef.current) {
      clearTimeout(workspaceShowRecoverTimerRef.current);
      workspaceShowRecoverTimerRef.current = null;
    }

    // NOTE: we intentionally do NOT release WebGL/Canvas when the panel becomes
    // hidden. Workspaces are kept mounted with opacity:0 (+ contain:layout paint,
    // never visibility:hidden — see workspaceAnimProps.js), so the addon must
    // stay attached for instant reactivation. Real GPU disposal happens on
    // unmount via disposeXtermRuntime().

    if (shouldSyncTerminalViewportOnLayoutShow(prevVisible, nextVisible)) {
      // PR6 scroll integrity: capture the scroll position before the reveal
      // fit/repaint so a user reading scrollback lands back where they were.
      const viewportYBefore = termRef.current?.buffer?.active?.viewportY ?? null;
      const wasNearBottom = isTerminalViewportNearBottom(termRef.current);
      restoreInitialCommandDispatchGuard();
      // Phase 6 terminal-engine-v2: skip legacy GPU survivor recovery on show.
      if (!usesLegacyTerminalSurvivorRecovery(isEngineV2Ref.current)) {
        if (termRef.current && containerRef.current && fitRef.current) {
          fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: false,
            lastPtySizeRef: lastPtySizeRef.current,
          });
        }
        needsViewportSyncOnShowRef.current = false;
        layoutChurnedWhileHiddenRef.current = false;
        layoutHiddenGenerationRef.current = 0;
      } else if (shouldUseNativeRenderer && nativeVteOpened) {
        void showAndResizeNativeLease();
      } else {
        const isWorkspaceTabReveal =
          isWorkspaceShellVisible && !prevWorkspaceShellVisibleRef.current;
        const softGpuEligible = shouldSoftGpuWorkspaceReveal({
          operationalRendererMode: operationalRendererModeRef.current,
          webglAddon: webglAddonRef.current,
          canvasAddon: canvasAddonRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
          pendingWebglRecovery: pendingWebglRecoveryRef.current,
          webglReleasedOnLayoutHide: webglReleasedOnLayoutHideRef.current,
          canvasReleasedOnLayoutHide: canvasReleasedOnLayoutHideRef.current,
        });
        const revealMode = resolveWorkspaceLayoutShowRevealMode({
          isWorkspaceTabReveal,
          softGpuEligible,
          hiddenOutputCatchupPending: hiddenOutputCatchupPendingRef.current,
          tuiSessionActive: tuiSessionActiveRef.current,
        });

        // If layout churn happened while this panel was hidden, the GPU framebuffer
        // may be stale even though the addon is still attached. Skip the soft/no-op
        // paths and run a real fit + clear + repaint, with bounded retries.
        const hadLocalChurn = layoutChurnedWhileHiddenRef.current;
        const hiddenGeneration = layoutHiddenGenerationRef.current;
        const currentGeneration = getTerminalLayoutSettledGeneration();
        const hadGlobalChurn = hiddenGeneration > 0 && currentGeneration > hiddenGeneration;
        const hadLayoutChurn = hadLocalChurn || hadGlobalChurn;
        layoutChurnedWhileHiddenRef.current = false;
        layoutHiddenGenerationRef.current = 0;

        if (revealMode === 'soft' && !hadLayoutChurn) {
          needsViewportSyncOnShowRef.current = false;
          coalescedSoftGpuVisibilityReveal(
            termRef.current,
            hiddenOutputBufferRef.current,
            hiddenOutputCatchupPendingRef,
            { reason: 'workspace-show-soft-reveal' }
          );
          logViewportDiagnostic('workspace-show-visible-soft-gpu-reveal');
          if (!isWorkspaceTabReveal) {
            // Parked windows were visibility:hidden — one deferred refresh after the
            // shell becomes visible so WebGL composites the live bitmap (no clear()).
            requestAnimationFrame(() => {
              if (!isVisibleInLayoutRef.current || !termRef.current) return;
              coalescedSoftGpuVisibilityReveal(
                termRef.current,
                hiddenOutputBufferRef.current,
                hiddenOutputCatchupPendingRef,
                { reason: 'workspace-show-soft-reveal-deferred' }
              );
            });
          }
        } else {
          const rendererReadyNow = Boolean(
            termRef.current && isTerminalRendererReady(termRef.current)
          );
          if (!rendererReadyNow) {
            needsViewportSyncOnShowRef.current = true;
            scheduleBoundedGpuRecover(48);
          }
          void (async () => {
            if (
              needsGpuRendererReattach({
                operationalRendererMode: operationalRendererModeRef.current,
                webglAddon: webglAddonRef.current,
                canvasAddon: canvasAddonRef.current,
              })
            ) {
              if (
                shouldAttachWebglRenderer({
                  operationalRendererMode: operationalRendererModeRef.current,
                })
              ) {
                await tryReattachWebglAddonRef.current?.({
                  clearAtlas: false,
                  skipFitWhenUnchanged: true,
                });
              } else if (
                shouldAttachCanvasRenderer({
                  operationalRendererMode: operationalRendererModeRef.current,
                })
              ) {
                await tryReattachCanvasAddonRef.current?.();
              }
            }
            const stillNeedsGpu = needsGpuRendererReattach({
              operationalRendererMode: operationalRendererModeRef.current,
              webglAddon: webglAddonRef.current,
              canvasAddon: canvasAddonRef.current,
            });
            if (stillNeedsGpu || !isTerminalRendererReady(termRef.current)) {
              needsViewportSyncOnShowRef.current = true;
              scheduleBoundedGpuRecover(48);
            } else if (isVisibleInLayoutRef.current && termRef.current) {
              if (hadLayoutChurn) {
                // The GPU framebuffer may have been discarded while the panel was
                // opacity-hidden. For plain shells a real clear+repaint is safe.
                // For live TUIs (OpenCode/Grok/etc.) a clearAtlas wipes the canvas
                // and the TUI does not repaint until it receives SIGWINCH/input, so
                // we use a TUI-safe path: fit without PTY notify, refresh+force
                // repaint, then nudge the PTY with an unchanged-dimension SIGWINCH
                // to make the TUI redraw without altering its layout.
                if (tuiSessionActiveRef.current && containerRef.current && fitRef.current) {
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
                  if (isTerminalRendererReady(termRef.current)) {
                    coalescedForceRepaint(termRef.current, {
                      reason: 'workspace-show-layout-churn-recover-tui',
                    });
                  }
                  nudgeTerminalPtyResize({
                    term: termRef.current,
                    socket: wsRef.current,
                    lastPtySizeRef: lastPtySizeRef.current,
                    force: true,
                  });
                  logViewportDiagnostic('workspace-show-layout-churn-recover-tui');
                } else {
                  void syncTerminalViewportOnWorkspaceShow('workspace-show-layout-churn-recover', {
                    clearAtlas: true,
                  });
                }
                scheduleBoundedGpuRecover(24);
              } else {
                coalescedSoftGpuVisibilityReveal(
                  termRef.current,
                  hiddenOutputBufferRef.current,
                  hiddenOutputCatchupPendingRef,
                  { reason: 'workspace-show-soft-reveal-fallback' }
                );
              }
            }
            scheduleWorkspaceShowRecovery(
              hadLayoutChurn ? 'workspace-show-layout-churn-recover' : 'workspace-show-visible'
            );
          })();
        }
      }

      // PR6 scroll integrity: once the reveal fit/repaint settled, restore the
      // captured scroll position. No-op when the user was at the bottom or the
      // viewport never moved.
      requestAnimationFrame(() => {
        restoreTerminalViewportAfterReveal({
          term: termRef.current,
          viewportYBefore,
          wasNearBottom,
          panelId: id,
        });
      });
    } else if (!isVisibleInLayout) {
      needsViewportSyncOnShowRef.current = true;
    } else if (isVisibleInLayout && needsViewportSyncOnShowRef.current) {
      syncTerminalViewportOnWorkspaceShow('workspace-show-pending', { clearAtlas: true });
    }

    prevVisibleInLayoutRef.current = isVisibleInLayout;
    prevWorkspaceShellVisibleRef.current = isWorkspaceShellVisible;

    return () => {
      if (workspaceShowSyncTimerRef.current) {
        clearTimeout(workspaceShowSyncTimerRef.current);
        workspaceShowSyncTimerRef.current = null;
      }
      if (workspaceShowRecoverTimerRef.current) {
        clearTimeout(workspaceShowRecoverTimerRef.current);
        workspaceShowRecoverTimerRef.current = null;
      }
      workspaceShowZeroSizeObserverRef.current?.disconnect();
      workspaceShowZeroSizeObserverRef.current = null;
    };
  }, [
    ctxRef,
    isVisibleInLayout,
    isWorkspaceShellVisible,
    operationalRendererMode,
    shouldUseNativeRenderer,
    nativeVteOpened,
    syncTerminalViewportOnWorkspaceShow,
    scheduleWorkspaceShowRecovery,
    scheduleBoundedGpuRecover,
  ]);

  return {
    scheduleBoundedForceRepaint,
    scheduleBoundedFitRepaint,
    scheduleBoundedGpuRecover,
    scheduleInactiveViewportRepaint,
    syncTerminalViewportOnWorkspaceShow,
    scheduleWorkspaceShowRecovery,
  };
}
