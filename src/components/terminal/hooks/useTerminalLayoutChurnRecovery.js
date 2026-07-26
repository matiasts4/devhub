/**
 * useTerminalLayoutChurnRecovery — legacy survivor + layout-settled churn recovery.
 * Split from TerminalTTY.jsx (terminal-decompose Slice B).
 */

import { useEffect, useRef } from 'react';
import { usesLegacyTerminalSurvivorRecovery } from '@/lib/terminal/legacyTerminalSurvivorRecovery';
import { isKimiTuiLive } from '@/lib/terminal/kimiReadyMarker';
import {
  fitTerminalViewport,
  proposeTerminalViewportDimensions,
  shouldAttachWebglRenderer,
  shouldAttachCanvasRenderer,
  isTerminalRendererReady,
  isWebglAddonContextLost,
  refreshTerminalViewport,
  forceTerminalViewportRepaint,
  stabilizeTerminalRenderer,
  nudgeTerminalPtyResize,
  shouldForcePtyNudgeOnSurvivorSoftReveal,
  needsGpuRendererReattach,
  shouldClearGpuAtlasOnWorkspaceShow,
  isWorkspaceCloseRecoverReason,
  scheduleTerminalViewportSyncBurst,
  isStaleXtermRendererError,
  WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON,
} from '@/components/terminal/TerminalTTY.helpers';

function readLayoutChurnCtx(ctxRef) {
  const c = ctxRef.current;
  if (!c) return null;
  return c;
}

/**
 * Soft recover for a visible survivor after peer workspace close / close-landing.
 * Empty shells: fit + refresh. Live OpenCode/Grok: no fit (corrupts alt-screen),
 * refresh + forced SIGWINCH; WebGL context-loss triggers dispose+reattach.
 */
export function softRevealVisibleSurvivor(c, diagnosticReason) {
  if (!c) return;
  const {
    termRef,
    containerRef,
    fitRef,
    wsRef,
    lastPtySizeRef,
    fitTerminalViewport: fitFn = fitTerminalViewport,
    stabilizeTerminalRenderer: stabilizeFn = stabilizeTerminalRenderer,
    nudgeTerminalPtyResize: nudgeFn = nudgeTerminalPtyResize,
    coalescedForceRepaint,
    logViewportDiagnostic,
    tuiSessionActiveRef,
    initialCommand,
    kimiReadyNotifiedRef,
    hasConnectedOnceRef,
    windowSwitchTuiRecoverAtRef,
    operationalRendererModeRef,
    webglAddonRef,
    disposeWebglAddonForContextLoss,
    scheduleWorkspaceShowRecovery,
  } = c;
  if (!termRef?.current || !containerRef?.current) return;

  const tuiNeedsPtyNudge = shouldForcePtyNudgeOnSurvivorSoftReveal({
    tuiSessionActive: Boolean(tuiSessionActiveRef?.current),
    hasSocket: Boolean(wsRef?.current),
    kimiLive: isKimiTuiLive({
      initialCommand,
      kimiReady: kimiReadyNotifiedRef?.current,
      tuiSessionActive: tuiSessionActiveRef?.current,
      hasConnectedOnce: hasConnectedOnceRef?.current,
    }),
  });

  if (
    shouldAttachWebglRenderer({
      operationalRendererMode: operationalRendererModeRef?.current,
    }) &&
    isWebglAddonContextLost(webglAddonRef?.current)
  ) {
    logViewportDiagnostic?.(`${diagnosticReason}-webgl-context-lost`);
    disposeWebglAddonForContextLoss?.(`${diagnosticReason}-webgl-context-lost`);
    // Reattach async; staggered survivor-recover bursts will soft-reveal again.
    scheduleWorkspaceShowRecovery?.(WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON);
  }

  logViewportDiagnostic?.(diagnosticReason);
  // Skip fit for live TUIs — refitting corrupts alternate-screen Ink layouts.
  if (!tuiNeedsPtyNudge && fitRef?.current && typeof fitFn === 'function') {
    fitFn({
      container: containerRef.current,
      fitAddon: fitRef.current,
      term: termRef.current,
      socket: wsRef.current,
      clearAtlas: false,
      lastPtySizeRef: lastPtySizeRef?.current,
      skipPtyNotify: true,
    });
  }
  if (typeof stabilizeFn === 'function') {
    stabilizeFn(termRef.current, { clearAtlas: false });
  }
  refreshTerminalViewport(termRef.current);
  if (isTerminalRendererReady(termRef.current) && typeof coalescedForceRepaint === 'function') {
    coalescedForceRepaint(termRef.current, { reason: diagnosticReason });
  }
  if (tuiNeedsPtyNudge) {
    const now = performance.now();
    const elapsed = now - (windowSwitchTuiRecoverAtRef?.current || 0);
    if (elapsed < 80) {
      logViewportDiagnostic?.(`${diagnosticReason}-tui-nudge-coalesced`, { elapsed });
    } else {
      if (windowSwitchTuiRecoverAtRef) windowSwitchTuiRecoverAtRef.current = now;
      if (isTerminalRendererReady(termRef.current)) {
        forceTerminalViewportRepaint(termRef.current);
      }
      if (typeof nudgeFn === 'function') {
        nudgeFn({
          term: termRef.current,
          socket: wsRef.current,
          lastPtySizeRef: lastPtySizeRef?.current,
          force: true,
        });
      }
    }
  }
}

