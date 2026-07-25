/**
 * useTerminalViewportSync — fit, resize plumbing.
 * Split from terminal-decompose Slice C; workspace-show recovery lives in
 * useTerminalWorkspaceShowRecovery.js.
 */
/* eslint-disable no-unused-vars -- ctxRef bag destructure */
import { useCallback, useEffect } from 'react';
import {
  fitTerminalViewport,
  shouldDeferTerminalConnectUntilViewportFitted,
  resolveColdMountStaggerMs,
  shouldClearAtlasForSplitCanvas,
  shouldRefitVisibleInactiveSplitPanel,
  stabilizeTerminalRenderer,
  refreshTerminalViewport,
  nudgeTerminalPtyResize,
  shouldMountCanvasAddon,
  shouldFreezeDomViewportOnAppResume,
  prepareActiveTuiTerminalFocus,
  shouldScrollAgentWheelLocally,
  isGrokTuiInitialCommand,
} from '@/components/terminal/TerminalTTY.helpers';
import { shouldSkipKimiTuiPtyResize } from '@/lib/terminal/kimiReadyMarker';

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
          isVisibleInLayout: isVisibleInLayoutRef.current,
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
        source: options.source,
        telemetryDetail: {
          hidden: !isVisibleInLayoutRef.current,
          tuiActive: tuiSessionActiveRef.current,
        },
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
    fitAndResize({ clearAtlas: true, forcePtyResize: true, source: 'send-resize' });
    if (!kimiConnected) scrollTerminalToBottom();
    clearTimers();
    rafRef.current = requestAnimationFrame(() => {
      fitAndResize({ clearAtlas: false, forcePtyResize: true, source: 'send-resize' });
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
        agentTypeRef,
      } = c;
      const rect = containerRef.current?.getBoundingClientRect();
      const zeroSized = !rect || rect.width <= 0 || rect.height <= 0;
      // Inline-scroll agents (kimi, qodercli, claude, codex) never use host mouse —
      // keep DECSET off so text selection keeps working.
      const tuiMouseActive = Boolean(
        tuiSessionActiveRef.current &&
        !shouldScrollAgentWheelLocally(initialCommand, agentTypeRef?.current)
      );
      if (zeroSized) {
        logViewportDiagnostic('reactivate-skipped-zero-size');
        if (autoFocus && isActivePanelRef.current) {
          prepareActiveTuiTerminalFocus(termRef.current, {
            tuiSessionActive: tuiMouseActive,
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
        tuiSessionActive: tuiMouseActive,
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
    if (c?.reactivateTerminalViewportRef) {
      c.reactivateTerminalViewportRef.current = reactivateTerminalViewport;
    }
    if (c?.sendResizeRef) {
      c.sendResizeRef.current = sendResize;
    }
  }, [ctxRef, reactivateTerminalViewport, sendResize]);

  return {
    waitForVisibleDimensions,
    confirmViewportFit,
    maybeConnectAfterViewportFit,
    fitAndResize,
    sendResize,
    reactivateTerminalViewport,
  };
}
