/**
 * useTerminalLayoutChurnRecovery — legacy survivor + layout-settled churn recovery.
 * Split from TerminalTTY.jsx (terminal-decompose Slice B).
 */
/* eslint-disable no-unused-vars -- ctxRef bag destructure */
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

export default function useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2 }) {
  const layoutSettleBurstCleanupRef = useRef(null);

  useEffect(() => {
    if (!usesLegacyTerminalSurvivorRecovery(isEngineV2)) {
      return undefined;
    }

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
        fitTerminalViewport,
        lastPtySizeRef,
        stabilizeTerminalRenderer,
        refreshTerminalViewport,
        isTerminalRendererReady,
        coalescedForceRepaint,
        nudgeTerminalPtyResize,
        canvasAddonRef,
        pendingWebglRecoveryRef,
        webglReleasedOnLayoutHideRef,
        canvasReleasedOnLayoutHideRef,
        survivorGpuRecycleAtRef,
        releaseWebglAddonForInactivePanel,
        releaseCanvasAddon,
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
      const isWorkspaceRemove = String(reason).includes('workspace-removed');
      const isWorkspaceWindowSwitch = String(reason).includes('workspace-window-switch');
      // Window/workspace switch survivors can have a WebGL addon that is still
      // referenced but whose context was silently lost while the panel was parked.
      // Use the same disposal pattern as window.focus/visibilitychange/pageshow so
      // the recovery path reattaches the renderer instead of bailing out.
      if (
        !isWorkspaceRemove &&
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
              reason: 'survivor-window-switch-tui',
            });
          }
          nudgeTerminalPtyResize({
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
      if (!isWorkspaceRemove && gpuStillAttached && noGpuRecoveryPending) {
        // layout-show soft reveal owns tab/window park when GPU stayed attached.
        return;
      }
      // Workspace/window switches keep terminals mounted and the GPU addon attached.
      // Only a real workspace removal needs the costly GPU recycle + reattach cycle.
      const now = Date.now();
      if (isWorkspaceRemove && now - survivorGpuRecycleAtRef.current > 1500) {
        survivorGpuRecycleAtRef.current = now;
        if (webglAddonRef.current) {
          releaseWebglAddonForInactivePanel('survivor-recover-webgl');
        } else if (canvasAddonRef.current) {
          releaseCanvasAddon('survivor-recover-canvas');
        }
        needsViewportSyncOnShowRef.current = true;
      }
      const recoverReason = isWorkspaceRemove
        ? WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON
        : isWorkspaceWindowSwitch
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
    window.addEventListener('devhub:terminal-window-visible', handleWindowVisible);

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
        refreshTerminalViewport,
        // use imported forceTerminalViewportRepaint — not always on ctxRef
        nudgeTerminalPtyResize,
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
        return dimsMatch && noGpuRecovery && cols > 0 && rows > 0;
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
            forceTerminalViewportRepaint(termRef.current);
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
        // Window/workspace switch survivors can have a WebGL addon that is still
        // referenced but whose context was silently lost while the panel was parked.
        // Use the same disposal pattern as window.focus/visibilitychange/pageshow so
        // the recovery path reattaches the renderer instead of bailing out.
        if (
          !isWorkspaceRemove &&
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
        if (!isWorkspaceRemove && gpuStillAttached && noGpuRecoveryPending) {
          logViewportDiagnostic(`${reason}-survivor-skipped-gpu-attached`);
          return;
        }
        // Workspace close may dispose peer GPU contexts after the first pass — keep survivor path.
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

      // Workspace/window switches with mounted terminals and no GPU recovery do not
      // need the multi-phase repaint burst. The layout-show useLayoutEffect already
      // handles the single repaint needed for instant reactivation.
      if (isWorkspaceOrWindowSwitch && canSkipLayoutSettledRepaint()) {
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