export default function useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2 }) {
  const layoutSettleBurstCleanupRef = useRef(null);

  useEffect(() => {
    const handleSurvivorRecover = (event) => {
      const c = readLayoutChurnCtx(ctxRef);
      if (!c) return;
      const {
        id,
        initialCommand,
        isDisposingRef,
        isVisibleInLayoutRef,
        needsViewportSyncOnShowRef,
        layoutChurnedWhileHiddenRef,
        operationalRendererModeRef,
        webglAddonRef,
        logViewportDiagnostic,
        disposeWebglAddonForContextLoss,
        tuiSessionActiveRef,
        termRef,
        containerRef,
        fitRef,
        wsRef,
        kimiReadyNotifiedRef,
        hasConnectedOnceRef,
        windowSwitchTuiRecoverAtRef,
        fitTerminalViewport: fitFn = fitTerminalViewport,
        lastPtySizeRef,
        stabilizeTerminalRenderer: stabilizeFn = stabilizeTerminalRenderer,
        coalescedForceRepaint,
        nudgeTerminalPtyResize: nudgeFn = nudgeTerminalPtyResize,
        canvasAddonRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        scheduleWorkspaceShowRecovery,
      } = c;
      if (isDisposingRef.current) return;
      const panelIds = Array.isArray(event?.detail?.panelIds) ? event.detail.panelIds : null;
      if (panelIds && panelIds.length > 0 && !panelIds.includes(id)) return;
      // survivorPanelIds spans every remaining workspace, so this can fire for
      // panels that are not on screen; defer those to the show edge.
      if (!isVisibleInLayoutRef.current) {
        needsViewportSyncOnShowRef.current = true;
        layoutChurnedWhileHiddenRef.current = true;
        return;
      }

      const reason = event?.detail?.reason || '';
      const reasonStr = String(reason);
      const isWorkspaceRemove = reasonStr.includes('workspace-removed');
      const isWorkspaceWindowSwitch = reasonStr.includes('workspace-window-switch');
      const isWorkspaceTabSwitch =
        reasonStr.includes('workspace-switch') && !reasonStr.includes('window-switch');

      // Peer workspace close / close-active landing: soft reveal (TUI + SIGWINCH nudge).
      // Releasing WebGL here left Option B survivors black until a manual tab switch.
      // Empty shells are fine with refresh; OpenCode only blacks when this workspace
      // is the visible landing target (opacity-0 parked TUIs defer to show edge).
      if (isWorkspaceRemove) {
        softRevealVisibleSurvivor(c, 'survivor-workspace-removed-soft');
        return;
      }
      if (isWorkspaceTabSwitch) {
        softRevealVisibleSurvivor(c, 'survivor-workspace-switch-soft');
        return;
      }
      if (!usesLegacyTerminalSurvivorRecovery(isEngineV2)) {
        return;
      }

      // Window/workspace switch survivors can have a WebGL addon that is still
      // referenced but whose context was silently lost while the panel was parked.
      // Use the same disposal pattern as window.focus/visibilitychange/pageshow so
      // the recovery path reattaches the renderer instead of bailing out.
      if (
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        isWebglAddonContextLost(webglAddonRef.current)
      ) {
        logViewportDiagnostic('survivor-recover-webgl-context-lost');
        disposeWebglAddonForContextLoss('survivor-recover-webgl-context-lost');
      }
      // Window switch (V1/V2/V3) does not toggle isVisibleInLayout, so live TUIs
      // like OpenCode/Grok never get the layout-show TUI-safe churn path. Run the
      // same fit + stabilize + refresh + force-repaint + forced-SIGWINCH sequence
      // that workspace-show uses for churn recovery.
      const canRunWindowSwitchTuiRecover =
        isWorkspaceWindowSwitch &&
        tuiSessionActiveRef.current &&
        termRef.current &&
        containerRef.current &&
        fitRef.current &&
        wsRef.current &&
        !isKimiTuiLive({
          initialCommand,
          kimiReady: kimiReadyNotifiedRef.current,
          tuiSessionActive: tuiSessionActiveRef.current,
          hasConnectedOnce: hasConnectedOnceRef.current,
        });
      if (canRunWindowSwitchTuiRecover) {
        const now = performance.now();
        const elapsed = now - windowSwitchTuiRecoverAtRef.current;
        // Keep a shorter coalesce window for window-switch TUI recovery than for
        // general force repaints. The visibility:hidden toggle can discard the WebGL
        // bitmap, and the first event may run before the renderer is ready, so we
        // want the follow-up survivor events (0, 50, 150, 350, 600 ms) to have a
        // chance to repaint without restoring the full 7-event strobe.
        if (elapsed < 80) {
          logViewportDiagnostic('workspace-window-switch-tui-recover-coalesced', { elapsed });
        } else {
          windowSwitchTuiRecoverAtRef.current = now;
          logViewportDiagnostic('workspace-window-switch-tui-recover');
          fitFn({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: false,
            lastPtySizeRef: lastPtySizeRef.current,
            skipPtyNotify: true,
          });
          stabilizeFn(termRef.current, { clearAtlas: false });
          refreshTerminalViewport(termRef.current);
          if (isTerminalRendererReady(termRef.current)) {
            coalescedForceRepaint(termRef.current, {
              reason: 'survivor-window-switch-tui',
            });
          }
          nudgeFn({
            term: termRef.current,
            socket: wsRef.current,
            lastPtySizeRef: lastPtySizeRef.current,
            force: true,
          });
        }
      }
      const gpuStillAttached = !needsGpuRendererReattach({
        operationalRendererMode: operationalRendererModeRef.current,
        webglAddon: webglAddonRef.current,
        canvasAddon: canvasAddonRef.current,
      });
      const noGpuRecoveryPending =
        !pendingWebglRecoveryRef.current &&
        !webglReleasedOnLayoutHideRef.current &&
        !canvasReleasedOnLayoutHideRef.current;
      if (gpuStillAttached && noGpuRecoveryPending) {
        // layout-show soft reveal owns tab/window park when GPU stayed attached.
        return;
      }
      const recoverReason = isWorkspaceWindowSwitch
        ? WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON
        : 'workspace-show-layout';
      scheduleWorkspaceShowRecovery(recoverReason);
    };

    window.addEventListener('devhub:terminal-survivor-recover', handleSurvivorRecover);

    // Window switches don't toggle isVisibleInLayout, so the layout-show
    // useLayoutEffect never fires for the destination panel. The manager dispatches
    // a single-shot devhub:terminal-window-visible event for the active panel of the
    // destination window; run the exact same workspace-show golden path here so
    // window switches get the same fit/stabilize/recover sequence as tab switches.
    const handleWindowVisible = (event) => {
      const c = readLayoutChurnCtx(ctxRef);
      if (!c) return;
      const {
        id,
        isDisposingRef,
        isVisibleInLayoutRef,
        needsViewportSyncOnShowRef,
        layoutChurnedWhileHiddenRef,
        logViewportDiagnostic,
        syncTerminalViewportOnWorkspaceShowRef,
      } = c;
      if (isDisposingRef.current) return;
      const panelIds = Array.isArray(event?.detail?.panelIds) ? event.detail.panelIds : null;
      if (!panelIds || !panelIds.includes(id)) return;
      if (!isVisibleInLayoutRef.current) {
        needsViewportSyncOnShowRef.current = true;
        layoutChurnedWhileHiddenRef.current = true;
        return;
      }
      logViewportDiagnostic('workspace-window-switch-visible');
      void syncTerminalViewportOnWorkspaceShowRef.current?.('workspace-window-switch-visible', {
        clearAtlas: false,
      });
    };
    // Legacy-only window-visible path; v2 uses soft survivor-recover above.
    if (usesLegacyTerminalSurvivorRecovery(isEngineV2)) {
      window.addEventListener('devhub:terminal-window-visible', handleWindowVisible);
    }

    return () => {
      window.removeEventListener('devhub:terminal-survivor-recover', handleSurvivorRecover);
      window.removeEventListener('devhub:terminal-window-visible', handleWindowVisible);
    };
  }, [ctxRef, isEngineV2]);

  useEffect(() => {
    const handleLayoutSettled = (event) => {
      const c = readLayoutChurnCtx(ctxRef);
      if (!c) return;
      const {
        id,
        initialCommand,
        isDisposingRef,
        termRef,
        fitRef,
        isEngineV2Ref,
        isVisibleInLayoutRef,
        projectionReadyRef,
        hasSentInitialCommand,
        sendInitialCommandIfReady,
        containerRef,
        wsRef,
        lastPtySizeRef,
        tuiSessionActiveRef,
        kimiReadyNotifiedRef,
        hasConnectedOnceRef,
        operationalRendererModeRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        canvasAddonRef,
        webglAddonRef,
        needsViewportSyncOnShowRef,
        layoutChurnedWhileHiddenRef,
        tryReattachCanvasAddonRef,
        fitTerminalViewport,
        maybeConnectAfterViewportFit,
        logViewportDiagnostic,
        syncTerminalViewportOnWorkspaceShow,
        disposeWebglAddonForContextLoss,
        stabilizeTerminalRenderer,
        // use imported refreshTerminalViewport / forceTerminalViewportRepaint —
        // neither is on viewportCtxRef; destructuring would shadow with undefined
        nudgeTerminalPtyResize,
        coalescedForceRepaint,
        scheduleWorkspaceShowRecovery,
        scheduleBoundedForceRepaint,
        scheduleBoundedFitRepaint,
        scheduleBoundedGpuRecover,
        scrollTerminalToBottom,
      } = c;
      if (isDisposingRef.current) return;
      if (!termRef.current || !fitRef.current) return;

      const reason = event?.detail?.reason || 'layout-settled';

      // Phase 6 terminal-engine-v2: only projection/initial-command hooks; no bursts.
      if (!usesLegacyTerminalSurvivorRecovery(isEngineV2Ref.current)) {
        const isProjectionReason =
          String(reason).includes('workspace-created') ||
          String(reason).includes('shared-surface-projection-ready') ||
          String(reason).includes('shared-surface-host-resize');
        if (isProjectionReason && isVisibleInLayoutRef.current) {
          projectionReadyRef.current = true;
          if (initialCommand && !hasSentInitialCommand.current) {
            sendInitialCommandIfReady();
          }
        }
        return;
      }
      const panelIds = Array.isArray(event?.detail?.panelIds) ? event.detail.panelIds : null;
      // Closing a panel in one workspace can re-render the global workspace grid and
      // discard the GPU backing store of panels that are opacity-hidden in other
      // workspaces. Those panels never receive the filtered layout-settled event, so
      // allow panel-closed events to reach every mounted TerminalTTY.
      const isPanelClosedReason = String(reason).includes('panel-closed');
      if (panelIds && panelIds.length > 0 && !panelIds.includes(id) && !isPanelClosedReason) {
        return;
      }

      layoutSettleBurstCleanupRef.current?.();

      // Best-effort recovery for panels that are currently opacity-hidden in another
      // workspace. We cannot fit() safely because the container may be zero-sized, but
      // we can still force the renderer to repaint its internal bitmap and nudge a
      // live TUI so it redraws. This prevents the panel from staying black until a
      // manual resize when a panel is closed elsewhere.
      const recoverHiddenPanelForChurn = (churnReason) => {
        if (!termRef.current || !isTerminalRendererReady(termRef.current)) return;
        try {
          stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
          refreshTerminalViewport(termRef.current);
          forceTerminalViewportRepaint(termRef.current);
          if (tuiSessionActiveRef.current && wsRef.current) {
            nudgeTerminalPtyResize({
              term: termRef.current,
              socket: wsRef.current,
              lastPtySizeRef: lastPtySizeRef.current,
              force: true,
            });
          }
          logViewportDiagnostic(`hidden-panel-churn-recover-${churnReason}`);
        } catch (error) {
          if (!isStaleXtermRendererError(error)) throw error;
        }
      };

      const isProjectionReason =
        String(reason).includes('workspace-created') ||
        String(reason).includes('shared-surface-projection-ready') ||
        String(reason).includes('shared-surface-host-resize');
      if (isProjectionReason && isVisibleInLayoutRef.current) {
        projectionReadyRef.current = true;
        if (initialCommand && !hasSentInitialCommand.current) {
          sendInitialCommandIfReady();
        }
      }

      const kimiTuiLive = isKimiTuiLive({
        initialCommand,
        kimiReady: kimiReadyNotifiedRef.current,
        tuiSessionActive: tuiSessionActiveRef.current,
        hasConnectedOnce: hasConnectedOnceRef.current,
      });

      const isWorkspaceSwitch = String(reason).includes('workspace-switch');
      const isWorkspaceCloseRecover = isWorkspaceCloseRecoverReason(reason);
      const isWorkspaceOrWindowSwitch =
        isWorkspaceSwitch || String(reason).includes('workspace-window');

      // Lightweight guard: if the container dims already match the terminal grid and
      // there is no GPU recovery pending, most layout-settled reasons do not need the
      // heavy fit+repaint burst. This cuts the repeated flicker on workspace switch.
      // Sin-parpadeo fase 2: also require the GPU addon to be attached — during an
      // async reattach window the ref is null and the bitmap is not guaranteed.
      const canSkipLayoutSettledRepaint = () => {
        if (!termRef.current || !fitRef.current || !containerRef.current) return false;
        const proposed = proposeTerminalViewportDimensions({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
        });
        const cols = termRef.current.cols;
        const rows = termRef.current.rows;
        const dimsMatch = proposed && proposed.cols === cols && proposed.rows === rows;
        const noGpuRecovery =
          !pendingWebglRecoveryRef.current &&
          !canvasReleasedOnLayoutHideRef.current &&
          !webglReleasedOnLayoutHideRef.current;
        const gpuAttached = !needsGpuRendererReattach({
          operationalRendererMode: operationalRendererModeRef.current,
          webglAddon: webglAddonRef.current,
          canvasAddon: canvasAddonRef.current,
        });
        return dimsMatch && noGpuRecovery && gpuAttached && cols > 0 && rows > 0;
      };

      // Unified hidden-panel handling: a panel that is opacity-hidden in another
      // workspace cannot run the visible burst safely, but panel-closed churn from
      // any workspace can still corrupt its GPU bitmap. Mark churn for the reveal
      // edge and, for panel-closed, run a lightweight in-place recovery.
      if (!isVisibleInLayoutRef.current) {
        needsViewportSyncOnShowRef.current = true;
        layoutChurnedWhileHiddenRef.current = true;
        if (isPanelClosedReason) {
          recoverHiddenPanelForChurn(reason);
        }
        return;
      }

      if (kimiTuiLive && !String(reason).includes('panel-closed') && !isWorkspaceOrWindowSwitch) {
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: false,
        });
        return;
      }

      if (
        String(reason).includes('shared-surface-projection-ready') ||
        String(reason).includes('shared-surface-host-resize')
      ) {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
          return;
        }
        if (canSkipLayoutSettledRepaint()) {
          logViewportDiagnostic(`${reason}-skipped-no-change`);
          return;
        }
        if (
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          }) &&
          !canvasAddonRef.current
        ) {
          void tryReattachCanvasAddonRef.current?.();
        }
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: true,
        });
        if (
          !isDisposingRef.current &&
          tuiSessionActiveRef.current &&
          termRef.current &&
          isTerminalRendererReady(termRef.current)
        ) {
          refreshTerminalViewport(termRef.current);
          forceTerminalViewportRepaint(termRef.current);
        }
        return;
      }

      if (String(reason).includes('swarm-launch')) {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
          return;
        }
        if (canSkipLayoutSettledRepaint()) {
          logViewportDiagnostic(`${reason}-skipped-no-change`);
          return;
        }
        if (
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          }) &&
          !canvasAddonRef.current
        ) {
          void tryReattachCanvasAddonRef.current?.();
        }
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: true,
        });
        if (
          !isDisposingRef.current &&
          termRef.current &&
          isTerminalRendererReady(termRef.current)
        ) {
          refreshTerminalViewport(termRef.current);
        }
        return;
      }

      if (String(reason).includes('workspace-created')) {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
          return;
        }
        if (canSkipLayoutSettledRepaint()) {
          logViewportDiagnostic(`${reason}-skipped-no-change`);
          return;
        }
        if (
          !hasConnectedOnceRef.current &&
          containerRef.current &&
          termRef.current &&
          fitRef.current
        ) {
          const fitWorked = fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: false,
            lastPtySizeRef: lastPtySizeRef.current,
          });
          maybeConnectAfterViewportFit(fitWorked);
        }
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: false,
        });
        if (
          !isDisposingRef.current &&
          termRef.current &&
          isTerminalRendererReady(termRef.current)
        ) {
          forceTerminalViewportRepaint(termRef.current);
        }
        return;
      }

      if (
        String(reason).includes('panel-group-layout') ||
        String(reason).includes('internal-split-drag-end') ||
        String(reason).includes('right-dock-drag-end') ||
        String(reason).includes('panel-focus-toggle')
      ) {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
          return;
        }
        if (canSkipLayoutSettledRepaint()) {
          logViewportDiagnostic(`${reason}-skipped-no-change`);
          return;
        }
        if (
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          }) &&
          !canvasAddonRef.current
        ) {
          void tryReattachCanvasAddonRef.current?.();
        }
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: true,
        });
        if (
          !isDisposingRef.current &&
          termRef.current &&
          isTerminalRendererReady(termRef.current)
        ) {
          forceTerminalViewportRepaint(termRef.current);
        }
        return;
      }

      if (String(reason).includes('panel-split') || String(reason).includes('panel-relaunch')) {
        if (!isVisibleInLayoutRef.current) {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
          return;
        }
        if (canSkipLayoutSettledRepaint()) {
          logViewportDiagnostic(`${reason}-skipped-no-change`);
          return;
        }
        if (
          shouldAttachCanvasRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          }) &&
          !canvasAddonRef.current
        ) {
          void tryReattachCanvasAddonRef.current?.();
        }
        syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
          clearAtlas: webglReleasedOnLayoutHideRef.current || canvasReleasedOnLayoutHideRef.current,
        });
        if (
          !isDisposingRef.current &&
          termRef.current &&
          isTerminalRendererReady(termRef.current)
        ) {
          forceTerminalViewportRepaint(termRef.current);
        }
        return;
      }

      if (
        String(reason).includes('pizarra-mode-exit') ||
        String(reason).includes('pizarra-mode-enter')
      ) {
        if (
          !hasConnectedOnceRef.current &&
          isVisibleInLayoutRef.current &&
          containerRef.current &&
          termRef.current
        ) {
          const fitWorked = fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: false,
            lastPtySizeRef: lastPtySizeRef.current,
          });
          maybeConnectAfterViewportFit(fitWorked);
        }
        if (isVisibleInLayoutRef.current) {
          syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-immediate`, {
            clearAtlas:
              webglReleasedOnLayoutHideRef.current || canvasReleasedOnLayoutHideRef.current,
          });
          if (
            !isDisposingRef.current &&
            termRef.current &&
            isTerminalRendererReady(termRef.current)
          ) {
            const kimiTuiLive = isKimiTuiLive({
              initialCommand,
              kimiReady: kimiReadyNotifiedRef.current,
            });
            if (tuiSessionActiveRef.current && !kimiTuiLive) {
              scrollTerminalToBottom(true);
            }
            refreshTerminalViewport(termRef.current);
            // The sync pass above already ends with a coalesced force repaint. Using
            // the coalesced variant here (instead of an unconditional force repaint)
            // collapses the two into a single 1-cell nudge, removing the double
            // resize flicker on workspace↔pizarra toggles.
            if (typeof coalescedForceRepaint === 'function') {
              coalescedForceRepaint(termRef.current, { reason: `pizarra-mode-transition` });
            } else {
              forceTerminalViewportRepaint(termRef.current);
            }
          }
        } else {
          needsViewportSyncOnShowRef.current = true;
          layoutChurnedWhileHiddenRef.current = true;
        }
        return;
      }

      if (isWorkspaceCloseRecover) {
        const isWorkspaceRemove = String(reason).includes('workspace-removed');
        const isWindowSwitch = String(reason).includes('workspace-window');
        // Peer close while staying on this workspace (e.g. OpenCode visible): soft+TUI
        // path owns recovery. scheduleWorkspaceShowRecovery fits without SIGWINCH and
        // races survivor-recover — intermittent black on live alternate-screen TUIs.
        if (isWorkspaceRemove) {
          softRevealVisibleSurvivor(c, 'layout-settled-workspace-removed-soft');
          return;
        }
        // Window/workspace switch survivors can have a WebGL addon that is still
        // referenced but whose context was silently lost while the panel was parked.
        // Use the same disposal pattern as window.focus/visibilitychange/pageshow so
        // the recovery path reattaches the renderer instead of bailing out.
        if (
          shouldAttachWebglRenderer({
            operationalRendererMode: operationalRendererModeRef.current,
          }) &&
          isWebglAddonContextLost(webglAddonRef.current)
        ) {
          logViewportDiagnostic(`${reason}-webgl-context-lost`);
          disposeWebglAddonForContextLoss(`${reason}-webgl-context-lost`);
        }
        // Window switch (V1/V2/V3) does not toggle isVisibleInLayout, so live TUIs
        // like OpenCode/Grok never get the layout-show TUI-safe churn path. Run the
        // same fit + stabilize + refresh + force-repaint + forced-SIGWINCH sequence
        // that workspace-show uses for churn recovery.
        if (
          isWindowSwitch &&
          tuiSessionActiveRef.current &&
          termRef.current &&
          containerRef.current &&
          fitRef.current &&
          wsRef.current &&
          !isKimiTuiLive({
            initialCommand,
            kimiReady: kimiReadyNotifiedRef.current,
            tuiSessionActive: tuiSessionActiveRef.current,
            hasConnectedOnce: hasConnectedOnceRef.current,
          })
        ) {
          logViewportDiagnostic(`${reason}-tui-recover`);
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
            forceTerminalViewportRepaint(termRef.current);
          }
          nudgeTerminalPtyResize({
            term: termRef.current,
            socket: wsRef.current,
            lastPtySizeRef: lastPtySizeRef.current,
            force: true,
          });
        }
        const gpuStillAttached = !needsGpuRendererReattach({
          operationalRendererMode: operationalRendererModeRef.current,
          webglAddon: webglAddonRef.current,
          canvasAddon: canvasAddonRef.current,
        });
        const noGpuRecoveryPending =
          !pendingWebglRecoveryRef.current &&
          !canvasReleasedOnLayoutHideRef.current &&
          !webglReleasedOnLayoutHideRef.current;
        // Option B: tab/window switch with live GPU — layout-show soft reveal already repainted.
        if (gpuStillAttached && noGpuRecoveryPending) {
          logViewportDiagnostic(`${reason}-survivor-skipped-gpu-attached`);
          return;
        }
        scheduleWorkspaceShowRecovery(WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON);
        return;
      }

      const extraDelaysMs = String(reason).includes('panel-closed')
        ? [120, 180, 340]
        : isWorkspaceOrWindowSwitch
          ? [80, 180, 340]
          : String(reason).includes('panel-focus-toggle') ||
              String(reason).includes('panel-group-layout')
            ? [120, 180, 340, 500]
            : [180, 340];

      // Sin-parpadeo fase 2: gate ALL burst reasons (previously only workspace/window
      // switches). If the container dims already match the grid, no GPU recovery is
      // pending and the addon is attached, the multi-phase burst only re-paints an
      // already-correct bitmap — that re-paint IS the visible flicker.
      if (canSkipLayoutSettledRepaint()) {
        logViewportDiagnostic(`${reason}-burst-skipped-no-change`);
        return;
      }

      layoutSettleBurstCleanupRef.current = scheduleTerminalViewportSyncBurst(
        (phase) => {
          if (isDisposingRef.current) return;
          if (!isVisibleInLayoutRef.current) {
            needsViewportSyncOnShowRef.current = true;
            layoutChurnedWhileHiddenRef.current = true;
            return;
          }
          // Sin-parpadeo fase 2: deferred phases re-check the gate — when the
          // immediate pass already settled dims with the GPU addon attached, the
          // 80/180/340 ms phases would only re-paint an already-correct bitmap.
          if (phase !== 'immediate' && canSkipLayoutSettledRepaint()) {
            logViewportDiagnostic(`${reason}-burst-phase-skipped-no-change`, { phase });
            return;
          }
          syncTerminalViewportOnWorkspaceShow(`layout-settled-${reason}-${phase}`, {
            clearAtlas: shouldClearGpuAtlasOnWorkspaceShow({
              operationalRendererMode: operationalRendererModeRef.current,
              reason: `layout-settled-${reason}-${phase}`,
              canvasReleasedOnLayoutHide: canvasReleasedOnLayoutHideRef.current,
            }),
          });
          // Retry the force-repaint across frames: a single attempt misses when
          // the GPU renderer is still reattaching async after being released while
          // another workspace was hidden (e.g. close-workspace / workspace-removed
          // bursts), leaving survivor panels black until a manual resize.
          if (!isDisposingRef.current && termRef.current) {
            scheduleBoundedForceRepaint(16);
            // Also re-fit so survivor TUIs that shifted size on close redraw at the
            // new container width (no-op when dims already match; skips kimi).
            scheduleBoundedFitRepaint(16);
            // Deterministic GPU reattach+repaint backbone for survivor panels.
            scheduleBoundedGpuRecover(16);
          }
        },
        { extraDelaysMs }
      );
    };

    window.addEventListener('devhub:terminal-layout-settled', handleLayoutSettled);
    return () => {
      layoutSettleBurstCleanupRef.current?.();
      layoutSettleBurstCleanupRef.current = null;
      window.removeEventListener('devhub:terminal-layout-settled', handleLayoutSettled);
    };
  }, [ctxRef]);
}
