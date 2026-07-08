import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(ROOT, 'src/components/TerminalTTY.jsx'), 'utf8').split(/\r?\n/);

function extractFn(start, end) {
  const chunk = lines.slice(start - 1, end).join('\n');
  const idx = chunk.indexOf('useCallback(');
  if (idx < 0) throw new Error(`useCallback not found ${start}-${end}`);
  const after = chunk.slice(idx + 'useCallback('.length);
  const multilineClose = after.lastIndexOf('\n    },\n    [');
  const singleClose = after.lastIndexOf('\n  }, [');
  const close = Math.max(multilineClose, singleClose);
  if (close < 0) throw new Error(`deps close not found ${start}-${end}`);
  const bodyEnd =
    multilineClose >= singleClose ? multilineClose + '\n    }'.length : singleClose + '\n  }'.length;
  return after.slice(0, bodyEnd).trim();
}

const fns = {
  waitForVisibleDimensions: extractFn(1487, 1506),
  confirmViewportFit: extractFn(1833, 1850),
  maybeConnectAfterViewportFit: extractFn(1852, 1900),
  fitAndResize: extractFn(1902, 1948),
  scheduleInactiveViewportRepaint: extractFn(1981, 2094),
  syncTerminalViewportOnWorkspaceShow: extractFn(2390, 2935),
  scheduleWorkspaceShowRecovery: extractFn(2945, 3033),
  sendResize: extractFn(3035, 3081),
  reactivateTerminalViewport: extractFn(3083, 3198),
};

const ctxDestructure = `    const c = ctxRef.current;
    const {
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
      notifyViewportReady, restoreInitialCommandDispatchGuard,
      scheduleInitialCommandAfterViewport, logViewportDiagnostic,
      scrollTerminalToBottom, scrollIfActivePanel,
      disposeWebglAddonForContextLoss, scheduleWebglRecovery,
      coalescedForceRepaint, confirmViewportFit, maybeConnectAfterViewportFit,
      fitAndResize, scheduleInactiveViewportRepaint,
      syncTerminalViewportOnWorkspaceShow, scheduleWorkspaceShowRecovery,
      sendResize, reactivateTerminalViewport,
      scheduleBoundedGpuRecover, scheduleBoundedFitRepaint,
      scheduleBoundedForceRepaint, buildViewportSnapshot,
    } = c;`;

function wrap(name, sigBody) {
  const arrowIdx = sigBody.indexOf('=>');
  const braceIdx = sigBody.indexOf('{', arrowIdx);
  const injected =
    sigBody.slice(0, braceIdx + 1) + '\n' + ctxDestructure + sigBody.slice(braceIdx + 1);
  return `  const ${name} = useCallback(${injected}, [ctxRef]);`;
}

const header = `/**
 * useTerminalViewportSync — fit, resize, workspace-show recovery.
 * Extracted from TerminalTTY.jsx (terminal-decompose TTY-8).
 */
/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps -- ctxRef bag destructure */
import { useCallback, useEffect } from 'react';
import { cliLog, usesLegacyTerminalSurvivorRecovery } from '@/components/terminal/TerminalTTY.helpers';
import {
  fitTerminalViewport,
  proposeTerminalViewportDimensions,
  shouldDeferTerminalConnectUntilViewportFitted,
  resolveColdMountStaggerMs,
  shouldClearAtlasForSplitCanvas,
  shouldSkipKimiTuiPtyResize,
  shouldRefitVisibleInactiveSplitPanel,
  isTerminalRendererReady,
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
`;

let body = '';
for (const [name, sigBody] of Object.entries(fns)) {
  body += wrap(name, sigBody) + '\n\n';
}

const footer = `
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
  }, [ctxRef, syncTerminalViewportOnWorkspaceShow, scheduleWorkspaceShowRecovery, reactivateTerminalViewport, sendResize]);

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
`;

const out = path.join(ROOT, 'src/components/terminal/hooks/useTerminalViewportSync.js');
const full = header + body + footer;
fs.writeFileSync(out, full, 'utf8');
console.log('Wrote', out, full.split('\n').length, 'lines');