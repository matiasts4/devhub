import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const syncPath = path.join(ROOT, 'src/components/terminal/hooks/useTerminalViewportSync.js');
const ttyPath = path.join(ROOT, 'src/components/TerminalTTY.jsx');
const recoveryPath = path.join(
  ROOT,
  'src/components/terminal/hooks/useTerminalWorkspaceShowRecovery.js'
);

const syncLines = fs.readFileSync(syncPath, 'utf8').split(/\r?\n/);
const ttyLines = fs.readFileSync(ttyPath, 'utf8').split(/\r?\n/);

// Extract bounded-repaint helpers from TerminalTTY (1-based line numbers)
function extractBounded(name, startLine, endLine) {
  const chunk = ttyLines.slice(startLine - 1, endLine).join('\n');
  const match = chunk.match(
    new RegExp(`const ${name} = useCallback\\(([\\s\\S]*?)\\n  \\);`)
  );
  if (!match) throw new Error(`Failed to extract ${name} from TerminalTTY`);
  return match[1].trim();
}

const boundedForceBody = extractBounded('scheduleBoundedForceRepaint', 1687, 1704);
const boundedFitBody = extractBounded('scheduleBoundedFitRepaint', 1730, 1787);
const boundedGpuBody = extractBounded('scheduleBoundedGpuRecover', 1807, 1885);

const ctxDestructure = `    const c = ctxRef.current;
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
    } = c;`;

function wrapBounded(name, body) {
  const arrowIdx = body.indexOf('=>');
  const braceIdx = body.indexOf('{', arrowIdx);
  const injected =
    body.slice(0, braceIdx + 1) + '\n' + ctxDestructure + body.slice(braceIdx + 1);
  return `  const ${name} = useCallback(${injected}, [ctxRef]);`;
}

const recoveryFns = syncLines.slice(507, 1476); // scheduleInactive through scheduleWorkspaceShowRecovery
const syncKeepBefore = syncLines.slice(0, 506); // through fitAndResize
const syncKeepAfter = syncLines.slice(1477, 1785); // sendResize through reactivateTerminalViewport
const syncEffectReturn = syncLines.slice(1786, 1819); // useEffect + return (will patch)

const recoveryHeader = `/**
 * useTerminalWorkspaceShowRecovery — workspace-show sync and bounded repaint recovery.
 * Split from useTerminalViewportSync.js (terminal-decompose Slice C).
 */
/* eslint-disable no-unused-vars -- ctxRef bag destructure */
import { useCallback, useEffect } from 'react';
import { usesLegacyTerminalSurvivorRecovery } from '@/lib/terminal/legacyTerminalSurvivorRecovery';
import {
  fitTerminalViewport,
  proposeTerminalViewportDimensions,
  shouldClearAtlasForSplitCanvas,
  shouldRefitVisibleInactiveSplitPanel,
  isTerminalRendererReady,
  isWebglAddonContextLost,
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
  needsGpuRendererReattach,
  takeHiddenTerminalOutputBuffer,
  chunkTerminalOutputForCatchup,
  shouldDiscardHiddenOutputCatchup,
  terminalBufferHasRenderableContent,
  TERMINAL_SPLIT_WEBGL_PANEL_LIMIT,
  WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON,
} from '@/components/terminal/TerminalTTY.helpers';
import {
  detectKimiReadyFromTerminalBuffer,
  isKimiLaunchCommand,
  isKimiTuiLive,
  shouldFreezeKimiTuiViewportOnWorkspaceShow,
  shouldSkipKimiTuiPtyResize,
} from '@/lib/terminal/kimiReadyMarker';

export default function useTerminalWorkspaceShowRecovery({ ctxRef }) {
`;

const recoveryFooter = `
${wrapBounded('scheduleBoundedForceRepaint', boundedForceBody)}

${wrapBounded('scheduleBoundedFitRepaint', boundedFitBody)}

${wrapBounded('scheduleBoundedGpuRecover', boundedGpuBody)}

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

  return {
    scheduleBoundedForceRepaint,
    scheduleBoundedFitRepaint,
    scheduleBoundedGpuRecover,
    scheduleInactiveViewportRepaint,
    syncTerminalViewportOnWorkspaceShow,
    scheduleWorkspaceShowRecovery,
  };
}
`;

const recoveryContent = recoveryHeader + recoveryFns.join('\n') + recoveryFooter;
fs.writeFileSync(recoveryPath, recoveryContent);

const syncHeader = `/**
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
  isGrokTuiInitialCommand,
} from '@/components/terminal/TerminalTTY.helpers';
import { shouldSkipKimiTuiPtyResize } from '@/lib/terminal/kimiReadyMarker';

export default function useTerminalViewportSync({ ctxRef }) {
`;

const syncEffectPatched = `  useEffect(() => {
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
`;

const syncContent =
  syncHeader + syncKeepBefore.slice(53).join('\n') + '\n' + syncKeepAfter.join('\n') + '\n' + syncEffectPatched;
fs.writeFileSync(syncPath, syncContent);

console.log('recovery lines:', recoveryContent.split('\n').length);
console.log('sync lines:', syncContent.split('\n').length);