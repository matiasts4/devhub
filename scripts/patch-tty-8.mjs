import fs from 'fs';

const TTY = 'src/components/TerminalTTY.jsx';
const lines = fs.readFileSync(TTY, 'utf8').split(/\r?\n/);

if (lines.some((l) => l.includes('viewportCtxRef'))) {
  console.log('TTY-8 already patched');
  process.exit(0);
}

const deleteRanges = [
  [3083, 3198],
  [3035, 3081],
  [2941, 3033],
  [2937, 2939],
  [2390, 2935],
  [1981, 2094],
  [1902, 1948],
  [1852, 1900],
  [1833, 1850],
  [1487, 1506],
];

const deleteSet = new Set();
for (const [start, end] of deleteRanges) {
  for (let i = start; i <= end; i += 1) deleteSet.add(i);
}

const kept = lines.filter((_, idx) => !deleteSet.has(idx + 1));
let src = kept.join('\n');

if (!src.includes("import useTerminalViewportSync from './terminal/hooks/useTerminalViewportSync';")) {
  src = src.replace(
    "import useTerminalRendererController from './terminal/hooks/useTerminalRendererController';",
    "import useTerminalRendererController from './terminal/hooks/useTerminalRendererController';\nimport useTerminalViewportSync from './terminal/hooks/useTerminalViewportSync';"
  );
}

const hookBlock = `  const viewportCtxRef = useRef(null);
  const {
    waitForVisibleDimensions,
    confirmViewportFit,
    maybeConnectAfterViewportFit,
    fitAndResize,
    sendResize,
    reactivateTerminalViewport,
    scheduleInactiveViewportRepaint,
    syncTerminalViewportOnWorkspaceShow,
    scheduleWorkspaceShowRecovery,
  } = useTerminalViewportSync({ ctxRef: viewportCtxRef });

`;

const ctxAssign = `  viewportCtxRef.current = {
    id, cwd, initialCommand, autoFocus, coldMountOrdinal, restored,
    termRef, fitRef, containerRef, wsRef, rafRef, timeoutRef,
    isDisposingRef, isActivePanelRef, isVisibleInLayoutRef,
    operationalRendererModeRef, visibleTerminalPanelCountRef,
    lastPtySizeRef, connectPendingUntilFitRef, connectDeferTimerRef,
    connectRef, sessionClosingRef, hasConnectedOnceRef,
    needsViewportSyncOnShowRef, layoutChurnedWhileHiddenRef,
    layoutHiddenGenerationRef, containerWasZeroSizedOnShowRef,
    workspaceShowRecoverTimerRef, workspaceShowZeroSizeObserverRef,
    inactiveRepaintRafRef, pendingWebglRecoveryRef,
    webglReleasedOnLayoutHideRef, canvasReleasedOnLayoutHideRef,
    hiddenOutputBufferRef, hiddenOutputCatchupPendingRef,
    sessionReattachedRef, tuiSessionActiveRef, kimiReadyNotifiedRef,
    isEngineV2Ref, webglFallbackRef, webglAddonRef, canvasAddonRef,
    viewportFitConfirmedRef, lastViewportReadyPostedRef,
    hasSentInitialCommand, isGrokSessionRef,
    clearTimers, clearConnectDeferTimer, scheduleConnectDeferForce,
    sendResizeRef, tryReattachWebglAddonRef, tryReattachCanvasAddonRef,
    syncTerminalViewportOnWorkspaceShowRef, scheduleWorkspaceShowRecoveryRef,
    reactivateTerminalViewportRef,
    notifyViewportReady, restoreInitialCommandDispatchGuard,
    scheduleInitialCommandAfterViewport, logViewportDiagnostic,
    scrollTerminalToBottom, scrollIfActivePanel,
    disposeWebglAddonForContextLoss, scheduleWebglRecovery,
    coalescedForceRepaint, scheduleBoundedGpuRecover,
    scheduleBoundedFitRepaint, scheduleBoundedForceRepaint,
    buildViewportSnapshot,
    confirmViewportFit, maybeConnectAfterViewportFit, fitAndResize,
    scheduleInactiveViewportRepaint, syncTerminalViewportOnWorkspaceShow,
    scheduleWorkspaceShowRecovery, sendResize, reactivateTerminalViewport,
  };

`;

const insertBefore = '  const scrollIfActivePanel = useCallback(() => {';
const idx = src.indexOf(insertBefore);
if (idx < 0) throw new Error('insert point not found');

src = src.slice(0, idx) + hookBlock + src.slice(idx);

const rendererAssign = src.indexOf('  rendererCtxRef.current = {');
if (rendererAssign < 0) throw new Error('rendererCtxRef assign not found');
src = src.slice(0, rendererAssign) + ctxAssign + src.slice(rendererAssign);

fs.writeFileSync(TTY, src, 'utf8');
console.log('Patched TTY-8, deleted', deleteSet.size, 'lines');