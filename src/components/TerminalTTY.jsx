'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardPaste, Copy, Loader2, RotateCcw, Wifi, WifiOff, X } from 'lucide-react';
import { getTerminalTheme } from '@/components/terminal/TerminalThemeSync';
import {
  getTerminalAppShellStyle,
  getTerminalFloatingControlStyle,
  getTerminalTitleBarStyle,
  getTerminalViewportFrameStyle,
} from '@/components/terminal/terminalChromeStyles';
import WebglErrorSection from './terminal/components/WebglErrorSection';
import useTerminalOutputQueue from './terminal/hooks/useTerminalOutputQueue';
import useTerminalClipboard from './terminal/hooks/useTerminalClipboard';
import useTerminalWheelRouter from './terminal/hooks/useTerminalWheelRouter';
import useTerminalV2Session from './terminal/hooks/useTerminalV2Session';
import useTerminalRendererController from './terminal/hooks/useTerminalRendererController';
import useTerminalViewportSync from './terminal/hooks/useTerminalViewportSync';
import useTerminalWorkspaceShowRecovery from './terminal/hooks/useTerminalWorkspaceShowRecovery';
import useTerminalLayoutChurnRecovery from './terminal/hooks/useTerminalLayoutChurnRecovery';
import useTerminalEngine from './terminal/hooks/useTerminalEngine';
import useTerminalRendererState from './terminal/hooks/useTerminalRendererState';
import useTerminalStatusState from './terminal/hooks/useTerminalStatusState';
import useTerminalFontSize from './terminal/hooks/useTerminalFontSize';
import useTerminalTypographySync from './terminal/hooks/useTerminalTypographySync';
import { resolveTerminalTypography } from './terminal/terminalTypographyPreferences';
import useTerminalViewportPointer from './terminal/hooks/useTerminalViewportPointer';
import useTerminalScrollPreserve from './terminal/hooks/useTerminalScrollPreserve';
import useTerminalSearchAndZedInput from './terminal/hooks/useTerminalSearchAndZedInput';
import useTerminalPanelActivationRecovery from './terminal/hooks/useTerminalPanelActivationRecovery';
import useTerminalAutoReconnect from './terminal/hooks/useTerminalAutoReconnect';
import useTerminalWindowEventRouter from './terminal/hooks/useTerminalWindowEventRouter';
import useTerminalSessionExit from './terminal/hooks/useTerminalSessionExit';
import useTerminalInitialCommandLifecycle from './terminal/hooks/useTerminalInitialCommandLifecycle';
import useTerminalNativeVteLifecycle from './terminal/hooks/useTerminalNativeVteLifecycle';
import useTerminalRendererMigration from './terminal/hooks/useTerminalRendererMigration';
import {
  readClipboardImage,
  readClipboardText,
  saveClipboardImageToTempFile,
  terminalClipboardEventBelongsToPanel,
} from '@/lib/terminal/terminalClipboard';
import {
  getTerminalRendererFallbackCopy,
  getTerminalRendererOptionLabel,
  getTerminalRendererWebglFallbackCopy,
  resolveRendererSelection,
  TERMINAL_SPLIT_WEBGL_PANEL_LIMIT,
} from '@/components/terminal/terminalRendererCapabilities';
import { getTerminalFontOptions } from '@/components/terminal/TerminalThemeSync';
import { extractOpenCodeSessionId } from '@/lib/terminal/restorePolicyResolver';
import {
  containsTerminalResponseNoise,
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
} from '@/lib/terminal/terminalNoiseFilter';
import { getTuiAdapter } from '@/lib/terminal/tuiAdapter';
import {
  detectOpenCodeTuiReady,
  shouldDiscardOpenCodeCatchupReplay,
} from '@/lib/terminal/opencodeReadyMarker';
import {
  detectKimiReadyFromTerminalBuffer,
  detectKimiTuiReady,
  isKimiLaunchCommand,
  isKimiTuiLive,
  shouldFreezeKimiTuiViewportOnWorkspaceShow,
  shouldSkipKimiTuiPtyResize,
} from '@/lib/terminal/kimiReadyMarker';
import { detectAgentTypeFromCommand } from '@/lib/terminal/agentTuiMetadata';
import { createPanelActivityTracker } from '@/components/terminal/utils/panelActivityTracker';
import { clearPanelActivity } from '@/components/terminal/utils/panelActivityStore';
import { clearPanelInitialCommandLifecycle } from '@/lib/terminal/panelInitialCommandLifecycle';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';
import { getTerminalLayoutSettledGeneration } from '@/components/terminal/nativeLayoutSync';
import { usesLegacyTerminalSurvivorRecovery } from '@/lib/terminal/legacyTerminalSurvivorRecovery';
import {
  cancelNativeVteLayoutHide,
  clearNativeVteLease,
} from '@/lib/terminal/nativeVteLayoutLifecycle';
import { NATIVE_VTE_STUBS } from '@/lib/terminal/nativeVteNoopStubs';
import {
  takeTerminalPanelBridge,
  stashTerminalPanelBridge,
} from '@/lib/terminal/terminalPanelBridge';
import {
  hasSurface as graveyardHasSurface,
  restoreSurface as graveyardRestoreSurface,
  stashSurface as graveyardStashSurface,
} from '@/lib/terminal/v2Graveyard';
import { buildTerminalLifecycleEvent } from '@/lib/terminal/terminalLifecycleEvent';
import { clearPanelSessionExit, readPanelSessionExit } from '@/lib/terminal/agentSessionExit';

