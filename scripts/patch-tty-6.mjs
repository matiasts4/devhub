import fs from 'fs';
import path from 'path';

const TTY = path.resolve('src/components/TerminalTTY.jsx');
let src = fs.readFileSync(TTY, 'utf8');

if (!src.includes("import useTerminalV2Session from './terminal/hooks/useTerminalV2Session';")) {
  src = src.replace(
    "import useTerminalWheelRouter from './terminal/hooks/useTerminalWheelRouter';",
    "import useTerminalWheelRouter from './terminal/hooks/useTerminalWheelRouter';\nimport useTerminalV2Session from './terminal/hooks/useTerminalV2Session';"
  );
}

const replacement = `  const connectCtxRef = useRef(null);
  connectCtxRef.current = {
    id,
    cwd,
    initialCommand,
    restored,
    swarmContext,
    autoFocus,
    connectInFlightRef,
    sessionClosingRef,
    wsRef,
    transportRef,
    connectEpochRef,
    connectAbortRef,
    hasConnectedOnceRef,
    initialCommandDelayScheduledRef,
    sessionReattachedRef,
    serverReadyReceivedRef,
    hasSentInitialCommand,
    processExitedRef,
    isEngineV2Ref,
    isDisposingRef,
    termRef,
    serializeAddonRef,
    rehydrationRef,
    dataProcessedSinceSnapshotRef,
    snapshotIntervalRef,
    currentPtyOffsetRef,
    serverTermsizeRef,
    panelActivityTrackerRef,
    hiddenOutputBufferRef,
    hiddenOutputCatchupPendingRef,
    tuiOutputTailRef,
    tuiSessionActiveRef,
    kimiReadyNotifiedRef,
    isGrokSessionRef,
    grokTuiReadyRef,
    tuiSessionFooterConfirmedRef,
    initialCommandConnectSnapshotRef,
    setConnectionState,
    setHasConnectedOnce,
    setRestoredToast,
    setNativeWheelPassthrough,
    clearConnectDeferTimer,
    sendResize,
    writeTerminalOutput,
    scrollIfActivePanel,
    sendInitialCommandIfReady,
    applyTerminalSessionExit,
    notifyAgentReady,
    notifyOpencodeReady,
    onFlushWriteRef,
    sendResizeRef,
  };

  const { connect } = useTerminalV2Session({ ctxRef: connectCtxRef });`;

const start = src.indexOf('  const connect = useCallback(async () => {');
const end = src.indexOf('  connectRef.current = connect;', start);
if (start < 0 || end < 0) throw new Error('connect block not found');
src = src.slice(0, start) + replacement + '\n\n' + src.slice(end);
fs.writeFileSync(TTY, src, 'utf8');
console.log('Patched TerminalTTY.jsx for TTY-6');