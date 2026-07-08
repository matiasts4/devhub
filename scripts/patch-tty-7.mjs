import fs from 'fs';

const TTY = 'src/components/TerminalTTY.jsx';
const lines = fs.readFileSync(TTY, 'utf8').split(/\r?\n/);

if (lines.some((l) => l.includes('rendererCtxRef'))) {
  console.log('TTY-7 already patched');
  process.exit(0);
}

// 1-based inclusive line ranges to delete (survivor releaseWebglAddon kept)
// After TTY-6 commit, line numbers shifted — survivor block stays; drop duplicate `);` if present
const deleteRanges = [
  [1967, 1993],
  [2108, 2126],
  [2157, 2218],
  [2220, 2305],
  [2307, 2326],
  [2328, 2374],
  [2376, 2378],
];

const deleteSet = new Set();
for (const [a, b] of deleteRanges) {
  for (let i = a; i <= b; i += 1) deleteSet.add(i);
}

const kept = [];
lines.forEach((line, idx) => {
  const n = idx + 1;
  if (!deleteSet.has(n)) kept.push(line);
});

let src = kept.join('\n');

if (!src.includes("import useTerminalRendererController from './terminal/hooks/useTerminalRendererController';")) {
  src = src.replace(
    "import useTerminalV2Session from './terminal/hooks/useTerminalV2Session';",
    "import useTerminalV2Session from './terminal/hooks/useTerminalV2Session';\nimport useTerminalRendererController from './terminal/hooks/useTerminalRendererController';"
  );
}

const hookBlock = `  const rendererCtxRef = useRef(null);
  const {
    disposeWebglAddonForContextLoss,
    tryReattachWebglAddon,
    tryReattachCanvasAddon,
    releaseCanvasAddon,
    scheduleWebglRecovery,
    handleWebglContextLoss,
  } = useTerminalRendererController({ ctxRef: rendererCtxRef });

  tryReattachWebglAddonRef.current = tryReattachWebglAddon;
  tryReattachCanvasAddonRef.current = tryReattachCanvasAddon;

`;

const ctxAssign = `  rendererCtxRef.current = {
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
  };

`;

const insertBefore = '  const scheduleInactiveViewportRepaint = useCallback(() => {';
const idx = src.indexOf(insertBefore);
if (idx < 0) throw new Error('insert point not found after deletions');

src = src.slice(0, idx) + hookBlock + src.slice(idx);

const connectIdx = src.indexOf('  const connectCtxRef = useRef(null);');
if (connectIdx < 0) throw new Error('connectCtxRef not found');
src = src.slice(0, connectIdx) + ctxAssign + src.slice(connectIdx);

fs.writeFileSync(TTY, src, 'utf8');
console.log('Patched TTY-7, deleted', deleteSet.size, 'lines');