import {
  cliLog,
  attachTerminalRendererAddons,
  neutralizeWebglAddonForDisposal,
  getXtermContainerAnimProps,
  resolveColdMountStaggerMs,
  disableTerminalFocusReporting,
  prepareActiveTuiTerminalFocus,
  resetTerminalModesForReattach,
  normalizeTuiInitialCommand,
  isLikelyTuiInitialCommand,
  isGrokTuiInitialCommand,
  detectGrokTuiReady,
  detectGrokSessionFromOutput,
  shouldPassthroughNativeTuiWheel,
  resolveTerminalWheelScrollPrefer,
  shouldInjectGrokWheelSgr,
  shouldScrollKimiWheelLocally,
  resolveGrokWheelSgrCoords,
  buildGrokWheelScrollPayload,
  buildTerminalWheelArrowSequence,
  buildTerminalWheelScrollPayload,
  buildTerminalWheelSgrSequence,
  resolveTerminalPointerElement,
  isForwardedTerminalWheelEvent,
  forwardTerminalWheelToXterm,
  refreshTerminalViewport,
  forceTerminalViewportRepaint,
  nudgeTerminalViewportRepaint,
  stabilizeTerminalRenderer,
  isTerminalRendererReady,
  isWebglAddonContextLost,
  fitTerminalViewport,
  buildTerminalViewportDiagnosticPayload,
  shouldLogTerminalViewportDiagnostic,
  createTerminalViewportDiagnosticLogger,
  resolveTerminalConnectionCloseState,
  resolveTerminalClipboardShortcut,
  getClipboardApi,
  sendTerminalPasteInput,
  getTerminalRuntimePlatform,
  isTerminalViewportNearBottom,
  shouldUseTerminalScrollbackWheel,
  shouldInjectTerminalWheelIntoPty,
  scrollTerminalViewport,
  resolveTerminalWheelScrollDirection,
  resolveTerminalWheelPageSteps,
  buildTerminalWheelPageSequence,
  resolveTerminalScreenElement,
  shouldRouteWheelToTranscript,
  shouldRunPanelClickViewportRecovery,
  shouldClearWebglAtlasOnPanelActivation,
  shouldSkipReactivateViewportOnPanelActivation,
  shouldAttachWebglRenderer,
  shouldBlockV2WebglRecovery,
  shouldUseLegacySurvivorRecovery,
  shouldFreezeSingleWebglViewportOnWorkspaceShow,
  shouldAttachCanvasRenderer,
  shouldMountCanvasAddon,
  shouldUseGpuTerminalRenderer,
  needsGpuRendererReattach,
  shouldSkipGpuVisibilityReveal,
  shouldSoftGpuWorkspaceReveal,
  resolveWorkspaceLayoutShowRevealMode,
  performSoftGpuVisibilityReveal,
  flushHiddenTerminalCatchupToTerm,
  shouldRefitVisibleInactiveSplitPanel,
  shouldSyncTerminalViewportOnLayoutShow,
  resolveConnectInitialCommandState,
  isWorkspaceLayoutSwitchReason,
  isWorkspaceSurvivorRecoverLayoutReason,
  shouldFreezeDomViewportOnAppResume,
  shouldFreezeDomViewportOnWorkspaceShow,
  shouldSkipRedundantLayoutSettleViewportSync,
  shouldSkipTerminalOutputWhileLayoutHidden,
  appendHiddenTerminalOutputBuffer,
  takeHiddenTerminalOutputBuffer,
  shouldDiscardHiddenOutputCatchup,
  terminalBufferHasRenderableContent,
  chunkTerminalOutputForCatchup,
  nudgeTerminalPtyResize,
  shouldClearAtlasForSplitCanvas,
  shouldClearGpuAtlasOnWorkspaceShow,
  shouldReleaseWebglRendererOnLayoutHide,
  shouldReleaseCanvasRendererOnLayoutHide,
  resolveTerminalRuntimePhase,
  shouldBootXtermRuntime,
  getTerminalRendererStatusCopy,
  getTerminalRendererRecoveryActionLabel,
  shouldReinitializeTerminalForRenderer,
  shouldBlockTerminalViewportForWebglFallback,
  TERMINAL_VIEWPORT_SHELL_STYLE,
  TERMINAL_NATIVE_CONTENT_BODY_STYLE,
  resolveTerminalFontFamily,
  TERMINAL_CONNECT_DEFER_MAX_MS,
  TERMINAL_PROJECTION_READY_TIMEOUT_MS,
  TERMINAL_COLD_MOUNT_STAGGER_MS,
  TERMINAL_DISABLE_FOCUS_REPORTING_SEQ,
  TERMINAL_DISABLE_MOUSE_REPORTING_SEQ,
  TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ,
  TERMINAL_DISABLE_FOCUS_AND_MOUSE_REPORTING_SEQ,
  TERMINAL_SYNC_OUTPUT_START_SEQ,
  TERMINAL_SYNC_OUTPUT_END_SEQ,
  TERMINAL_SYNC_OUTPUT_MAX_HOLD_MS,
  TERMINAL_OUTPUT_MAX_BYTES_PER_FRAME,
  TERMINAL_OUTPUT_BACKLOG_THRESHOLD,
  TERMINAL_SNAPSHOT_THRESHOLD_BYTES,
  TERMINAL_SNAPSHOT_MAX_INTERVAL_MS,
  TERMINAL_GROK_INPUT_ZONE_ROWS,
  TERMINAL_WHEEL_FORWARD_FLAG,
  TERMINAL_PAGE_UP_SEQ,
  TERMINAL_PAGE_DOWN_SEQ,
  TERMINAL_DEFAULT_INPUT_ZONE_ROWS,
  HIDDEN_TERMINAL_OUTPUT_BUFFER_MAX,
  HIDDEN_OUTPUT_CATCHUP_DISCARD_BYTES,
  HIDDEN_OUTPUT_CATCHUP_CHUNK_BYTES,
  isTerminalViewportUndersized,
  shouldDeferTerminalConnectUntilViewportFitted,
} from './terminal/TerminalTTY.helpers';

export * from './terminal/TerminalTTY.helpers';

/**
 * Bump this string whenever you need to PROVE the running dev server picked up a
 * new edit to this file — it re-fires on every fresh module evaluation (full
 * restart, or a Fast-Refresh full-reload of this module). Read it two ways:
 *   1. Watch the `pnpm tauri dev` terminal for `[devhub-log] [BUILD] ...` on startup.
 *   2. In the running app's devtools console: window.__DEVHUB_BUILD_MARKERS__.terminalTTY
 * If the marker you see does NOT match the one below, the running window is on stale code.
 */
