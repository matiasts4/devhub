/**
 * useTerminalWorkspaceShowRecoveryViewportSync — workspace-show viewport sync pass.
 * Split from useTerminalWorkspaceShowRecovery.js (terminal-decompose).
 */
/* eslint-disable no-unused-vars -- ctxRef bag destructure */
import { useCallback } from 'react';
import {
  fitTerminalViewport,
  proposeTerminalViewportDimensions,
  isTerminalRendererReady,
  refreshTerminalViewport,
  stabilizeTerminalRenderer,
  nudgeTerminalPtyResize,
  shouldAttachWebglRenderer,
  shouldAttachCanvasRenderer,
  shouldMountCanvasAddon,
  shouldBlockV2WebglRecovery,
  shouldSkipGpuVisibilityReveal,
  isWorkspaceSurvivorRecoverLayoutReason,
  shouldFreezeSingleWebglViewportOnWorkspaceShow,
  shouldFreezeDomViewportOnWorkspaceShow,
  shouldSkipRedundantLayoutSettleViewportSync,
  shouldClearGpuAtlasOnWorkspaceShow,
  takeHiddenTerminalOutputBuffer,
  chunkTerminalOutputForCatchup,
  shouldDiscardHiddenOutputCatchup,
  terminalBufferHasRenderableContent,
  reconcileOpenCodeTuiWheelReadiness,
  reconcileGrokTuiWheelReadiness,
  TERMINAL_SPLIT_WEBGL_PANEL_LIMIT,
} from '@/components/terminal/TerminalTTY.helpers';
import {
  detectKimiReadyFromTerminalBuffer,
  isKimiLaunchCommand,
  isKimiTuiLive,
  shouldFreezeKimiTuiViewportOnWorkspaceShow,
  shouldSkipKimiTuiPtyResize,
} from '@/lib/terminal/kimiReadyMarker';
export default function useTerminalWorkspaceShowRecoveryViewportSync({ ctxRef }) {
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
        tuiSessionFooterConfirmedRef,
        kimiReadyNotifiedRef,
        isGrokSessionRef,
        grokTuiReadyRef,
        setNativeWheelPassthrough,
        isEngineV2Ref,
        webglFallbackRef,
        webglAddonRef,
        canvasAddonRef,
        viewportFitConfirmedRef,
        lastViewportReadyPostedRef,
        hasSentInitialCommand,
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

      if (!tuiSessionFooterConfirmedRef?.current && termRef.current) {
        reconcileOpenCodeTuiWheelReadiness({
          term: termRef.current,
          initialCommand,
          tuiSessionActiveRef,
          tuiSessionFooterConfirmedRef,
          setNativeWheelPassthrough,
        });
      }

      if (!grokTuiReadyRef?.current && termRef.current) {
        reconcileGrokTuiWheelReadiness({
          term: termRef.current,
          initialCommand,
          tuiSessionActiveRef,
          isGrokSessionRef,
          grokTuiReadyRef,
          setNativeWheelPassthrough,
        });
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
            scrollTerminalToBottom();
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
  return { syncTerminalViewportOnWorkspaceShow };
}
