import fs from 'fs';

const TTY = 'src/components/TerminalTTY.jsx';
const lines = fs.readFileSync(TTY, 'utf8').split(/\r?\n/);

if (lines.some((l) => l.includes('engineCtxRef'))) {
  console.log('TTY-9 already patched');
  process.exit(0);
}

const deleteRanges = [
  [3679, 4229],
  [730, 990],
];

const deleteSet = new Set();
for (const [start, end] of deleteRanges) {
  for (let i = start; i <= end; i += 1) deleteSet.add(i);
}

let src = lines.filter((_, idx) => !deleteSet.has(idx + 1)).join('\n');

if (!src.includes("import useTerminalEngine from './terminal/hooks/useTerminalEngine';")) {
  src = src.replace(
    "import useTerminalViewportSync from './terminal/hooks/useTerminalViewportSync';",
    "import useTerminalViewportSync from './terminal/hooks/useTerminalViewportSync';\nimport useTerminalEngine from './terminal/hooks/useTerminalEngine';"
  );
}

const hookBlock = `  const engineCtxRef = useRef(null);
  const { disposeXtermRuntime } = useTerminalEngine({ ctxRef: engineCtxRef });

`;

const ctxAssign = `  engineCtxRef.current = {
    id, cwd, autoFocus, coldMountOrdinal, fontSize, restored, initialCommand,
    isDisposingRef, connectEpochRef, panelActivityTrackerRef, connectAbortRef,
    requestedRendererModeRef, isVisibleInLayoutRef, termRef, resizeObserverRef,
    clearTimers, clearConnectDeferTimer, clearOutputQueue, wsRef, isEngineV2Ref,
    serializeAddonRef, currentPtyOffsetRef, terminalBlurCleanupRef, webglAddonRef,
    canvasAddonRef, fitRef, searchRef, containerRef, outputPendingRef,
    hiddenOutputBufferRef, hiddenOutputCatchupPendingRef, connectPendingUntilFitRef,
    connectDeferTimerRef, surfaceHostRef, lastPtySizeRef, stashTerminalPanelBridge,
    setInitError, setIsInitializing, setConnectionState, setWebglFallback,
    rendererViewModel, operationalRendererModeRef, visibleTerminalPanelCountRef,
    isActivePanelRef, tuiSessionActiveRef, isGrokSessionRef, grokTuiReadyRef,
    tuiSessionFooterConfirmedRef, isInitializingRef, handleWebglContextLossRef,
    pendingWebglRecoveryRef, tuiResizeDebounceTimerRef, needsViewportSyncOnShowRef,
    nativeResizeObserverRef, nativeResizeRafRef, connectRef, sendResizeRef,
    tryReattachWebglAddonRef, tryReattachCanvasAddonRef, writeTerminalOutput,
    waitForVisibleDimensions, maybeConnectAfterViewportFit, coalescedSoftGpuVisibilityReveal,
    scheduleInactiveViewportRepaint, logViewportDiagnostic, shouldBootXterm, runtimePhase,
    xtermBootNonce, disposeXtermRuntime,
  };

`;

const insertBefore = '  const shouldRetryNativeVteProbe =';
const idx = src.indexOf(insertBefore);
if (idx < 0) throw new Error('insert point not found');
src = src.slice(0, idx) + hookBlock + src.slice(idx);

const viewportAssign = src.indexOf('  viewportCtxRef.current = {');
if (viewportAssign < 0) throw new Error('viewportCtxRef assign not found');
src = src.slice(0, viewportAssign) + ctxAssign + src.slice(viewportAssign);

fs.writeFileSync(TTY, src, 'utf8');
console.log('Patched TTY-9');