const TERMINAL_TTY_BUILD_MARKER = '2026-07-04-window-switch-tui-safe-recover-v2';
if (typeof window !== 'undefined') {
  window.__DEVHUB_BUILD_MARKERS__ = window.__DEVHUB_BUILD_MARKERS__ || {};
  if (window.__DEVHUB_BUILD_MARKERS__.terminalTTY !== TERMINAL_TTY_BUILD_MARKER) {
    window.__DEVHUB_BUILD_MARKERS__.terminalTTY = TERMINAL_TTY_BUILD_MARKER;
    cliLog('BUILD', `TerminalTTY.jsx loaded — marker=${TERMINAL_TTY_BUILD_MARKER}`);
  }
}
export default function TerminalTTY({
  id,
  onClose,
  onActivatePanel,
  cwd,
  autoFocus,
  hideTitleBar,
  initialCommand,
  restored,
  // Enforced: we only ever activate xterm-webgl (with plain xterm fallback on webgl failure).
  // Legacy 'vte-experimental' requests are normalized upstream; we still accept the prop
  // for compatibility but force the webgl path and skip all native VTE mounting.
  requestedRendererMode = 'xterm-webgl',
  onResetRendererToXterm,
  visibleTerminalPanelCount = 1,
  isActivePanel = autoFocus,
  isVisibleInLayout = true,
  isWorkspaceShellVisible = true,
  suspendNativeSurface = false,
  nativeSurfacePolicy = 'live',
  runtimePlatform,
  showQuickCopyButton = true,
  swarmContext = null,
  connectionState: externalConnectionState,
  onConnectionStateChange,
  surfaceHost = 'workspace',
  coldMountOrdinal = 0,
  isEngineV2 = false,
}) {
  const terminalRootRef = useRef(null);
  const containerRef = useRef(null);
  const viewportShellRef = useRef(null);

  // We keep the root bg in sync with the terminal theme so there are no
  // "letterbox" flashes or thin frames when the TUI draws full-bleed boxes.
  // The real content (xterm canvas) now starts closer to the panel edges.
  const nativePlaceholderRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  // True only while disposeXtermRuntime is tearing the runtime down. Async
  // callbacks queued before teardown (fit rAFs, resize observers, ws onmessage,
  // font-size refit) re-check this and bail, so they cannot touch a terminal
  // whose renderer slot is being cleared — the WebKitGTK `_renderer.value
  // .handleResize` stale-renderer race (docs/errores/03-*). A.4.
  const isDisposingRef = useRef(false);
  const panelActivityTrackerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const nativeResizeObserverRef = useRef(null);
  const nativeResizeRafRef = useRef(null);
  const nativeResizeSettleTimersRef = useRef([]);
  const wsRef = useRef(null);
  const connectInFlightRef = useRef(false);
  const connectEpochRef = useRef(0);
  const connectAbortRef = useRef(null);
  const sessionClosingRef = useRef(false);
  const searchRef = useRef(null);
  const transportRef = useRef('json');
  const lastViewportDiagnosticRef = useRef(null);
  const connectionStateRef = useRef('idle');
  const requestedRendererModeRef = useRef(requestedRendererMode);
  const nativeLeaseRef = useRef(false);
  const nativeVteProbeRetryCountRef = useRef(0);
  const nativeVteProbeRetryTimerRef = useRef(null);
  const nativeVteProbeRetryDelayRef = useRef(null);
  const shouldRetryNativeVteProbeRef = useRef(false);
  const hideTimerRef = useRef(null);
  const prevRequestedRendererModeRef = useRef(requestedRendererMode);
  const restoredHiddenLeaseThisMountRef = useRef(false);
  const lastViewportYRef = useRef(null);
  const lastPointerZoneRef = useRef('transcript');
  const tuiSessionActiveRef = useRef(isLikelyTuiInitialCommand(initialCommand));
  const tuiSessionFooterConfirmedRef = useRef(false);
  const grokTuiReadyRef = useRef(isGrokTuiInitialCommand(initialCommand));
  const isGrokSessionRef = useRef(isGrokTuiInitialCommand(initialCommand));
  const [nativeWheelPassthrough, setNativeWheelPassthrough] = useState(false);

  const FONT_SIZE_KEY = 'devhub:terminalFontSize';
  const [fontSize, setFontSize] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const fromTypography = resolveTerminalTypography(window.localStorage)?.fontSize;
        if (Number.isFinite(fromTypography) && fromTypography >= 8 && fromTypography <= 24) {
          return fromTypography;
        }
        const stored = window.localStorage.getItem(FONT_SIZE_KEY);
        const parsed = stored ? parseInt(stored, 10) : NaN;
        if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 24) return parsed;
      }
      return resolveTerminalTypography(null).fontSize;
    } catch {
      return 13;
    }
  });

  const [isInitializing, setIsInitializing] = useState(true);
  const isInitializingRef = useRef(false);
  const [initError, setInitError] = useState(null);
  const [internalConnectionState, setInternalConnectionState] = useState('idle');
  const connectionState =
    externalConnectionState !== undefined ? externalConnectionState : internalConnectionState;
  const setConnectionState =
    externalConnectionState !== undefined ? () => {} : setInternalConnectionState;
  const [restoredToast, setRestoredToast] = useState(false);
  const [nativeVteProbeResult, setNativeVteProbeResult] = useState(null);
  const [nativeVteOpenFailure, setNativeVteOpenFailure] = useState(null);
  const [nativeVteOpened, setNativeVteOpened] = useState(false);
  const [nativeVteProbeAttempt, setNativeVteProbeAttempt] = useState(0);
  const [nativeVteRecoveryAttempt, setNativeVteRecoveryAttempt] = useState(0);
  const [xtermBootNonce, setXtermBootNonce] = useState(0);
  const webglAddonRef = useRef(null);
  const canvasAddonRef = useRef(null);
  const terminalBlurCleanupRef = useRef(null);
  const tauriAvailable = false;

  const { focusNativeVtePanel, pasteNativeVtePanel } = NATIVE_VTE_STUBS;

  const resolvedRuntimePlatform = getTerminalRuntimePlatform(runtimePlatform);

  const {
    operationalRendererMode,
    rendererViewModel,
    rendererCapabilities,
    webglFallback,
    webglProbeResult,
    handleSwitchToXterm,
    handleRetryProbe,
    effectiveRendererModeRef,
    operationalRendererModeRef,
    webglFallbackRef,
    setWebglFallback,
  } = useTerminalRendererState({
    requestedRendererMode,
    visibleTerminalPanelCount,
    resolvedRuntimePlatform,
    nativeVteProbeResult,
    nativeVteOpenFailure,
    nativeVteOpened,
    onResetRendererToXterm,
    setXtermBootNonce,
  });

  const hasSentInitialCommand = useRef(false);
  const sessionReattachedRef = useRef(false);
  // True once the server's `ready` message arrives. Initial commands must never be
  // sent before this (the server may report `reattached: true`, meaning the tmux pane
  // already has a live TUI — typing the launch command into it injects it into the
  // conversation as visible text). See Bug B: resume-command injection on reload.
  const serverReadyReceivedRef = useRef(false);
  const initialCommandConnectSnapshotRef = useRef(null);
  const viewportFitConfirmedRef = useRef(false);
  // Fresh panels created from the workspace modal must wait until the host layout has
  // projected the surface before injecting the launch command; sending too early can
  // leave the terminal blank because xterm has not rendered the viewport yet.
  const projectionReadyRef = useRef(false);
  const panelCreatedAtRef = useRef(Date.now());
  const opencodeReadyNotifiedRef = useRef(false);
  const kimiReadyNotifiedRef = useRef(false);
  const tuiOutputTailRef = useRef('');
  const lastViewportReadyPostedRef = useRef({ cols: 0, rows: 0 });
  const viewportReadyNotifyTimerRef = useRef(null);
  const initialCommandDelayTimerRef = useRef(null);
  const initialCommandDelayScheduledRef = useRef(false);
  const initialCommandProjectionRetryTimerRef = useRef(null);
  const lastPtySizeRef = useRef({ cols: 0, rows: 0 });
  const serverTermsizeRef = useRef({ cols: 0, rows: 0 });
  const hasConnectedOnceRef = useRef(false);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const isEngineV2Ref = useRef(isEngineV2);
  const connectRef = useRef(null);
  const sendResizeRef = useRef(null);
  const isActivePanelRef = useRef(isActivePanel);
  const isVisibleInLayoutRef = useRef(isVisibleInLayout);
  const isWorkspaceShellVisibleRef = useRef(isWorkspaceShellVisible);
  const prevWorkspaceShellVisibleRef = useRef(isWorkspaceShellVisible);
  const prevVisibleInLayoutRef = useRef(isVisibleInLayout);
  const needsViewportSyncOnShowRef = useRef(false);
  // Set by layout-settled/survivor-recover events that arrive while the panel
  // is hidden (e.g. split/close in another workspace). When the panel is shown
  // again we must run the heavy recovery path instead of the soft/skip paths,
  // because the GPU framebuffer may have been discarded while the shell was
  // opacity-hidden even though the addon stayed attached.
  const layoutChurnedWhileHiddenRef = useRef(false);
  // Snapshot of the global layout-settled generation taken when this panel
  // becomes hidden. On reveal we compare it against the current generation to
  // detect churn that happened in *other* workspaces whose panelIds filter
  // prevented the layout-settled event from reaching this panel.
  const layoutHiddenGenerationRef = useRef(0);
  const survivorGpuRecycleAtRef = useRef(0);
  const containerWasZeroSizedOnShowRef = useRef(false);
  const syncTerminalViewportOnWorkspaceShowRef = useRef(null);
  const workspaceShowSyncTimerRef = useRef(null);
  const workspaceShowRecoverTimerRef = useRef(null);
  const workspaceShowZeroSizeObserverRef = useRef(null);
  const inactiveRepaintRafRef = useRef(null);
  const pendingWebglRecoveryRef = useRef(false);
  const webglReleasedOnLayoutHideRef = useRef(false);
  const canvasReleasedOnLayoutHideRef = useRef(false);
  const webglRecoveryTimerRef = useRef(null);
  const handleWebglContextLossRef = useRef(null);
  const scheduleWorkspaceShowRecoveryRef = useRef(null);
  // handleWebglContextLoss is declared before scheduleBoundedFitRepaint/
  // scheduleBoundedGpuRecover further down this component — calling those
  // consts directly in handleWebglContextLoss's body is fine (deferred), but
  // putting them in its useCallback deps array reads them in the same TDZ
  // block before their own declaration runs, throwing "Cannot access ... before
  // initialization" on EVERY render. Route the calls through refs instead.
  const scheduleBoundedFitRepaintRef = useRef(null);
  const scheduleBoundedGpuRecoverRef = useRef(null);
  // Viewport force-repaint coalescing: the first second after a workspace/window
  // switch can fire 4+ forced repaints (layout-show, scheduleWorkspaceShowRecovery,
  // bounded force/fit/GPU retries, survivor-recover events). Each clear()+resize
  // nudge produces a visible blink. Coalescing repeats inside a short window keeps
  // the recovery robust but removes redundant frames.
  const viewportForceRepaintAtRef = useRef(0);
  const rendererWasReadyAtLastRepaintRef = useRef(false);
  const windowSwitchTuiRecoverAtRef = useRef(0);
  const softRevealNudgeAtRef = useRef(0);
  const prevIsActivePanelRef = useRef(false);
  const reactivateTerminalViewportRef = useRef(null);
  const reactivateCoalesceTimerRef = useRef(null);
  const tryReattachWebglAddonRef = useRef(null);
  const tryReattachCanvasAddonRef = useRef(null);
  const outputPendingRef = useRef({ value: '' });
  const hiddenOutputBufferRef = useRef({ value: '' });
  const hiddenOutputCatchupPendingRef = useRef(false);
  const terminalOutputQueueRef = useRef([]);
  const terminalOutputFlushRafRef = useRef(null);
  const syncOutputActiveRef = useRef(false);
  const syncOutputBufferRef = useRef('');
  const syncOutputTimeoutRef = useRef(null);
  const outputRefs = useRef({
    outputPendingRef,
    hiddenOutputBufferRef,
    hiddenOutputCatchupPendingRef,
    terminalOutputQueueRef,
    terminalOutputFlushRafRef,
    syncOutputActiveRef,
    syncOutputBufferRef,
    syncOutputTimeoutRef,
  });
  const lifecycleRefs = useRef({
    isDisposingRef,
    isActivePanelRef,
    isVisibleInLayoutRef,
    tuiSessionActiveRef,
    isGrokSessionRef,
    kimiReadyNotifiedRef,
    grokTuiReadyRef,
    tuiSessionFooterConfirmedRef,
    lastPointerZoneRef,
  });
  const rendererRefsBag = useRef({
    termRef,
    webglAddonRef,
    canvasAddonRef,
  });
  const sessionRefs = useRef({
    wsRef,
    transportRef,
  });
  const viewportRefs = useRef({
    terminalRootRef,
    containerRef,
    viewportShellRef,
  });
  const onFlushWriteRef = useRef(null);
  const surfaceHostRef = useRef(surfaceHost);
  const connectPendingUntilFitRef = useRef(false);
  const connectDeferTimerRef = useRef(null);
  const processExitedRef = useRef(false);
  const rafRef = useRef(null);
  const timeoutRef = useRef(null);
  const initTimeoutRef = useRef(null);
  const autoScrollRafRef = useRef(null);
  const tuiResizeDebounceTimerRef = useRef(null);
  const visibleTerminalPanelCountRef = useRef(visibleTerminalPanelCount);
  const prevVisibleTerminalPanelCountRef = useRef(visibleTerminalPanelCount);

  // Phase 3 terminal-engine-v2: snapshot + rehydration refs.
  const serializeAddonRef = useRef(null);
  const dataProcessedSinceSnapshotRef = useRef(0);
  const snapshotIntervalRef = useRef(null);
  const rehydrationRef = useRef({ loaded: false, heldData: [] });
  const currentPtyOffsetRef = useRef(0);

  const {
    enqueueOutput,
    flushOutput,
    clearOutputQueue,
    clearSyncOutputTimeout,
    writeTerminalOutput,
  } = useTerminalOutputQueue({
    outputRefs,
    lifecycleRefs,
    rendererRefs: rendererRefsBag,
    panelId: id,
    onFlushWriteRef,
    isActivePanelRef,
    isVisibleInLayoutRef,
    operationalRendererModeRef,
  });

  const runtimePhase = resolveTerminalRuntimePhase({
    isActivePanel,
    isVisibleInLayout,
    suspendNativeSurface,
    nativeSurfacePolicy,
    nativeVteOpenFailure,
    nativeVteOpened,
    nativeVteProbe: nativeVteProbeResult,
    requestedRendererMode,
    runtimePlatform: resolvedRuntimePlatform,
    tauriAvailable,
  });
  const shouldUseNativeRenderer =
    rendererViewModel.effectiveMode === 'vte-experimental' && runtimePhase !== 'fallback-xterm';
  const shouldBootXterm =
    shouldBootXtermRuntime({
      isActivePanel,
      isVisibleInLayout,
      suspendNativeSurface,
      nativeSurfacePolicy,
      nativeVteOpenFailure,
      nativeVteOpened,
      nativeVteProbe: nativeVteProbeResult,
      requestedRendererMode,
      runtimePlatform: resolvedRuntimePlatform,
      tauriAvailable,
    }) && connectionState !== 'suspended';

  const slice1CtxRef = useRef(null);
  const slice2CtxRef = useRef(null);
  const slice3CtxRef = useRef(null);

  const {
    sessionExitReason,
    setSessionExitReason,
    applyTerminalSessionExit,
    handleSessionRecoveryClick,
  } = useTerminalSessionExit({
    ctxRef: slice3CtxRef,
    shouldUseNativeRenderer,
  });

  const {
    resolveSwarmTmuxSessionName,
    notifyAgentReady,
    notifyOpencodeReady,
    notifyViewportReady,
    skipRedundantInitialCommandSend,
    restoreInitialCommandDispatchGuard,
    resolveInjectCommand,
    sendInitialCommandIfReady,
    scheduleInitialCommandAfterViewport,
  } = useTerminalInitialCommandLifecycle({
    ctxRef: slice3CtxRef,
    id,
    initialCommand,
    swarmContext,
  });

  const { adjustFontSize } = useTerminalFontSize({ ctxRef: slice1CtxRef });
  const { handleViewportMouseDown } = useTerminalViewportPointer({ ctxRef: slice1CtxRef });
  useTerminalSearchAndZedInput({ ctxRef: slice1CtxRef });
  const {
    isConnected,
    showTerminalViewport,
    showTerminalLoadingOverlay,
    showTerminalStatusOverlay,
    exitOverlayCopy,
    statusLabel,
  } = useTerminalStatusState({
    isInitializing,
    initError,
    connectionState,
    hasConnectedOnce,
    sessionExitReason,
    initialCommand,
    webglFallback,
    requestedRendererMode,
    shouldUseNativeRenderer,
  });

  const clearTimers = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (nativeVteProbeRetryTimerRef.current) {
      clearTimeout(nativeVteProbeRetryTimerRef.current);
      nativeVteProbeRetryTimerRef.current = null;
      nativeVteProbeRetryDelayRef.current = null;
    }

    if (viewportReadyNotifyTimerRef.current) {
      clearTimeout(viewportReadyNotifyTimerRef.current);
      viewportReadyNotifyTimerRef.current = null;
    }

    if (initialCommandDelayTimerRef.current) {
      clearTimeout(initialCommandDelayTimerRef.current);
      initialCommandDelayTimerRef.current = null;
    }

    if (initialCommandProjectionRetryTimerRef.current) {
      clearTimeout(initialCommandProjectionRetryTimerRef.current);
      initialCommandProjectionRetryTimerRef.current = null;
    }

    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    if (tuiResizeDebounceTimerRef.current) {
      clearTimeout(tuiResizeDebounceTimerRef.current);
      tuiResizeDebounceTimerRef.current = null;
    }

    if (webglRecoveryTimerRef.current) {
      clearTimeout(webglRecoveryTimerRef.current);
      webglRecoveryTimerRef.current = null;
    }

    if (workspaceShowRecoverTimerRef.current) {
      clearTimeout(workspaceShowRecoverTimerRef.current);
      workspaceShowRecoverTimerRef.current = null;
    }

    if (inactiveRepaintRafRef.current) {
      cancelAnimationFrame(inactiveRepaintRafRef.current);
      inactiveRepaintRafRef.current = null;
    }

    if (snapshotIntervalRef.current) {
      clearInterval(snapshotIntervalRef.current);
      snapshotIntervalRef.current = null;
    }
  }, []);

  const clearConnectDeferTimer = useCallback(() => {
    if (connectDeferTimerRef.current) {
      clearTimeout(connectDeferTimerRef.current);
      connectDeferTimerRef.current = null;
    }
  }, []);

  const scheduleConnectDeferForce = useCallback(() => {
    if (hasConnectedOnceRef.current || connectDeferTimerRef.current) return;
    connectDeferTimerRef.current = setTimeout(() => {
      connectDeferTimerRef.current = null;
      if (
        hasConnectedOnceRef.current ||
        sessionClosingRef.current ||
        !termRef.current ||
        !containerRef.current
      ) {
        return;
      }
      connectPendingUntilFitRef.current = false;
      cliLog(`CLIENT:${id}`, 'connect defer timeout — forcing connect', {
        maxMs: TERMINAL_CONNECT_DEFER_MAX_MS,
      });
      connectRef.current?.();
    }, TERMINAL_CONNECT_DEFER_MAX_MS);
  }, [id]);

  const engineCtxRef = useRef(null);
  const disposeXtermRuntimeRef = useRef(() => {});
  const disposeXtermRuntime = useCallback((opts) => disposeXtermRuntimeRef.current?.(opts), []);

  useLayoutEffect(() => {
    isVisibleInLayoutRef.current = isVisibleInLayout;
    isWorkspaceShellVisibleRef.current = isWorkspaceShellVisible;
  }, [isVisibleInLayout, isWorkspaceShellVisible]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
    if (typeof onConnectionStateChange === 'function') {
      onConnectionStateChange(id, connectionState);
    }
  }, [connectionState, id, onConnectionStateChange]);

  useEffect(() => {
    requestedRendererModeRef.current = requestedRendererMode;
  }, [requestedRendererMode]);

  useEffect(() => {
    isEngineV2Ref.current = isEngineV2;
  }, [isEngineV2]);

  // Phase 3 terminal-engine-v2: push a final snapshot when the page unloads so
  // the sidecar has the latest state for the next restore.
  useEffect(() => {
    if (!isEngineV2 || typeof window === 'undefined') return;

    const handleBeforeUnload = () => {
      if (
        serializeAddonRef.current &&
        termRef.current &&
        wsRef.current?.readyState === WebSocket.OPEN
      ) {
        try {
          const serialized = serializeAddonRef.current.serialize();
          wsRef.current.send(
            JSON.stringify({
              type: 'save-snapshot',
              serialized,
              ptyOffset: currentPtyOffsetRef.current,
              termsize: { cols: termRef.current.cols, rows: termRef.current.rows },
            })
          );
        } catch {
          // ignore snapshot send errors during unload
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isEngineV2]);

  useLayoutEffect(() => {
    visibleTerminalPanelCountRef.current = visibleTerminalPanelCount;
  }, [visibleTerminalPanelCount]);

  const buildViewportSnapshot = useCallback(
    (reason) =>
      buildTerminalViewportDiagnosticPayload({
        reason,
        containerRect: containerRef.current?.getBoundingClientRect?.(),
        term: termRef.current,
        documentVisibilityState:
          typeof document !== 'undefined' ? document.visibilityState : 'unknown',
        connectionState: connectionStateRef.current,
        transport: transportRef.current,
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
        requestedRendererMode: requestedRendererModeRef.current,
        effectiveRendererMode: effectiveRendererModeRef.current,
        isActivePanel: isActivePanelRef.current,
        isVisibleInLayout: isVisibleInLayoutRef.current,
        webglAttached: Boolean(webglAddonRef.current),
        webglFallbackReason: webglFallback?.reason || null,
        pendingWebglRecovery: Boolean(pendingWebglRecoveryRef.current),
      }),
    [webglFallback?.reason]
  );

  const logViewportDiagnostic = useCallback(
    createTerminalViewportDiagnosticLogger({
      id,
      cliLog,
      lastSnapshotRef: lastViewportDiagnosticRef,
      getSnapshot: buildViewportSnapshot,
    }),
    [buildViewportSnapshot, id]
  );

  const logRenderHealth = useCallback(
    (event, extra = {}) => {
      cliLog(`RENDER:${id}`, event, {
        ...buildViewportSnapshot(event),
        ...extra,
      });
    },
    [buildViewportSnapshot, id]
  );

  const tearDownClientSession = useCallback(
    (reason = 'session-close') => {
      sessionClosingRef.current = true;
      cancelNativeVteLayoutHide(id);
      clearNativeVteLease(id);
      clearPanelInitialCommandLifecycle(id);
      clearTimers();
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
        stale.close();
        wsRef.current = null;
      }
      // Phase 4 terminal-engine-v2: explicit panel close stashes the surface in
      // the graveyard. Real disposal happens on LRU eviction (Phase 5) or user
      // hard-close, not on normal close.
      disposeXtermRuntime({ stashForV2: isEngineV2Ref.current });
      // Native GTK teardown is owned by handleClosePanel → closeNativeVtePanel (single close).
      setConnectionState('terminated');
    },
    [clearTimers, disposeXtermRuntime, id]
  );

  const nativeVteApi = useTerminalNativeVteLifecycle({
    ctxRef: slice3CtxRef,
    isActivePanel,
    isVisibleInLayout,
    requestedRendererMode,
    suspendNativeSurface,
    nativeSurfacePolicy,
    resolvedRuntimePlatform,
    autoFocus,
    nativeVteOpened,
    nativeVteOpenFailure,
    nativeVteProbeResult,
    nativeVteProbeAttempt,
    nativeVteRecoveryAttempt,
  });
  const {
    closeNativeLease,
    hideNativeLease,
    showAndResizeNativeLease,
    handleNativeLeaseCommandError,
    queueNativeVteProbeRetry,
    clearNativeVteProbeRetryTimer,
  } = nativeVteApi;

  const {
    copied,
    contextMenu,
    setContextMenu,
    handleCopySelection,
    handlePasteIntoTerminal,
    handleContextMenu,
    handleCopyFromMenu,
    handlePasteFromMenu,
    handleViewportPaste,
  } = useTerminalClipboard({
    rendererRefs: rendererRefsBag,
    sessionRefs,
    lifecycleRefs,
    viewportRefs,
    panelId: id,
    isActivePanel,
    shouldUseNativeRenderer,
    focusNativeVtePanel,
    pasteNativeVtePanel,
    handleNativeLeaseCommandError,
  });

  useTerminalWheelRouter({
    lifecycleRefs,
    rendererRefs: rendererRefsBag,
    sessionRefs,
    viewportRefs,
    initialCommand,
    shouldUseNativeRenderer,
  });

  const scrollTerminalToBottom = useCallback((force = false) => {
    if (!termRef.current) return;
    if (!force && !isTerminalViewportNearBottom(termRef.current)) return;

    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
    }

    autoScrollRafRef.current = requestAnimationFrame(() => {
      autoScrollRafRef.current = null;
      termRef.current?.scrollToBottom?.();
    });
  }, []);

  useTerminalScrollPreserve({
    ctxRef: slice1CtxRef,
    initialCommand,
    isVisibleInLayout,
    isActivePanel,
    scrollTerminalToBottom,
  });

  const viewportCtxRef = useRef(null);
  const {
    waitForVisibleDimensions,
    confirmViewportFit,
    maybeConnectAfterViewportFit,
    fitAndResize,
    sendResize,
    reactivateTerminalViewport,
  } = useTerminalViewportSync({ ctxRef: viewportCtxRef });

  const scrollIfActivePanel = useCallback(() => {
    if (isActivePanelRef.current) scrollTerminalToBottom();
  }, [scrollTerminalToBottom]);

  const rendererCtxRef = useRef(null);
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

  const releaseWebglAddonForInactivePanel = useCallback(
    (reason = 'panel-inactive-dom-fallback') => {
      if (isEngineV2Ref.current) return false;
      const addon = webglAddonRef.current;
      if (!addon) return false;

      if (webglRecoveryTimerRef.current) {
        clearTimeout(webglRecoveryTimerRef.current);
        webglRecoveryTimerRef.current = null;
      }

      cliLog(`RENDER:${id}`, 'webgl-released-inactive-panel', buildViewportSnapshot(reason));

      neutralizeWebglAddonForDisposal(addon);
      try {
        addon.dispose?.();
      } catch {
        // ignore double dispose
      }
      webglAddonRef.current = null;
      pendingWebglRecoveryRef.current = true;
      webglReleasedOnLayoutHideRef.current = true;

      stabilizeTerminalRenderer(termRef.current, { clearAtlas: false });
      return true;
    },
    [buildViewportSnapshot, id]
  );

  /**
   * Execute a forced viewport repaint only if enough time has passed since the
   * last one. This prevents the visual strobe that happens when layout-show,
   * survivor-recover events and bounded retries all queue repaints within the
   * same ~100 ms window. The coalesce window is short so legitimate delayed
   * recovery (e.g. async GPU reattach) still gets a fresh repaint.
   */
  const coalescedForceRepaint = useCallback(
    (term, { minMs = 200, reason = '' } = {}) => {
      if (!term) return false;
      const rendererReady = isTerminalRendererReady(term);
      const wasReady = rendererWasReadyAtLastRepaintRef.current;
      rendererWasReadyAtLastRepaintRef.current = rendererReady;
      if (!rendererReady) return false;
      const now = performance.now();
      const elapsed = now - viewportForceRepaintAtRef.current;
      // If the renderer just became ready after being unavailable (e.g. async GPU
      // reattach after a window switch), paint immediately instead of waiting for
      // the coalesce window. This prevents the black-screen window while keeping
      // redundant repaints from the same ready state coalesced.
      if (elapsed < minMs && wasReady) {
        logViewportDiagnostic('force-repaint-coalesced', { reason, elapsed });
        return false;
      }
      const ok = forceTerminalViewportRepaint(term);
      if (ok) viewportForceRepaintAtRef.current = performance.now();
      return ok;
    },
    [logViewportDiagnostic]
  );

  /**
   * Soft GPU reveal (flush catchup + refresh + 1-cell nudge) with nudge
   * coalescing. The deferred rAF soft-reveal in the layout-show effect was
   * queueing a second nudge a few frames after the first, creating an extra
   * micro-flicker. We still flush output and refresh, but we skip the resize
   * nudge if one already ran recently.
   */
  const coalescedSoftGpuVisibilityReveal = useCallback(
    (term, bufferRef, catchupPendingRef, { reason = '', minMs = 200 } = {}) => {
      flushHiddenTerminalCatchupToTerm(term, bufferRef, catchupPendingRef);
      if (!term || !isTerminalRendererReady(term)) return;
      refreshTerminalViewport(term);
      const now = performance.now();
      const elapsed = now - softRevealNudgeAtRef.current;
      if (elapsed < minMs) {
        logViewportDiagnostic('soft-reveal-nudge-coalesced', { reason, elapsed });
        return;
      }
      softRevealNudgeAtRef.current = now;
      nudgeTerminalViewportRepaint(term);
    },
    [logViewportDiagnostic]
  );

  const {
    scheduleBoundedForceRepaint,
    scheduleBoundedFitRepaint,
    scheduleBoundedGpuRecover,
    scheduleInactiveViewportRepaint,
    syncTerminalViewportOnWorkspaceShow,
    scheduleWorkspaceShowRecovery,
  } = useTerminalWorkspaceShowRecovery({
    ctxRef: viewportCtxRef,
    isVisibleInLayout,
    isWorkspaceShellVisible,
    operationalRendererMode,
    shouldUseNativeRenderer,
    nativeVteOpened,
  });

  useTerminalLayoutChurnRecovery({ ctxRef: viewportCtxRef, isEngineV2 });

  useTerminalRendererMigration({
    ctxRef: viewportCtxRef,
    isActivePanel,
    isVisibleInLayout,
    operationalRendererMode,
    shouldUseNativeRenderer,
    visibleTerminalPanelCount,
  });

  // When we leave vte-experimental, also make sure any partial xterm runtime is cleaned
  // and we (re)boot the web layer for the new requested mode. This complements the
  // existing initialize effect (which may not always re-fire on prop change alone).
  //
  // We cannot call the inner `initializeTerminal` (it is scoped inside the main xterm boot effect).
  // Instead we dispose here and increment a nonce that is part of the main boot effect's deps.
  // That forces the main effect body to re-execute and call its local initializeTerminal()
  // (which contains the full xterm + webgl dynamic import + banner logic).
  const lastRequestedModeRef = useRef(requestedRendererMode);
  const lastIdRef = useRef(id);
  useEffect(() => {
    if (lastRequestedModeRef.current === requestedRendererMode && lastIdRef.current === id) {
      return undefined;
    }
    lastRequestedModeRef.current = requestedRendererMode;
    const idChanged = lastIdRef.current !== id;
    lastIdRef.current = id;
    if (idChanged) {
      projectionReadyRef.current = false;
      panelCreatedAtRef.current = Date.now();
    }

    if (requestedRendererMode === 'vte-experimental') {
      disposeXtermRuntime();
      return undefined;
    }

    disposeXtermRuntime();
    setXtermBootNonce((n) => n + 1);

    return undefined;
  }, [requestedRendererMode, disposeXtermRuntime, id]);

  useEffect(() => {
    const handleSessionClosing = (event) => {
      if (event.detail?.panelId !== id) return;
      tearDownClientSession('session-close');
    };

    window.addEventListener('devhub:terminal-session-closing', handleSessionClosing);
    return () => {
      window.removeEventListener('devhub:terminal-session-closing', handleSessionClosing);
    };
  }, [id, tearDownClientSession]);

  useEffect(() => {
    surfaceHostRef.current = surfaceHost;
  }, [surfaceHost]);

  useLayoutEffect(() => {
    restoreInitialCommandDispatchGuard();
  }, [restoreInitialCommandDispatchGuard]);

  useEffect(() => {
    if (isEngineV2) return;
    const bridge = takeTerminalPanelBridge(id);
    if (!bridge) return;
    if (bridge.buffer) {
      const crossHostRemount = bridge.host && surfaceHost && bridge.host !== surfaceHost;
      if (
        crossHostRemount ||
        shouldDiscardHiddenOutputCatchup({ bufferedBytes: bridge.buffer.length })
      ) {
        hiddenOutputBufferRef.current.value = '';
        hiddenOutputCatchupPendingRef.current = false;
      } else {
        hiddenOutputBufferRef.current.value = bridge.buffer;
        hiddenOutputCatchupPendingRef.current = bridge.catchupPending || true;
      }
    }
    if (bridge.outputPending) {
      outputPendingRef.current.value = bridge.outputPending;
    }
    if (bridge.lastPtySize?.cols > 0 && bridge.lastPtySize?.rows > 0) {
      lastPtySizeRef.current = {
        cols: bridge.lastPtySize.cols,
        rows: bridge.lastPtySize.rows,
      };
    }
  }, [id, isEngineV2, surfaceHost]);

  viewportCtxRef.current = {
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
    scheduleBoundedGpuRecover,
    scheduleBoundedFitRepaint,
    scheduleBoundedForceRepaint,
    buildViewportSnapshot,
    confirmViewportFit,
    maybeConnectAfterViewportFit,
    fitTerminalViewport,
    stabilizeTerminalRenderer,
    nudgeTerminalPtyResize,
    fitAndResize,
    scheduleInactiveViewportRepaint,
    syncTerminalViewportOnWorkspaceShow,
    scheduleWorkspaceShowRecovery,
    sendResize,
    reactivateTerminalViewport,
    windowSwitchTuiRecoverAtRef,
    survivorGpuRecycleAtRef,
    projectionReadyRef,
    sendInitialCommandIfReady,
    releaseWebglAddonForInactivePanel,
    releaseCanvasAddon,
    prevVisibleInLayoutRef,
    prevWorkspaceShellVisibleRef,
    workspaceShowSyncTimerRef,
    prevVisibleTerminalPanelCountRef,
    showAndResizeNativeLease,
  };

  rendererCtxRef.current = {
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

  const connectCtxRef = useRef(null);
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

  const { connect } = useTerminalV2Session({ ctxRef: connectCtxRef });

  connectRef.current = connect;
  sendResizeRef.current = sendResize;

  // When the user switches away from this panel (isActivePanel becomes false),
  // disable "reporting" modes (focus events, mouse tracking) that many TUIs (like opencode)
  // use to "wake up" and re-query the terminal (sending DA1/DA2 queries like ^[[c ^[[>c).
  // If those queries happen in a background panel while the user is clicking other panels,
  // their responses can leak as visible text (the "1;2c0;276;0c..." garbage) and accumulate
  // in the prompt of the panels.
  // useLayoutEffect runs before paint so blur/focus churn cannot beat us to the PTY.
  useLayoutEffect(() => {
    isActivePanelRef.current = isActivePanel;

    const term = termRef.current;
    if (!term) return;

    if (!isActivePanel) {
      // Cancel active-panel resize debounces so a stale RAF cannot clear GPU atlases
      // after the user switched away. Still refit if the container geometry changed.
      clearTimers();
      disableTerminalFocusReporting(term, { disableMouse: true });
      try {
        if (term.element?.contains(document.activeElement)) {
          term.blur?.();
        }
      } catch {
        // intentional: terminal may already be disposed during unmount
      }
      return;
    }

    prepareActiveTuiTerminalFocus(term, {
      tuiSessionActive: tuiSessionActiveRef.current,
    });
  }, [clearTimers, isActivePanel, scheduleInactiveViewportRepaint]);

  useLayoutEffect(() => {
    if (
      connectionState !== 'error' &&
      connectionState !== 'disconnected' &&
      connectionState !== 'terminated' &&
      connectionState !== 'agent-exited'
    ) {
      return;
    }
    tuiSessionActiveRef.current = false;
    isGrokSessionRef.current = false;
    grokTuiReadyRef.current = false;
    tuiSessionFooterConfirmedRef.current = false;
    setNativeWheelPassthrough(false);
    disableTerminalFocusReporting(termRef.current, { disableMouse: true });
  }, [connectionState]);

  useLayoutEffect(() => {
    if (!isVisibleInLayout || !termRef.current) return;
    if (!hasConnectedOnceRef.current) {
      const fitWorked = fitTerminalViewport({
        container: containerRef.current,
        fitAddon: fitRef.current,
        term: termRef.current,
        socket: wsRef.current,
        clearAtlas: false,
        lastPtySizeRef: lastPtySizeRef.current,
      });
      maybeConnectAfterViewportFit(fitWorked);
      if (!hasConnectedOnceRef.current) return;
    }
    clearConnectDeferTimer();
    connectPendingUntilFitRef.current = false;

    // Layout-show useLayoutEffect owns false→true recovery (route / workspace /
    // window switches). Skip a second sync pass that duplicated fit+PTY churn.
    if (shouldSyncTerminalViewportOnLayoutShow(prevVisibleInLayoutRef.current, isVisibleInLayout)) {
      return;
    }

    const raf = requestAnimationFrame(() => {
      if (!isVisibleInLayoutRef.current || !termRef.current) return;
      syncTerminalViewportOnWorkspaceShow('projection-host-ready', {
        clearAtlas: webglReleasedOnLayoutHideRef.current || canvasReleasedOnLayoutHideRef.current,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [
    clearConnectDeferTimer,
    isVisibleInLayout,
    maybeConnectAfterViewportFit,
    syncTerminalViewportOnWorkspaceShow,
  ]);

  const reconnect = useCallback(() => {
    processExitedRef.current = false;
    setSessionExitReason(null);
    clearPanelSessionExit(id);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      cliLog(`CLIENT:${id}`, 'reconnect() skipped — socket already open');
      setConnectionState('connected');
      sendResize();
      if (autoFocus) {
        prepareActiveTuiTerminalFocus(termRef.current, {
          tuiSessionActive: tuiSessionActiveRef.current,
        });
        termRef.current?.focus?.();
      }
      return;
    }
    cliLog(`CLIENT:${id}`, 'reconnect() called');
    logTerminalSession('terminal-reconnect', {
      panelId: id,
      connectionState: connectionStateRef.current,
      initialCommand,
    });
    termRef.current?.clear();
    connect();
  }, [autoFocus, connect, initialCommand, sendResize]);

  useTerminalPanelActivationRecovery({
    ctxRef: slice2CtxRef,
    autoFocus,
    isActivePanel,
    operationalRendererMode,
    shouldUseNativeRenderer,
    syncTerminalViewportOnWorkspaceShow,
    logRenderHealth,
  });
  useTerminalAutoReconnect({
    ctxRef: slice2CtxRef,
    autoFocus,
    connectionState,
    initError,
    id,
    reconnect,
  });
  useTerminalWindowEventRouter({
    ctxRef: slice2CtxRef,
    isActivePanel,
    isVisibleInLayout,
    id,
    autoFocus,
  });

  const { disposeXtermRuntime: disposeXtermRuntimeImpl } = useTerminalEngine({
    ctxRef: engineCtxRef,
    requestedRendererMode,
    runtimePhase,
    shouldBootXterm,
    xtermBootNonce,
    coldMountOrdinal,
    id,
    initialCommand,
  });
  disposeXtermRuntimeRef.current = disposeXtermRuntimeImpl;

  engineCtxRef.current = {
    id,
    cwd,
    autoFocus,
    coldMountOrdinal,
    fontSize,
    restored,
    initialCommand,
    isDisposingRef,
    connectEpochRef,
    panelActivityTrackerRef,
    connectAbortRef,
    requestedRendererModeRef,
    isVisibleInLayoutRef,
    termRef,
    resizeObserverRef,
    clearTimers,
    clearConnectDeferTimer,
    clearOutputQueue,
    wsRef,
    isEngineV2Ref,
    serializeAddonRef,
    currentPtyOffsetRef,
    terminalBlurCleanupRef,
    webglAddonRef,
    canvasAddonRef,
    fitRef,
    searchRef,
    containerRef,
    outputPendingRef,
    hiddenOutputBufferRef,
    hiddenOutputCatchupPendingRef,
    connectPendingUntilFitRef,
    connectDeferTimerRef,
    surfaceHostRef,
    lastPtySizeRef,
    stashTerminalPanelBridge,
    setInitError,
    setIsInitializing,
    setConnectionState,
    setWebglFallback,
    rendererViewModel,
    operationalRendererModeRef,
    visibleTerminalPanelCountRef,
    isActivePanelRef,
    tuiSessionActiveRef,
    isGrokSessionRef,
    grokTuiReadyRef,
    tuiSessionFooterConfirmedRef,
    isInitializingRef,
    handleWebglContextLossRef,
    pendingWebglRecoveryRef,
    tuiResizeDebounceTimerRef,
    needsViewportSyncOnShowRef,
    nativeResizeObserverRef,
    nativeResizeRafRef,
    connectRef,
    sendResizeRef,
    tryReattachWebglAddonRef,
    tryReattachCanvasAddonRef,
    writeTerminalOutput,
    transportRef,
    waitForVisibleDimensions,
    maybeConnectAfterViewportFit,
    coalescedSoftGpuVisibilityReveal,
    scheduleInactiveViewportRepaint,
    logViewportDiagnostic,
    shouldBootXterm,
    runtimePhase,
    requestedRendererMode,
    xtermBootNonce,
    reconnect,
    hasSentInitialCommand,
    disposeXtermRuntime: disposeXtermRuntimeImpl,
  };

  useTerminalTypographySync({ ctxRef: engineCtxRef, setFontSize, setXtermBootNonce });

  useEffect(() => {
    reactivateTerminalViewportRef.current = reactivateTerminalViewport;
  }, [reactivateTerminalViewport]);

  useEffect(() => {
    tryReattachWebglAddonRef.current = tryReattachWebglAddon;
  }, [tryReattachWebglAddon]);

  useEffect(() => {
    tryReattachCanvasAddonRef.current = tryReattachCanvasAddon;
  }, [tryReattachCanvasAddon]);

  slice1CtxRef.current = {
    FONT_SIZE_KEY,
    setFontSize,
    termRef,
    fitRef,
    isDisposingRef,
    id,
    initialCommand,
    shouldUseNativeRenderer,
    nativeVteOpened,
    onActivatePanel,
    viewportShellRef,
    isGrokSessionRef,
    grokTuiReadyRef,
    kimiReadyNotifiedRef,
    tuiSessionActiveRef,
    tuiSessionFooterConfirmedRef,
    lastPointerZoneRef,
    wsRef,
    transportRef,
    isVisibleInLayoutRef,
    focusNativeVtePanel,
    handleNativeLeaseCommandError,
    searchRef,
    lastViewportYRef,
  };

  slice2CtxRef.current = {
    prevIsActivePanelRef,
    termRef,
    webglAddonRef,
    canvasAddonRef,
    containerRef,
    fitRef,
    tuiSessionActiveRef,
    hiddenOutputCatchupPendingRef,
    tryReattachWebglAddonRef,
    tryReattachCanvasAddonRef,
    reactivateTerminalViewportRef,
    sessionClosingRef,
    requestedRendererModeRef,
    isVisibleInLayoutRef,
    nativeLeaseRef,
    showAndResizeNativeLease,
    queueNativeVteProbeRetry,
    operationalRendererModeRef,
    disposeWebglAddonForContextLoss,
    syncTerminalViewportOnWorkspaceShowRef,
    isDisposingRef,
    needsViewportSyncOnShowRef,
    scheduleInactiveViewportRepaint,
    sendResize,
    fitAndResize,
    reactivateCoalesceTimerRef,
    logViewportDiagnostic,
  };

  slice3CtxRef.current = {
    id,
    cwd,
    initialCommand,
    connectionState,
    reconnect,
    setConnectionState,
    setNativeWheelPassthrough,
    processExitedRef,
    tuiSessionActiveRef,
    isGrokSessionRef,
    grokTuiReadyRef,
    tuiSessionFooterConfirmedRef,
    termRef,
    requestedRendererModeRef,
    prevRequestedRendererModeRef,
    nativeLeaseRef,
    containerRef,
    nativePlaceholderRef,
    setNativeVteOpened,
    setNativeVteProbeResult,
    setNativeVteProbeAttempt,
    setNativeVteOpenFailure,
    setNativeVteRecoveryAttempt,
    setSessionExitReason,
    setIsInitializing,
    restoredHiddenLeaseThisMountRef,
    isEngineV2Ref,
    wsRef,
    hideTimerRef,
    sessionClosingRef,
    hideNativeLease,
    isVisibleInLayoutRef,
    isDisposingRef,
    onActivatePanel,
    nativeVteProbeRetryCountRef,
    nativeVteProbeRetryTimerRef,
    nativeVteProbeRetryDelayRef,
    shouldRetryNativeVteProbeRef,
    clearNativeVteProbeRetryTimer,
    nativeResizeObserverRef,
    nativeResizeRafRef,
    nativeResizeSettleTimersRef,
    opencodeReadyNotifiedRef,
    kimiReadyNotifiedRef,
    lastViewportReadyPostedRef,
    viewportReadyNotifyTimerRef,
    sessionReattachedRef,
    hasConnectedOnceRef,
    serverReadyReceivedRef,
    viewportFitConfirmedRef,
    panelCreatedAtRef,
    projectionReadyRef,
    initialCommandProjectionRetryTimerRef,
    transportRef,
    initialCommandConnectSnapshotRef,
    hasSentInitialCommand,
    initialCommandDelayScheduledRef,
    initialCommandDelayTimerRef,
  };

  return (
    <div
      ref={terminalRootRef}
      className="flex flex-col h-full w-full overflow-hidden bg-[var(--surface-app)] relative"
      style={getTerminalAppShellStyle()}
    >
      {!hideTitleBar && (
        <div
          className="devhub-drag-handle h-9 flex items-center justify-between px-3 shrink-0 border-b select-none transition-colors group/handle cursor-pointer"
          style={getTerminalTitleBarStyle()}
        >
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-gray-300 pointer-events-none">
            <svg
              className="w-4 h-4 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 17 10 11 4 5" />
              <line x1={12} y1={19} x2={20} y2={19} />
            </svg>
            <span className="text-gray-400">Terminal Integrada</span>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-60">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-[#3fb950]" strokeWidth={2} />
            ) : (
              <WifiOff className="w-3 h-3 text-[#ff7b72]" strokeWidth={2} />
            )}
            <span
              className={`text-xs font-sans tracking-wide uppercase font-semibold ${isConnected ? 'text-[#3fb950]' : 'text-[#ff7b72]'}`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustFontSize(-1)}
              title="Reducir tamaño de fuente"
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            >
              <span className="text-[9px] font-bold text-gray-400 hover:text-white leading-none select-none">
                A-
              </span>
            </button>
            <button
              onClick={() => adjustFontSize(1)}
              title="Aumentar tamaño de fuente"
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            >
              <span className="text-[11px] font-bold text-gray-400 hover:text-white leading-none select-none">
                A+
              </span>
            </button>
            <button
              onClick={reconnect}
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-gray-400 group-hover:text-white" strokeWidth={2} />
            </button>
            {connectionState === 'suspended' && (
              <button
                data-testid="terminal-settings-gear-btn"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('devhub:terminal-settings-modal-requested', {
                      detail: { panelId: id },
                    })
                  )
                }
                className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group cursor-pointer"
                title="Configuración"
              >
                <svg
                  className="w-3.5 h-3.5 text-yellow-500 group-hover:text-yellow-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group cursor-pointer"
              >
                <X
                  className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#ff7b72]"
                  strokeWidth={2}
                />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Terminal View */}
      <div
        className="flex min-h-0 flex-1 flex-col bg-[var(--surface-app)]"
        data-testid="terminal-root-body"
      >
        <div
          ref={viewportShellRef}
          className="relative flex-1 bg-[var(--surface-app)]"
          onContextMenu={handleContextMenu}
          onMouseDown={handleViewportMouseDown}
          onPaste={handleViewportPaste}
          data-testid="terminal-viewport-shell"
          style={{
            ...TERMINAL_VIEWPORT_SHELL_STYLE,
            ...getTerminalViewportFrameStyle(),
            ...(hideTitleBar ? { borderWidth: 0 } : {}),
          }}
        >
          <div
            ref={nativePlaceholderRef}
            className="relative h-full w-full overflow-hidden"
            data-testid="terminal-content-body"
            style={TERMINAL_NATIVE_CONTENT_BODY_STYLE}
          >
            {shouldUseNativeRenderer && (
              <div
                className="absolute inset-0 z-10 rounded-md bg-[var(--surface-app)]"
                data-testid="terminal-native-placeholder"
                style={getTerminalViewportFrameStyle()}
              >
                <div className="h-full w-full" aria-hidden="true" />
              </div>
            )}

            {shouldBlockTerminalViewportForWebglFallback(webglFallback) &&
            requestedRendererMode === 'xterm-webgl' ? (
              <WebglErrorSection
                id={id}
                reason={webglFallback.reason}
                onSwitchToXterm={handleSwitchToXterm}
                onRetry={handleRetryProbe}
              />
            ) : (
              <motion.div
                ref={containerRef}
                className="devhub-xterm-container h-full w-full p-0"
                data-operational-renderer={operationalRendererMode}
                /* Reduced padding (was p-2.5) so TUI-drawn boxes, the bottom "Build" bar,
                   side warnings, ASCII banners and overall layout have widths, heights and
                   internal spacing much closer to a native Kali terminal.
                   Extra padding was making "las cajas de texto" and art look off. */
                {...getXtermContainerAnimProps(showTerminalViewport)}
              />
            )}
          </div>
          {/* Restored session toast */}
          {restoredToast && (
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-md border text-xs font-mono pointer-events-none"
              style={{
                background:
                  'color-mix(in oklch, var(--accent-primary) 15%, var(--surface-elevated))',
                borderColor: 'var(--accent-primary)',
                color: 'var(--accent-primary)',
              }}
            >
              ↺ Restored shell at {cwd}
            </div>
          )}

          {/* Loading overlay — first boot only; panel switches keep the live terminal interactive */}
          {showTerminalLoadingOverlay && (
            <div className="pointer-events-none absolute inset-0 bg-[var(--surface-app)]/80 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-10 backdrop-blur-sm">
              <Loader2 className="w-6 h-6 animate-spin text-[#388bfd]" />
              {connectionState === 'connecting' ? 'Conectando...' : 'Iniciando terminal...'}
            </div>
          )}

          {/* Error/Disconnected overlay */}
          {showTerminalStatusOverlay && connectionState !== 'suspended' && (
            <div
              className="absolute inset-0 bg-[var(--surface-app)]/90 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-[60] backdrop-blur-sm pointer-events-auto"
              data-testid={
                connectionState === 'agent-exited'
                  ? 'terminal-agent-exited-overlay'
                  : 'terminal-status-overlay'
              }
            >
              <WifiOff className="w-8 h-8 text-red-400" />
              <span className="text-red-400 font-semibold text-center px-4">
                {exitOverlayCopy.title}
              </span>
              <span className="text-gray-500 text-center max-w-sm px-4">
                {exitOverlayCopy.body}
              </span>
              <button
                onClick={handleSessionRecoveryClick}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e1e1e] border border-white/10 hover:bg-white/10 transition-colors text-gray-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {exitOverlayCopy.actionLabel}
              </button>
            </div>
          )}

          {/* Suspended state overlay */}
          {showTerminalStatusOverlay && connectionState === 'suspended' && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-[60] backdrop-blur-sm pointer-events-auto"
              style={{ background: 'var(--surface-app)' }}
              data-testid="terminal-suspended-overlay"
            >
              <svg
                className="w-8 h-8 text-yellow-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-yellow-500 font-semibold">Sesión suspendida</span>
              <span className="text-gray-500 text-center max-w-xs">
                {extractOpenCodeSessionId(initialCommand)
                  ? `OpenCode en pausa${cwd ? ` — ${cwd}` : ''}`
                  : cwd
                    ? `Shell en pausa — ${cwd}`
                    : 'Panel en pausa — pulsá Continuar para reconectar'}
              </span>
              <button
                data-testid="terminal-suspended-continue-btn"
                onClick={() => {
                  const sessionId = extractOpenCodeSessionId(initialCommand) || id;
                  window.dispatchEvent(
                    new CustomEvent('devhub:manual-revive-requested', {
                      detail: { panelId: id, sessionId },
                    })
                  );
                }}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e1e1e] border border-white/10 hover:bg-white/10 transition-colors text-gray-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Continuar
              </button>
            </div>
          )}

          {/* Copy button — top-right corner */}
          {isConnected && showQuickCopyButton && (
            <button
              onClick={async () => {
                await handleCopySelection();
              }}
              className="absolute top-2 right-2 z-20 p-1.5 rounded-md border transition-colors"
              style={getTerminalFloatingControlStyle({ active: true })}
              title="Copiar selección"
            >
              <Copy className={`w-3.5 h-3.5 ${copied ? 'text-[#3fb950]' : 'text-gray-400'}`} />
            </button>
          )}

          {/* Custom context menu */}
          {contextMenu && (
            <div
              className="fixed z-50 min-w-[160px] rounded-lg border shadow-xl animate-in fade-in zoom-in-95 duration-100"
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
                ...getTerminalFloatingControlStyle({ active: true }),
              }}
            >
              <button
                data-testid="terminal-context-menu-paste"
                onClick={handlePasteFromMenu}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-t-lg"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-gray-400" />
                Pegar
                <span className="ml-auto text-[10px] text-gray-500 font-mono">
                  Ctrl+V / Ctrl+Shift+V
                </span>
              </button>
              <div className="h-px bg-[#3a3a3a] mx-2 my-1" />
              <button
                data-testid="terminal-context-menu-copy"
                onClick={handleCopyFromMenu}
                disabled={!contextMenu.canCopy}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-[#2a2a2a] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="w-3.5 h-3.5 text-gray-400" />
                Copiar selección
                <span className="ml-auto text-[10px] text-gray-500 font-mono">Ctrl+Shift+C</span>
              </button>
              <div className="h-px bg-[#3a3a3a] mx-2 my-1" />
              <button
                onClick={() => setContextMenu(null)}
                className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a] transition-colors rounded-b-lg"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
