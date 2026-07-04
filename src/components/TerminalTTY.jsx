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
import useTerminalEngine from './terminal/hooks/useTerminalEngine';
import {
  readClipboardImage,
  readClipboardText,
  saveClipboardImageToTempFile,
  terminalClipboardEventBelongsToPanel,
} from '@/lib/terminal/terminalClipboard';
import {
  getTerminalRendererFallbackCopy,
  getTerminalRendererOptionLabel,
  getTerminalRendererRuntimeCapabilities,
  getTerminalRendererWebglFallbackCopy,
  probeWebglSupport,
  resolveOperationalRendererMode,
  resolveRendererSelection,
  TERMINAL_OPERATIONAL_CANVAS_MODE,
  TERMINAL_SPLIT_WEBGL_PANEL_LIMIT,
  TERMINAL_WEBGL_FALLBACK_REASONS,
} from '@/components/terminal/terminalRendererCapabilities';
import { getTerminalFontOptions } from '@/components/terminal/TerminalThemeSync';
import {
  extractOpenCodeSessionId,
  isSwarmLaunchWrapperCommand,
  readAgentRunForPanel,
  resolveTerminalInjectCommand,
} from '@/lib/terminal/restorePolicyResolver';
import {
  containsTerminalResponseNoise,
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
} from '@/lib/terminal/terminalNoiseFilter';
import { getTuiAdapter } from '@/lib/terminal/tuiAdapter';
import { buildSwarmTmuxSessionName } from '@/lib/terminal/viewportReadyMarker';
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
import {
  isSwarmLaunchWrapperDispatched,
  markSwarmLaunchWrapperDispatched,
} from '@/lib/terminal/swarmLaunchWrapperLifecycle';
import {
  clearPanelInitialCommandLifecycle,
  getPanelInitialCommandDispatch,
  markPanelInitialCommandDispatched,
  shouldSkipRedundantInitialCommandSend,
} from '@/lib/terminal/panelInitialCommandLifecycle';
import { logTerminalSession } from '@/lib/debug/terminalSessionDebug';
import { getTerminalLayoutSettledGeneration } from '@/components/terminal/nativeLayoutSync';
import { usesLegacyTerminalSurvivorRecovery } from '@/lib/terminal/legacyTerminalSurvivorRecovery';
import {
  cancelNativeVteLayoutHide,
  clearNativeVteLease,
  consumeHiddenNativeVteLease,
  deferNativeVteLayoutHide,
  hasHiddenNativeVteLease,
  markNativeVteLeaseHidden,
} from '@/lib/terminal/nativeVteLayoutLifecycle';
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
import {
  buildTerminalExitOverlayCopy,
  clearPanelSessionExit,
  isAgentTuiCommand,
  parseTerminalExitReason,
  persistPanelSessionExit,
  readPanelSessionExit,
} from '@/lib/terminal/agentSessionExit';

import {
  cliLog,
  attachTerminalRendererAddons,
  neutralizeWebglAddonForDisposal,
  isStaleXtermRendererError,
  getXtermContainerAnimProps,
  shouldShowTerminalViewport,
  resolveColdMountStaggerMs,
  shouldShowTerminalLoadingOverlay,
  shouldShowTerminalStatusOverlay,
  disableTerminalFocusReporting,
  prepareActiveTuiTerminalFocus,
  resetTerminalModesForReattach,
  normalizeTuiInitialCommand,
  isLikelyTuiInitialCommand,
  isGrokTuiInitialCommand,
  shouldBlockLateInitialCommandSend,
  detectGrokTuiReady,
  detectGrokSessionFromOutput,
  shouldPassthroughNativeTuiWheel,
  resolveTerminalWheelScrollPrefer,
  shouldInjectGrokWheelSgr,
  shouldScrollKimiWheelLocally,
  resolveGrokWheelSgrCoords,
  buildGrokWheelScrollPayload,
  resolveTerminalWheelInputZoneRows,
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
  shouldAutoReconnectTerminal,
  resolveTerminalClipboardShortcut,
  getClipboardApi,
  sendTerminalPasteInput,
  scheduleTerminalViewportSyncBurst,
  getTerminalRuntimePlatform,
  getTerminalViewportScrollOffset,
  isTerminalViewportNearBottom,
  shouldUseTerminalScrollbackWheel,
  shouldInjectTerminalWheelIntoPty,
  scrollTerminalViewport,
  resolveTerminalWheelScrollDirection,
  resolveTerminalWheelPageSteps,
  buildTerminalWheelPageSequence,
  resolveTerminalScreenElement,
  resolveTerminalCellFromPointer,
  isTerminalTranscriptCell,
  buildTerminalMousePressSequence,
  shouldRouteWheelToTranscript,
  restoreTerminalViewportScroll,
  getNativeTerminalBounds,
  shouldRunTerminalViewportReactivation,
  shouldRunPanelClickViewportRecovery,
  shouldRecoverPanelOnActivation,
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
  isWorkspaceCloseRecoverReason,
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
  resolveTerminalRendererViewModel,
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
  WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON,
  proposeTerminalViewportDimensions,
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
const MAX_NATIVE_VTE_PROBE_RETRIES = 4;

// Legacy native VTE helpers removed in Phase 0; stable no-op stubs for teardown paths.
const NATIVE_VTE_STUBS = Object.freeze({
  setNativeVtePanelVisibility: async () => {},
  openNativeVtePanel: async () => ({ opened: false, reason: 'vte-removed' }),
  closeNativeVtePanel: async () => {},
  resizeNativeVtePanel: async () => {},
  focusNativeVtePanel: async () => {},
  pasteNativeVtePanel: async () => ({ supported: false, reason: 'vte-removed' }),
  subscribeNativeVteEvents: () => () => {},
  probeNativeVte: async () => ({ ready: false, reason: 'vte-removed' }),
  shouldOpenNativeVtePanel: () => false,
});

// Master switch for the legacy native VTE (GTK) backend.
// We keep the entire implementation (nativeVteBridge, probes, lease logic, etc.)
// in the tree exactly as-is so it can be re-enabled later if needed.
const ENABLE_NATIVE_VTE = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

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
      // Simple local per-device size (persisted via the +/- buttons).
      // Base default (14) balances density in multi-panel grids with legibility.
      const stored = typeof window !== 'undefined' && window.localStorage.getItem(FONT_SIZE_KEY);
      const parsed = stored ? parseInt(stored, 10) : NaN;
      if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 24) return parsed;
      return 14;
    } catch {
      return 14;
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
  const [sessionExitReason, setSessionExitReason] = useState(null);
  const [nativeVteProbeAttempt, setNativeVteProbeAttempt] = useState(0);
  const [nativeVteRecoveryAttempt, setNativeVteRecoveryAttempt] = useState(0);
  const [webglProbeResult, setWebglProbeResult] = useState(() => probeWebglSupport());
  const [webglFallback, setWebglFallback] = useState(null);
  const [xtermBootNonce, setXtermBootNonce] = useState(0);
  const webglAddonRef = useRef(null);
  const canvasAddonRef = useRef(null);
  const webglFallbackRef = useRef(webglFallback);
  webglFallbackRef.current = webglFallback;
  const terminalBlurCleanupRef = useRef(null);
  const tauriAvailable = false;

  const {
    setNativeVtePanelVisibility,
    openNativeVtePanel,
    closeNativeVtePanel,
    resizeNativeVtePanel,
    focusNativeVtePanel,
    pasteNativeVtePanel,
    subscribeNativeVteEvents,
    probeNativeVte,
    shouldOpenNativeVtePanel,
  } = NATIVE_VTE_STUBS;

  const resolvedRuntimePlatform = getTerminalRuntimePlatform(runtimePlatform);
  // Force the only supported active renderer. Any vte request (from stored
  // prefs or old callers) is redirected here so we never boot the native VTE surface.
  const effectiveRequestedMode =
    !ENABLE_NATIVE_VTE && requestedRendererMode === 'vte-experimental'
      ? 'xterm-webgl'
      : requestedRendererMode;

  const rendererCapabilities = getTerminalRendererRuntimeCapabilities({
    platform: resolvedRuntimePlatform,
    tauriAvailable,
    nativeVteProbe: nativeVteProbeResult,
    nativeVteOpenFailure,
    webglProbe: webglProbeResult,
  });
  const rendererViewModel = resolveTerminalRendererViewModel({
    requestedRendererMode: effectiveRequestedMode,
    rendererCapabilities,
    nativeVteReady:
      ENABLE_NATIVE_VTE && effectiveRequestedMode === 'vte-experimental' && nativeVteOpened,
  });
  const operationalRendererMode = resolveOperationalRendererMode({
    requestedMode: effectiveRequestedMode,
    effectiveMode: rendererViewModel.effectiveMode,
    visibleTerminalPanelCount,
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
  const effectiveRendererModeRef = useRef(operationalRendererMode);
  const operationalRendererModeRef = useRef(operationalRendererMode);
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

  const clearNativeVteProbeRetryTimer = useCallback(() => {
    if (!nativeVteProbeRetryTimerRef.current) return;

    clearTimeout(nativeVteProbeRetryTimerRef.current);
    nativeVteProbeRetryTimerRef.current = null;
    nativeVteProbeRetryDelayRef.current = null;
  }, []);

  const engineCtxRef = useRef(null);
  const disposeXtermRuntimeRef = useRef(() => {});
  const disposeXtermRuntime = useCallback((opts) => disposeXtermRuntimeRef.current?.(opts), []);

  const shouldRetryNativeVteProbe =
    ENABLE_NATIVE_VTE &&
    isActivePanel &&
    requestedRendererMode === 'vte-experimental' &&
    !nativeVteOpened &&
    !nativeVteOpenFailure &&
    nativeVteProbeResult?.ready === false &&
    nativeVteProbeResult?.reason === 'probe-failed';

  useEffect(() => {
    shouldRetryNativeVteProbeRef.current = shouldRetryNativeVteProbe;
  }, [shouldRetryNativeVteProbe]);

  const queueNativeVteProbeRetry = useCallback(
    (delayMs = 80) => {
      if (!shouldRetryNativeVteProbeRef.current) return;
      if (nativeVteProbeRetryCountRef.current >= MAX_NATIVE_VTE_PROBE_RETRIES) return;

      if (delayMs <= 0) {
        clearNativeVteProbeRetryTimer();
        nativeVteProbeRetryCountRef.current += 1;
        setNativeVteProbeAttempt((attempt) => attempt + 1);
        return;
      }

      if (nativeVteProbeRetryTimerRef.current) {
        const pendingDelay = nativeVteProbeRetryDelayRef.current ?? Number.POSITIVE_INFINITY;
        if (delayMs >= pendingDelay) return;

        clearTimeout(nativeVteProbeRetryTimerRef.current);
        nativeVteProbeRetryTimerRef.current = null;
      }

      nativeVteProbeRetryDelayRef.current = delayMs;

      nativeVteProbeRetryTimerRef.current = setTimeout(() => {
        nativeVteProbeRetryTimerRef.current = null;
        nativeVteProbeRetryDelayRef.current = null;

        if (!shouldRetryNativeVteProbeRef.current) return;

        nativeVteProbeRetryCountRef.current += 1;
        setNativeVteProbeAttempt((attempt) => attempt + 1);
      }, delayMs);
    },
    [clearNativeVteProbeRetryTimer]
  );

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
    effectiveRendererModeRef.current = operationalRendererMode;
    operationalRendererModeRef.current = operationalRendererMode;
  }, [operationalRendererMode]);

  useLayoutEffect(() => {
    visibleTerminalPanelCountRef.current = visibleTerminalPanelCount;
  }, [visibleTerminalPanelCount]);

  // Real WebGL capability probe (runs once per mount, cheap detached canvas test).
  // Populates webglProbeResult so the runtime capabilities and switcher labels are honest.
  useEffect(() => {
    try {
      const result = probeWebglSupport();
      setWebglProbeResult((prev) => {
        if (prev && prev.ready === result.ready && prev.reason === result.reason) {
          return prev;
        }
        return result;
      });
    } catch {
      setWebglProbeResult((prev) => {
        const result = {
          ready: false,
          reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED,
        };
        if (prev && prev.ready === result.ready && prev.reason === result.reason) {
          return prev;
        }
        return result;
      });
    }
  }, []);

  // Surface xterm-webgl demotion as a visible warning when the user asked for WebGL
  // but the resolver (or probe) forced fallback to plain xterm. Clears only demotion-shaped
  // reasons when the user picks a different renderer.
  useEffect(() => {
    if (operationalRendererMode === TERMINAL_OPERATIONAL_CANVAS_MODE) {
      if (
        webglFallback &&
        (webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW ||
          webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED ||
          webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_IMPORT_FAILED)
      ) {
        setWebglFallback(null);
      }
      return;
    }

    if (
      requestedRendererMode === 'xterm-webgl' &&
      rendererViewModel.effectiveMode !== 'xterm-webgl'
    ) {
      setWebglFallback({
        active: true,
        reason:
          webglProbeResult?.reason || TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW,
      });
    } else if (
      webglFallback &&
      (webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_UNSUPPORTED_IN_WEBVIEW ||
        webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_CREATION_FAILED ||
        webglFallback.reason === TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_IMPORT_FAILED)
    ) {
      // user moved away from the demoted choice — clear the demotion banner
      setWebglFallback(null);
    }
  }, [
    operationalRendererMode,
    requestedRendererMode,
    rendererViewModel.effectiveMode,
    webglProbeResult,
    webglFallback,
  ]);

  const handleSwitchToXterm = useCallback(() => {
    if (typeof onResetRendererToXterm === 'function') {
      onResetRendererToXterm();
      return;
    }
    setWebglFallback(null);
    setWebglProbeResult(probeWebglSupport());
  }, [onResetRendererToXterm]);

  const handleRetryProbe = useCallback(() => {
    setWebglProbeResult(probeWebglSupport());
    setXtermBootNonce((n) => n + 1);
  }, []);

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

  const closeNativeLease = useCallback(
    async (reason = 'deactivate') => {
      if (reason === 'renderer-disabled' && restoredHiddenLeaseThisMountRef.current) {
        restoredHiddenLeaseThisMountRef.current = false;
        if (requestedRendererModeRef.current === 'vte-experimental') {
          return;
        }
      }
      if (!nativeLeaseRef.current) {
        clearNativeVteLease(id);
        return;
      }
      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      clearNativeVteLease(id);
      await Promise.resolve(closeNativeVtePanel({ panelId: id, reason })).catch(() => {});
    },
    [id]
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

  const hideNativeLease = useCallback(
    async (reason = 'inactive') => {
      if (!nativeLeaseRef.current) return;
      cliLog(`CLIENT:${id}`, 'native VTE hide requested', { reason });
      await Promise.resolve(
        setNativeVtePanelVisibility({
          panelId: id,
          visible: false,
          reason,
        })
      ).catch(() => {});
      if (reason === 'layout-unmount') {
        markNativeVteLeaseHidden(id);
      }
    },
    [id]
  );

  const applyTerminalSessionExit = useCallback(
    (detail = {}, { emitBrowserEvent = false } = {}) => {
      const panelId = detail?.id || detail?.panelId;
      if (panelId && panelId !== id) return;

      const reason = detail?.reason || null;
      const command = detail?.initialCommand || initialCommand;
      const parsed = parseTerminalExitReason(reason);
      const agentSession = parsed.kind === 'agent' || isAgentTuiCommand(command);

      processExitedRef.current = true;
      tuiSessionActiveRef.current = false;
      isGrokSessionRef.current = false;
      grokTuiReadyRef.current = false;
      tuiSessionFooterConfirmedRef.current = false;
      setNativeWheelPassthrough(false);
      setSessionExitReason(reason);
      disableTerminalFocusReporting(termRef.current, { disableMouse: true });

      if (agentSession && parsed.kind === 'agent') {
        setConnectionState('agent-exited');
        persistPanelSessionExit(id, { reason, connectionState: 'agent-exited' });
      } else if (agentSession && parsed.abnormal) {
        setConnectionState('terminated');
        clearPanelSessionExit(id);
      } else {
        setConnectionState('terminated');
        clearPanelSessionExit(id);
      }

      if (requestedRendererModeRef.current === 'vte-experimental' && nativeLeaseRef.current) {
        const bounds = getNativeTerminalBounds(
          containerRef.current || nativePlaceholderRef.current
        );
        if (bounds) {
          void Promise.resolve(
            setNativeVtePanelVisibility({
              panelId: id,
              visible: true,
              bounds,
            })
          ).catch(() => {});
        }
      }

      if (requestedRendererModeRef.current !== 'vte-experimental' && termRef.current) {
        const overlayCopy = buildTerminalExitOverlayCopy({
          initialCommand: command,
          reason,
          connectionState: agentSession && parsed.kind === 'agent' ? 'agent-exited' : 'terminated',
        });
        termRef.current?.writeln(`\r\n\x1b[33m[${overlayCopy.title}]\x1b[0m`);
      }

      if (emitBrowserEvent) {
        window.dispatchEvent(
          new CustomEvent('devhub:terminal-exit', {
            detail: { id, initialCommand: command, reason },
          })
        );
      }
    },
    [id, initialCommand, setConnectionState]
  );

  useLayoutEffect(() => {
    cancelNativeVteLayoutHide(id);
    const persistedExit = readPanelSessionExit(id);
    const restoredLease = consumeHiddenNativeVteLease(id);
    if (!restoredLease && !persistedExit) return;

    nativeLeaseRef.current = true;
    restoredHiddenLeaseThisMountRef.current = Boolean(restoredLease);
    setNativeVteOpened(true);
    setNativeVteProbeResult((prev) => prev ?? { ready: true, reason: null });

    if (persistedExit) {
      processExitedRef.current = true;
      setSessionExitReason(persistedExit.reason);
      setConnectionState(persistedExit.connectionState);
      return;
    }

    setConnectionState('connected');
  }, [id]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      // Phase 1 terminal-engine-v2: explicitly unsubscribe before React unmount
      // so the sidecar keeps the PTY alive for hidden panels.
      if (isEngineV2Ref.current && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'unsubscribe' }));
        } catch {
          // ignore unsubscribe send errors during unmount
        }
      }

      // Window/view switches unmount React but must keep the GTK lease + PTY alive.
      // Permanent teardown runs via tearDownClientSession / handleClosePanel first.
      if (sessionClosingRef.current) {
        cancelNativeVteLayoutHide(id);
        clearNativeVteLease(id);
        return;
      }
      deferNativeVteLayoutHide(id, () => {
        hideNativeLease('layout-unmount');
      });
    };
  }, [closeNativeLease, hideNativeLease, id]);

  const handleNativeLeaseCommandError = useCallback(
    (error) => {
      const reason = String(error?.message || error || '');
      if (!reason.includes('panel-not-active')) return;

      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      setNativeVteOpenFailure(null);
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
      setNativeVteRecoveryAttempt((attempt) => attempt + 1);
    },
    [clearNativeVteProbeRetryTimer]
  );

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

  const showNativeLease = useCallback(async () => {
    if (!nativeLeaseRef.current) return;
    const bounds = getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current);
    if (!bounds) {
      cliLog(`CLIENT:${id}`, 'native VTE show skipped — invalid bounds');
      return;
    }
    cliLog(`CLIENT:${id}`, 'native VTE show requested', { bounds });
    await Promise.resolve(
      setNativeVtePanelVisibility({
        panelId: id,
        visible: true,
        bounds,
      })
    ).catch(handleNativeLeaseCommandError);
  }, [handleNativeLeaseCommandError, id]);

  const resizeNativeLease = useCallback(async () => {
    if (!nativeLeaseRef.current) return;
    const bounds = getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current);
    if (!bounds) {
      cliLog(`CLIENT:${id}`, 'native VTE resize skipped — invalid bounds');
      return;
    }
    cliLog(`CLIENT:${id}`, 'native VTE resize requested', { bounds });
    await Promise.resolve(
      resizeNativeVtePanel({
        panelId: id,
        bounds,
      })
    ).catch(handleNativeLeaseCommandError);
  }, [handleNativeLeaseCommandError, id]);

  const showAndResizeNativeLease = useCallback(async () => {
    await showNativeLease();
    await resizeNativeLease();
  }, [resizeNativeLease, showNativeLease]);

  const resolveSwarmTmuxSessionName = useCallback(() => {
    if (!swarmContext?.isSwarmRole) return null;
    return buildSwarmTmuxSessionName(swarmContext.launchId, swarmContext.roleKey);
  }, [swarmContext]);

  const notifyAgentReady = useCallback(
    async (program = 'opencode', opencodeSessionId, reason = 'client-tui-footer') => {
      const normalizedProgram = String(program || 'opencode').trim() || 'opencode';
      const notifiedRef =
        normalizedProgram === 'kimi' ? kimiReadyNotifiedRef : opencodeReadyNotifiedRef;
      if (notifiedRef.current) return;
      const tmuxSession = resolveSwarmTmuxSessionName();
      if (!tmuxSession) return;

      const storageKey = `devhub:agent-ready-posted:${normalizedProgram}:${tmuxSession}`;
      try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(storageKey)) {
          notifiedRef.current = true;
          return;
        }
      } catch {
        /* ignore */
      }

      notifiedRef.current = true;
      try {
        await fetch('/api/terminal/opencode-ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: id,
            tmuxSession,
            program: normalizedProgram,
            opencodeSessionId: opencodeSessionId || null,
            reason,
          }),
        });
        cliLog(`CLIENT:${id}`, 'agent-ready-notified', {
          tmuxSession,
          program: normalizedProgram,
          opencodeSessionId,
          reason,
        });
        try {
          sessionStorage?.setItem(storageKey, String(Date.now()));
        } catch {
          /* ignore */
        }
      } catch (error) {
        notifiedRef.current = false;
        cliLog(`CLIENT:${id}`, 'agent-ready-failed', {
          program: normalizedProgram,
          error: error?.message,
        });
      }
    },
    [id, resolveSwarmTmuxSessionName]
  );

  const notifyOpencodeReady = useCallback(
    (opencodeSessionId, reason = 'client-tui-footer') =>
      notifyAgentReady('opencode', opencodeSessionId, reason),
    [notifyAgentReady]
  );

  const notifyViewportReady = useCallback(
    (cols, rows) => {
      const tmuxSession = resolveSwarmTmuxSessionName();
      if (!tmuxSession) return;

      const lastPosted = lastViewportReadyPostedRef.current;
      if (lastPosted.cols === cols && lastPosted.rows === rows) return;

      if (viewportReadyNotifyTimerRef.current) {
        clearTimeout(viewportReadyNotifyTimerRef.current);
      }

      viewportReadyNotifyTimerRef.current = setTimeout(() => {
        viewportReadyNotifyTimerRef.current = null;
        lastViewportReadyPostedRef.current = { cols, rows };

        void (async () => {
          try {
            await fetch('/api/terminal/viewport-ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: id,
                tmuxSession,
                cols,
                rows,
              }),
            });
            cliLog(`CLIENT:${id}`, 'viewport-ready-notified', { tmuxSession, cols, rows });
            // Bootstrap waits for client-tui-footer (OpenCode MCP /status row), not
            // viewport attach — posting opencode-ready here caused premature paste and
            // ANSI garbage while OpenCode was still starting.
          } catch (error) {
            cliLog(`CLIENT:${id}`, 'viewport-ready-failed', { error: error?.message });
          }
        })();
      }, 200);
    },
    [id, resolveSwarmTmuxSessionName]
  );

  const skipRedundantInitialCommandSend = useCallback(
    (commandToSend, isRecoveryRelaunch = false) =>
      shouldSkipRedundantInitialCommandSend({
        panelId: id,
        command: commandToSend,
        isRecoveryRelaunch,
        sessionReattached: sessionReattachedRef.current,
      }),
    [id]
  );

  const restoreInitialCommandDispatchGuard = useCallback(() => {
    if (hasSentInitialCommand.current) return;
    const record = getPanelInitialCommandDispatch(id);
    if (record?.command) {
      hasSentInitialCommand.current = true;
      sessionReattachedRef.current = true;
      return;
    }
    // Only suppress a fresh initialCommand when the server has already declared the
    // session reattached (live tmux pane). The first connection of a fresh panel has
    // hasConnectedOnceRef === true but is NOT a reattach, so relying on that flag alone
    // prevented workspace-modal panels from ever injecting their launch command.
    if (sessionReattachedRef.current && hasConnectedOnceRef.current && initialCommand) {
      sessionReattachedRef.current = true;
      hasSentInitialCommand.current = true;
    }
  }, [id, initialCommand]);

  const resolveInjectCommand = useCallback(() => {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    const agentRun = readAgentRunForPanel(storage, id);
    return resolveTerminalInjectCommand(initialCommand, agentRun);
  }, [id, initialCommand]);

  const sendInitialCommandIfReady = useCallback(() => {
    if (!initialCommand || hasSentInitialCommand.current) return;
    // Extra guard against re-injection when the local ref was reset (e.g. a reconnect
    // race or a remount that kept the panel ID). The lifecycle store survives remounts.
    if (
      shouldSkipRedundantInitialCommandSend({
        panelId: id,
        command: initialCommand,
        sessionReattached: sessionReattachedRef.current,
      })
    ) {
      logTerminalSession('initial-command-skipped', {
        panelId: id,
        reason: 'redundant-lifecycle-early',
        command: initialCommand,
        sessionReattached: sessionReattachedRef.current,
      });
      hasSentInitialCommand.current = true;
      return;
    }
    // Never send the launch/resume command before the server's `ready` message, and
    // never on reattach — a reattach means the tmux pane already has a live TUI, so
    // typing `opencode --session …` / `grok` into it would echo as visible text in the
    // conversation (Bug B). Only a fresh (reattached: false) session should be launched.
    if (!serverReadyReceivedRef.current) return;
    if (sessionReattachedRef.current) {
      hasSentInitialCommand.current = true;
      markPanelInitialCommandDispatched(id, initialCommand);
      return;
    }
    if (!viewportFitConfirmedRef.current) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    // Fresh panels created from the workspace modal must wait for the host surface
    // projection before injecting the launch command. Sending too early can leave the
    // terminal blank because xterm has not rendered the viewport yet.
    const projectionElapsedMs = Date.now() - panelCreatedAtRef.current;
    console.log(
      `[DEBUG TTY:${id}] sendInitialCommandIfReady called. cmd=${initialCommand}, projectionReady=${projectionReadyRef.current}, elapsed=${projectionElapsedMs}ms, viewportFit=${viewportFitConfirmedRef.current}, wsOpen=${wsRef.current?.readyState === WebSocket.OPEN}`
    );
    if (!projectionReadyRef.current && projectionElapsedMs < TERMINAL_PROJECTION_READY_TIMEOUT_MS) {
      if (initialCommandProjectionRetryTimerRef.current) {
        window.clearTimeout(initialCommandProjectionRetryTimerRef.current);
      }
      console.log(`[DEBUG TTY:${id}] projection not ready, scheduling retry in 50ms`);
      initialCommandProjectionRetryTimerRef.current = window.setTimeout(() => {
        initialCommandProjectionRetryTimerRef.current = null;
        sendInitialCommandIfReady();
      }, 50);
      return;
    }

    const isRecoveryRelaunch = /#recovery-\d+\s*$/i.test(initialCommand);
    let commandToSend = null;

    if (swarmContext?.isSwarmRole) {
      const wrapperAlreadyDispatched = isSwarmLaunchWrapperDispatched(
        {
          launchId: swarmContext.launchId,
          roleKey: swarmContext.roleKey,
        },
        typeof window !== 'undefined' ? window.localStorage : null
      );
      if (wrapperAlreadyDispatched || swarmContext?.needsLaunchWrapper !== true) {
        logTerminalSession('initial-command-skipped', {
          panelId: id,
          reason: wrapperAlreadyDispatched
            ? 'swarm-wrapper-already-dispatched'
            : 'swarm-tmux-reattach',
          command: initialCommand,
        });
        hasSentInitialCommand.current = true;
        markPanelInitialCommandDispatched(id, initialCommand);
        return;
      }

      // Fresh swarm launch: inject materialized bash wrapper directly.
      // resolveTerminalInjectCommand intentionally returns null for wrappers (reconnect safety).
      commandToSend = String(initialCommand || '')
        .replace(/\s*#recovery-\d+\s*$/i, '')
        .trim();
      if (!commandToSend || !isSwarmLaunchWrapperCommand(commandToSend)) {
        logTerminalSession('initial-command-skipped', {
          panelId: id,
          reason: 'swarm-wrapper-command-missing',
          command: initialCommand,
        });
        hasSentInitialCommand.current = true;
        return;
      }
    } else {
      commandToSend = resolveInjectCommand();
      if (!commandToSend) {
        logTerminalSession('initial-command-skipped', {
          panelId: id,
          reason: 'no-resolved-inject-command',
          command: initialCommand,
          isRecoveryRelaunch,
        });
        hasSentInitialCommand.current = true;
        return;
      }
    }

    if (skipRedundantInitialCommandSend(commandToSend, isRecoveryRelaunch)) {
      logTerminalSession('initial-command-skipped', {
        panelId: id,
        reason: 'redundant-lifecycle',
        command: initialCommand,
        isRecoveryRelaunch,
      });
      hasSentInitialCommand.current = true;
      markPanelInitialCommandDispatched(id, initialCommand);
      return;
    }
    if (
      shouldBlockLateInitialCommandSend({
        hasConnectedOnce: hasConnectedOnceRef.current,
        isRecoveryRelaunch,
        snapshotCommand: initialCommandConnectSnapshotRef.current,
        currentCommand: initialCommand,
      })
    ) {
      logTerminalSession('initial-command-blocked', {
        panelId: id,
        reason: 'late-command-change',
        snapshotCommand: initialCommandConnectSnapshotRef.current,
        currentCommand: initialCommand,
      });
      hasSentInitialCommand.current = true;
      markPanelInitialCommandDispatched(id, initialCommand);
      return;
    }

    const cleanCommand = commandToSend.replace(/\s*#recovery-\d+\s*$/, '');
    logTerminalSession('initial-command-sent', {
      panelId: id,
      command: cleanCommand,
      sourceCommand: initialCommand,
      isRecoveryRelaunch,
      transport: transportRef.current,
    });
    console.log(`[TTY:${id}] Sending initial command: ${cleanCommand}`);
    if (transportRef.current === 'raw') {
      wsRef.current.send(cleanCommand + '\r');
    } else {
      wsRef.current.send(JSON.stringify({ type: 'input', data: cleanCommand + '\r' }));
    }
    hasSentInitialCommand.current = true;
    markPanelInitialCommandDispatched(id, commandToSend);
    if (swarmContext?.isSwarmRole && swarmContext?.needsLaunchWrapper === true) {
      markSwarmLaunchWrapperDispatched(
        {
          launchId: swarmContext.launchId,
          roleKey: swarmContext.roleKey,
          panelId: id,
        },
        typeof window !== 'undefined' ? window.localStorage : null
      );
      window.dispatchEvent(
        new CustomEvent('devhub:swarm-launch-wrapper-sent', { detail: { panelId: id } })
      );
    }
  }, [id, initialCommand, resolveInjectCommand, skipRedundantInitialCommandSend, swarmContext]);

  const scheduleInitialCommandAfterViewport = useCallback(() => {
    if (initialCommandDelayScheduledRef.current) return;
    initialCommandDelayScheduledRef.current = true;

    const delayMs = Math.max(0, Number(swarmContext?.startAfterMs) || 0);
    if (initialCommandDelayTimerRef.current) {
      window.clearTimeout(initialCommandDelayTimerRef.current);
      initialCommandDelayTimerRef.current = null;
    }
    if (delayMs > 0) {
      initialCommandDelayTimerRef.current = window.setTimeout(() => {
        initialCommandDelayTimerRef.current = null;
        sendInitialCommandIfReady();
      }, delayMs);
      return;
    }
    sendInitialCommandIfReady();
  }, [sendInitialCommandIfReady, swarmContext?.startAfterMs]);

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

  const viewportCtxRef = useRef(null);
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

  // Bounded retry that forces a REAL canvas repaint (1-cell nudge = equivalent to
  // a manual resize) across frames until forceTerminalViewportRepaint returns true.
  // Needed because the GPU renderer (canvas/webgl) is released while the workspace
  // shell is hidden and reattached async; the first attempt usually runs before the
  // reattach completes so the renderer slot is empty and force bails. Without retry,
  // panels stay black until a manual resize. Guards bail on dispose/hide; no PTY
  // SIGWINCH is ever sent (forceTerminalViewportRepaint never notifies the PTY).
  const scheduleBoundedForceRepaint = useCallback(
    (maxAttempts = 24) => {
      if (isEngineV2Ref.current) return;
      let attempts = 0;
      const attempt = () => {
        if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
          return;
        }
        if (coalescedForceRepaint(termRef.current, { reason: 'bounded-force-repaint' })) return;
        if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
      };
      attempt();
    },
    [coalescedForceRepaint]
  );

  // Bounded retry that does a REAL fit (recalculate cols/rows from the container
  // AND send SIGWINCH to the PTY when cols change) across frames until the
  // terminal's cols/rows match the container's real capacity. This is the
  // automatic equivalent of a manual split-drag resize — the ONLY thing that
  // reliably fixes the "black gutters on the right" symptom, where a TUI (grok,
  // OpenCode, etc.) paints at a stale smaller width after a workspace switch and
  // leaves a dead black strip between the TUI content and the panel border.
  //
  // Why a new helper and not scheduleBoundedForceRepaint: the 1-cell nudge only
  // repaints xterm's bitmap at the CURRENT cols/rows — it never recomputes them
  // from the container and never notifies the PTY, so a TUI drawing at stale dims
  // stays guted. And syncTerminalViewportOnWorkspaceShow's DOM-TUI freeze path
  // calls nudgeTerminalPtyResize WITHOUT force, which bails when lastPtySizeRef
  // matches the (stale) cols → no SIGWINCH → the TUI never redraws at full width.
  // fitTerminalViewport does both jobs (resize term + PTY notify) but bails until
  // isTerminalRendererReady (async GPU reattach) and while the container is
  // zero-sized during the switch transition, so it must be retried across frames.
  //
  // ponytail: skip kimi's live Ink TUI — its workspace-show path intentionally
  // uses skipPtyNotify to avoid disrupting Ink's re-render loop; sending it a
  // SIGWINCH here could worsen the "kimi crashes sometimes" symptom. Kimi keeps
  // its existing specialized freeze path. fitTerminalViewport only sends SIGWINCH
  // when cols actually change (lastPtySizeRef guard), so bounded fit is safe for
  // Kimi/OpenCode once container dims differ from the stale grid.
  const scheduleBoundedFitRepaint = useCallback(
    (maxAttempts = 24) => {
      if (isEngineV2Ref.current) return;
      let attempts = 0;
      // ponytail: require the container's proposed dims to be STABLE across 2
      // consecutive frames before stopping. On a workspace switch the PanelGroup /
      // xterm canvas is still settling a frame or two after the first fit, so the
      // container often reports a transient narrow width; stopping on the first
      // settled frame leaves the term at those narrow cols → black strip on the
      // right (Grok/DOM TUI symptom). Waiting one extra frame for stability costs
      // one no-op fit and catches the container's final width. Ceiling: a container
      // that keeps oscillating forever would burn maxAttempts no-op fits then stop;
      // upgrade path is a ResizeObserver-driven fit instead of rAF polling.
      let lastProposed = null;
      const attempt = () => {
        if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
          return;
        }
        const fitWorked = fitTerminalViewport({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
          socket: wsRef.current,
          clearAtlas: false,
          lastPtySizeRef: lastPtySizeRef.current,
        });
        const proposed = proposeTerminalViewportDimensions({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
        });
        const settled =
          fitWorked &&
          proposed &&
          Number(proposed.cols) === Number(termRef.current.cols) &&
          Number(proposed.rows) === Number(termRef.current.rows);
        const stable =
          lastProposed !== null &&
          proposed &&
          Number(lastProposed.cols) === Number(proposed.cols) &&
          Number(lastProposed.rows) === Number(proposed.rows);
        lastProposed =
          proposed && Number(proposed.cols) > 0
            ? { cols: Number(proposed.cols), rows: Number(proposed.rows) }
            : lastProposed;
        if (settled && stable) {
          coalescedForceRepaint(termRef.current, { reason: 'bounded-fit-repaint' });
          return;
        }
        if (attempts++ < maxAttempts) requestAnimationFrame(attempt);
      };
      attempt();
    },
    [coalescedForceRepaint, initialCommand]
  );

  useEffect(() => {
    scheduleBoundedFitRepaintRef.current = scheduleBoundedFitRepaint;
  }, [scheduleBoundedFitRepaint]);

  // Bounded ASYNC retry that guarantees the GPU renderer addon is reattached after a
  // workspace show, then force-repaints. This is the deterministic backbone that ends
  // the recurring black-screen-on-switch: it does not rely on the scattered
  // reattach calls inside syncTerminalViewportOnWorkspaceShow's branches (some of
  // which return early without reattaching) nor on the release/reattach flags (which
  // diverge from the actual addon-ref state under rapid switching).
  //
  // Why this is needed on top of scheduleBoundedForceRepaint: when the GPU addon is
  // disposed on hide, RenderService._renderer.value still holds the disposed renderer,
  // so isTerminalRendererReady() returns true and forceTerminalViewportRepaint()
  // returns true without painting (disposed renderer no-ops). The force-repaint retry
  // therefore stops on its first "success" and never reattaches -> black panel. The
  // addon REF is the truthful signal; reattach replaces the disposed renderer with a
  // live one, then the force-repaint actually paints.
  const scheduleBoundedGpuRecover = useCallback(
    (maxAttempts = 30) => {
      if (isEngineV2Ref.current) return;
      let attempts = 0;
      // ponytail: same 2-frame stability gate as scheduleBoundedFitRepaint — stopping
      // when forceTerminalViewportRepaint "succeeds" at stale narrow cols leaves Grok
      // TUIs drawing in a tiny corner with a black gutter on the right.
      let lastProposed = null;
      const tick = async () => {
        if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          if (attempts++ < maxAttempts) requestAnimationFrame(tick);
          return;
        }
        if (
          needsGpuRendererReattach({
            operationalRendererMode: operationalRendererModeRef.current,
            webglAddon: webglAddonRef.current,
            canvasAddon: canvasAddonRef.current,
          })
        ) {
          if (
            shouldAttachWebglRenderer({
              operationalRendererMode: operationalRendererModeRef.current,
            })
          ) {
            await tryReattachWebglAddonRef.current?.({
              clearAtlas: false,
              skipFitWhenUnchanged: true,
            });
          } else {
            await tryReattachCanvasAddonRef.current?.();
          }
        }
        if (isDisposingRef.current || !termRef.current || !isVisibleInLayoutRef.current) return;
        let fitWorked = false;
        fitWorked = fitTerminalViewport({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
          socket: wsRef.current,
          clearAtlas: false,
          lastPtySizeRef: lastPtySizeRef.current,
        });
        const proposed = proposeTerminalViewportDimensions({
          container: containerRef.current,
          fitAddon: fitRef.current,
          term: termRef.current,
        });
        const settled =
          fitWorked &&
          proposed &&
          Number(proposed.cols) === Number(termRef.current.cols) &&
          Number(proposed.rows) === Number(termRef.current.rows);
        const stable =
          lastProposed !== null &&
          proposed &&
          Number(lastProposed.cols) === Number(proposed.cols) &&
          Number(lastProposed.rows) === Number(proposed.rows);
        lastProposed =
          proposed && Number(proposed.cols) > 0
            ? { cols: Number(proposed.cols), rows: Number(proposed.rows) }
            : lastProposed;
        const gpuReady = !needsGpuRendererReattach({
          operationalRendererMode: operationalRendererModeRef.current,
          webglAddon: webglAddonRef.current,
          canvasAddon: canvasAddonRef.current,
        });
        if (gpuReady && settled && stable) {
          coalescedForceRepaint(termRef.current, { reason: 'bounded-gpu-recover' });
          return;
        }
        if (attempts++ < maxAttempts) requestAnimationFrame(tick);
      };
      tick();
    },
    [coalescedForceRepaint, initialCommand]
  );

  useEffect(() => {
    scheduleBoundedGpuRecoverRef.current = scheduleBoundedGpuRecover;
  }, [scheduleBoundedGpuRecover]);

  useEffect(() => {
    let cancelled = false;
    const prevMode = prevRequestedRendererModeRef.current;
    prevRequestedRendererModeRef.current = requestedRendererMode;

    if (!ENABLE_NATIVE_VTE || requestedRendererMode !== 'vte-experimental') {
      setNativeVteProbeResult(null);
      setNativeVteOpenFailure(null);
      setNativeVteOpened(false);
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
      // Only close when actually leaving native mode, not on every remount/probe cycle.
      if (prevMode === 'vte-experimental' || nativeLeaseRef.current) {
        closeNativeLease('renderer-disabled');
      }
      return undefined;
    }

    if (!isVisibleInLayout) {
      clearNativeVteProbeRetryTimer();
      return undefined;
    }

    probeNativeVte({
      panelId: id,
      requestedMode: requestedRendererMode,
      tauriAvailable,
    })
      .then((result) => {
        if (cancelled) return;
        cliLog(`CLIENT:${id}`, 'native VTE probe result', {
          result,
          requestedRendererMode,
          tauriAvailable,
        });
        setNativeVteProbeResult(result);
        if (result?.ready) {
          nativeVteProbeRetryCountRef.current = 0;
          clearNativeVteProbeRetryTimer();
        } else {
          setNativeVteOpenFailure(null);
          setNativeVteOpened(false);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        cliLog(`CLIENT:${id}`, 'native VTE probe failed', {
          error: error?.message,
          requestedRendererMode,
          tauriAvailable,
        });
        setNativeVteProbeResult({ ready: false, reason: error?.message || 'probe-failed' });
        setNativeVteOpened(false);
        setNativeVteOpenFailure(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    clearNativeVteProbeRetryTimer,
    closeNativeLease,
    id,
    isActivePanel,
    nativeVteProbeAttempt,
    requestedRendererMode,
    tauriAvailable,
  ]);

  useEffect(() => {
    if (!shouldRetryNativeVteProbe) return undefined;

    queueNativeVteProbeRetry(160);
    return undefined;
  }, [queueNativeVteProbeRetry, shouldRetryNativeVteProbe]);

  useEffect(() => {
    let cancelled = false;

    if (
      !shouldOpenNativeVtePanel({
        isActivePanel,
        isVisibleInLayout,
        suspendNativeSurface,
        nativeVteOpenFailure,
        nativeVteProbe: nativeVteProbeResult,
        requestedRendererMode,
        runtimePlatform: resolvedRuntimePlatform,
        tauriAvailable,
      })
    ) {
      if (requestedRendererMode !== 'vte-experimental') {
        closeNativeLease('renderer-disabled');
      }
      return undefined;
    }

    const bounds = getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current);
    if (!bounds) return undefined;

    const nativeOpenRequest = {
      panelId: id,
      bounds,
      cwd: cwd || null,
      initialCommand: initialCommand || null,
      sessionId: id,
    };

    const applyNativeOpenResult = (result) => {
      cliLog(`CLIENT:${id}`, 'native VTE open result', {
        opened: Boolean(result?.opened),
        reason: result?.reason || null,
      });
      if (result?.opened) {
        nativeLeaseRef.current = true;
        setNativeVteOpenFailure(null);
        setNativeVteOpened(true);
        setConnectionState('connected');
        setSessionExitReason(null);
        processExitedRef.current = false;
        setIsInitializing(false);
        clearNativeVteProbeRetryTimer();
        void showAndResizeNativeLease();
        return true;
      }

      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      setNativeVteOpenFailure(result?.reason || 'open-failed');
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
      return false;
    };

    if (nativeLeaseRef.current && nativeVteOpened) {
      (async () => {
        try {
          await showAndResizeNativeLease();
        } catch (error) {
          if (cancelled) return;
          const reason = String(error?.message || error || '');
          handleNativeLeaseCommandError(error);

          if (!reason.includes('panel-not-active')) return;

          try {
            const reopenResult = await openNativeVtePanel(nativeOpenRequest);
            if (cancelled) return;
            applyNativeOpenResult(reopenResult);
          } catch (reopenError) {
            if (cancelled) return;
            applyNativeOpenResult({ opened: false, reason: reopenError?.message || 'open-failed' });
          }
        }
      })();
      return undefined;
    }

    cliLog(`CLIENT:${id}`, 'native VTE open requested', {
      bounds,
      cwd: cwd || null,
      hasInitialCommand: Boolean(initialCommand),
    });

    openNativeVtePanel(nativeOpenRequest)
      .then((result) => {
        if (cancelled) {
          if (result?.opened) {
            Promise.resolve(
              setNativeVtePanelVisibility({
                panelId: id,
                visible: false,
                reason: 'layout-hidden',
              })
            ).catch(handleNativeLeaseCommandError);
          }
          return;
        }
        applyNativeOpenResult(result);
      })
      .catch((error) => {
        if (cancelled) return;
        applyNativeOpenResult({ opened: false, reason: error?.message || 'open-failed' });
      });

    return () => {
      cancelled = true;
    };
  }, [
    closeNativeLease,
    clearNativeVteProbeRetryTimer,
    cwd,
    handleNativeLeaseCommandError,
    id,
    initialCommand,
    isActivePanel,
    isVisibleInLayout,
    nativeVteOpenFailure,
    nativeVteOpened,
    nativeVteRecoveryAttempt,
    nativeVteProbeResult,
    requestedRendererMode,
    resolvedRuntimePlatform,
    showNativeLease,
    showAndResizeNativeLease,
    suspendNativeSurface,
    tauriAvailable,
  ]);

  useEffect(() => {
    if (
      nativeVteOpened ||
      !shouldOpenNativeVtePanel({
        isActivePanel,
        isVisibleInLayout,
        suspendNativeSurface,
        nativeVteOpenFailure,
        nativeVteProbe: nativeVteProbeResult,
        requestedRendererMode,
        runtimePlatform: resolvedRuntimePlatform,
        tauriAvailable,
      })
    ) {
      return undefined;
    }

    if (getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current)) {
      return undefined;
    }

    let retryQueued = false;
    let rafId = null;

    const retryNativeOpenWhenBoundsRecover = () => {
      if (retryQueued) return;

      const recoveredBounds = getNativeTerminalBounds(
        containerRef.current || nativePlaceholderRef.current
      );
      if (!recoveredBounds) return;

      retryQueued = true;
      cliLog(`CLIENT:${id}`, 'native VTE bounds recovered — retry open', {
        bounds: recoveredBounds,
      });
      setNativeVteRecoveryAttempt((attempt) => attempt + 1);
    };

    rafId = requestAnimationFrame(() => {
      rafId = null;
      retryNativeOpenWhenBoundsRecover();
    });

    const intervalId = setInterval(retryNativeOpenWhenBoundsRecover, 250);
    window.addEventListener('resize', retryNativeOpenWhenBoundsRecover);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      clearInterval(intervalId);
      window.removeEventListener('resize', retryNativeOpenWhenBoundsRecover);
    };
  }, [
    id,
    isActivePanel,
    isVisibleInLayout,
    nativeVteOpenFailure,
    nativeVteOpened,
    nativeVteProbeResult,
    requestedRendererMode,
    resolvedRuntimePlatform,
    suspendNativeSurface,
    tauriAvailable,
  ]);

  useEffect(() => {
    if (!nativeVteOpened || requestedRendererMode !== 'vte-experimental') return undefined;
    // dock-side-by-side: VTE coexists with the browser dock, but still hide when not visible.
    if (nativeSurfacePolicy === 'dock-side-by-side') {
      if (isVisibleInLayout && !suspendNativeSurface) return undefined;
      // Component lost visibility — hide the native panel even in dock-side-by-side mode.
      (async () => {
        try {
          await setNativeVtePanelVisibility({
            panelId: id,
            visible: false,
            reason: suspendNativeSurface ? 'dock-side-by-side' : 'layout-hidden',
          });
        } catch (error) {
          handleNativeLeaseCommandError(error);
        }
      })();
      return undefined;
    }
    if (isVisibleInLayout && !suspendNativeSurface) return undefined;

    (async () => {
      try {
        await setNativeVtePanelVisibility({
          panelId: id,
          visible: false,
          reason: suspendNativeSurface ? 'suspended' : undefined,
        });
      } catch (error) {
        handleNativeLeaseCommandError(error);
      }
    })();

    return undefined;
  }, [
    handleNativeLeaseCommandError,
    id,
    isVisibleInLayout,
    nativeSurfacePolicy,
    nativeVteOpened,
    requestedRendererMode,
    suspendNativeSurface,
  ]);

  // When the user explicitly changes the renderer away from native VTE on a *visible* panel,
  // we must proactively close the native lease. The existing hide effects are mostly gated
  // behind "still vte but temporarily suspended/not visible". Without this, the GTK widget
  // can stay on top even after requestedRendererMode becomes xterm / xterm-webgl.
  useEffect(() => {
    if (requestedRendererMode === 'vte-experimental' || !nativeVteOpened) return undefined;

    (async () => {
      try {
        await setNativeVtePanelVisibility({
          panelId: id,
          visible: false,
          reason: 'renderer-changed',
        });
        cliLog(`CLIENT:${id}`, 'native VTE lease hidden due to renderer mode change', {
          requestedRendererMode,
        });
      } catch (error) {
        handleNativeLeaseCommandError(error);
      }
    })();

    return undefined;
  }, [
    handleNativeLeaseCommandError,
    id,
    nativeVteOpened,
    requestedRendererMode,
    setNativeVtePanelVisibility,
  ]);

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
      // If we switched back to vte, dispose any web runtime so it doesn't fight the native.
      disposeXtermRuntime();
      return undefined;
    }

    // For xterm / xterm-webgl: dispose whatever was there and force the main boot effect
    // to re-run (via nonce) so the web terminal layer actually initializes.
    disposeXtermRuntime();
    setXtermBootNonce((n) => n + 1);

    return undefined;
  }, [requestedRendererMode, disposeXtermRuntime, id]);

  // Migrate WebGL ↔ Canvas when split geometry changes, without remounting PTYs.
  useLayoutEffect(() => {
    if (shouldUseNativeRenderer || !termRef.current) return;

    const prevCount = prevVisibleTerminalPanelCountRef.current;
    prevVisibleTerminalPanelCountRef.current = visibleTerminalPanelCount;

    const wantsWebgl = shouldAttachWebglRenderer({ operationalRendererMode });
    const wantsCanvas = shouldAttachCanvasRenderer({ operationalRendererMode });

    if (wantsWebgl) {
      if (canvasAddonRef.current) {
        releaseCanvasAddon('split-collapse-webgl');
      }
      if (!webglAddonRef.current) {
        if (prevCount > visibleTerminalPanelCount) {
          cliLog(`RENDER:${id}`, 'webgl-reattach-after-split-collapse');
        }
        void tryReattachWebglAddonRef.current?.({ clearAtlas: false });
      }
      return;
    }

    if (wantsCanvas) {
      if (webglAddonRef.current) {
        releaseWebglAddonForInactivePanel('split-open-canvas');
      }

      if (
        shouldMountCanvasAddon({
          operationalRendererMode,
          isActivePanel: isActivePanelRef.current,
          isVisibleInLayout: isVisibleInLayoutRef.current,
          visibleTerminalPanelCount,
        }) &&
        !canvasAddonRef.current
      ) {
        void tryReattachCanvasAddonRef.current?.();
      }
      return;
    }

    if (webglAddonRef.current) {
      releaseWebglAddonForInactivePanel('operational-dom-fallback');
    }
    if (canvasAddonRef.current) {
      releaseCanvasAddon('operational-dom-fallback');
    }
  }, [
    id,
    isActivePanel,
    isVisibleInLayout,
    operationalRendererMode,
    releaseCanvasAddon,
    releaseWebglAddonForInactivePanel,
    shouldUseNativeRenderer,
    visibleTerminalPanelCount,
  ]);

  // Keep canvas on all visible split siblings; DOM fallback corrupts TUIs with horizontal seams.
  useLayoutEffect(() => {
    if (shouldUseNativeRenderer || !termRef.current) return;
    if (!shouldAttachCanvasRenderer({ operationalRendererMode })) return;
    if (!isVisibleInLayout) return;

    if (!canvasAddonRef.current) {
      void tryReattachCanvasAddonRef.current?.();
      return;
    }

    if (!isActivePanel && isTerminalRendererReady(termRef.current)) {
      refreshTerminalViewport(termRef.current);
    }
  }, [isActivePanel, isVisibleInLayout, operationalRendererMode, shouldUseNativeRenderer]);

  // Shared-surface / split layouts: re-attach canvas when a panel becomes visible again.
  useEffect(() => {
    if (!isVisibleInLayout || shouldUseNativeRenderer || !termRef.current) return undefined;

    if (
      shouldMountCanvasAddon({
        operationalRendererMode,
        isActivePanel,
        isVisibleInLayout,
        visibleTerminalPanelCount,
      }) &&
      !canvasAddonRef.current
    ) {
      void tryReattachCanvasAddonRef.current?.();
    }

    const timer = window.setTimeout(() => {
      if (!isVisibleInLayoutRef.current || !termRef.current || isDisposingRef.current) return;

      const afterRendererReady = () => {
        if (!isVisibleInLayoutRef.current || !termRef.current || isDisposingRef.current) return;
        const canvasMode = shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        });
        // Avoid refreshing WebGL panels from the canvas recovery timeout; the WebGL
        // renderer is handled by its own recovery path and this refresh only adds
        // visible flicker during a plain workspace switch.
        if (canvasMode && isTerminalRendererReady(termRef.current)) {
          refreshTerminalViewport(termRef.current);
        }
        if (connectPendingUntilFitRef.current) {
          fitAndResize({ clearAtlas: true });
        }
      };

      if (
        shouldAttachCanvasRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        !canvasAddonRef.current
      ) {
        void tryReattachCanvasAddonRef.current?.().then(afterRendererReady);
        return;
      }

      afterRendererReady();
    }, 140);

    return () => window.clearTimeout(timer);
  }, [fitAndResize, isVisibleInLayout, operationalRendererMode, shouldUseNativeRenderer]);

  useEffect(() => {
    if (requestedRendererMode !== 'vte-experimental') return undefined;

    const settleTimers = [];
    let rafId = null;

    const clearScheduledSync = () => {
      settleTimers.forEach((timerId) => clearTimeout(timerId));
      settleTimers.length = 0;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const scheduleShowAndResize = () => {
      clearScheduledSync();
      const sync = () => {
        if (!isVisibleInLayout) return;
        if (suspendNativeSurface && nativeSurfacePolicy !== 'dock-side-by-side') return;
        showAndResizeNativeLease();
      };

      rafId = requestAnimationFrame(() => {
        rafId = null;
        sync();
      });

      [80, 180, 400].forEach((delayMs) => {
        settleTimers.push(
          setTimeout(() => {
            sync();
          }, delayMs)
        );
      });
    };

    const handleWorkspaceNativeSurfaceSync = (event) => {
      const detail = event.detail || {};
      const activePanelIds = new Set(
        Array.isArray(detail.activePanelIds) ? detail.activePanelIds.filter(Boolean) : []
      );
      const hiddenPanelIds = new Set(
        Array.isArray(detail.hiddenPanelIds) ? detail.hiddenPanelIds.filter(Boolean) : []
      );

      if (hiddenPanelIds.has(id)) {
        clearScheduledSync();
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
        }
        const delay = process.env.NODE_ENV === 'test' ? 0 : 100;
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          hideNativeLease(detail.reason || 'workspace-hidden');
        }, delay);
        return;
      }

      if (activePanelIds.has(id)) {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        scheduleShowAndResize();
      }
    };

    window.addEventListener('devhub:native-vte-workspace-sync', handleWorkspaceNativeSurfaceSync);

    return () => {
      clearScheduledSync();
      window.removeEventListener(
        'devhub:native-vte-workspace-sync',
        handleWorkspaceNativeSurfaceSync
      );
    };
  }, [
    hideNativeLease,
    id,
    isVisibleInLayout,
    nativeSurfacePolicy,
    requestedRendererMode,
    showAndResizeNativeLease,
    suspendNativeSurface,
  ]);

  useEffect(() => {
    if (requestedRendererMode !== 'vte-experimental' || isVisibleInLayout) return undefined;

    Promise.resolve(
      setNativeVtePanelVisibility({
        panelId: id,
        visible: false,
        reason: 'layout-hidden',
      })
    ).catch(handleNativeLeaseCommandError);

    return undefined;
  }, [handleNativeLeaseCommandError, id, isVisibleInLayout, requestedRendererMode]);

  // Re-show native VTE after layout becomes visible again (window switch, focus exit, etc.).
  useEffect(() => {
    if (requestedRendererMode !== 'vte-experimental' || !isVisibleInLayout) return undefined;
    if (suspendNativeSurface && nativeSurfacePolicy !== 'dock-side-by-side') return undefined;

    const shouldRestore =
      nativeLeaseRef.current ||
      nativeVteOpened ||
      hasHiddenNativeVteLease(id) ||
      readPanelSessionExit(id);
    if (!shouldRestore) return undefined;

    if (hasHiddenNativeVteLease(id)) {
      nativeLeaseRef.current = true;
      consumeHiddenNativeVteLease(id);
      setNativeVteOpened(true);
    }

    const timers = [0, 80, 180, 400, 800].map((delayMs) =>
      setTimeout(() => {
        if (!isVisibleInLayoutRef.current) return;
        showAndResizeNativeLease();
      }, delayMs)
    );

    return () => {
      timers.forEach((timerId) => clearTimeout(timerId));
    };
  }, [
    id,
    isVisibleInLayout,
    nativeSurfacePolicy,
    nativeVteOpened,
    requestedRendererMode,
    showAndResizeNativeLease,
    suspendNativeSurface,
  ]);

  useEffect(() => {
    if (!nativeVteOpened || suspendNativeSurface || !autoFocus || !isActivePanel) return undefined;

    Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(handleNativeLeaseCommandError);
    return undefined;
  }, [
    autoFocus,
    handleNativeLeaseCommandError,
    id,
    isActivePanel,
    nativeVteOpened,
    suspendNativeSurface,
  ]);

  useEffect(() => {
    if (!nativeVteOpened || !isVisibleInLayout) return undefined;
    // dock-side-by-side: VTE coexists with dock — still resize, just skip hide.
    if (suspendNativeSurface && nativeSurfacePolicy !== 'dock-side-by-side') return undefined;

    const sendNativeResize = () => {
      const bounds = getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current);
      if (!bounds) return;
      Promise.resolve(resizeNativeVtePanel({ panelId: id, bounds })).catch(
        handleNativeLeaseCommandError
      );
    };
    const clearNativeResizeSettleTimers = () => {
      nativeResizeSettleTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      nativeResizeSettleTimersRef.current = [];
    };
    const scheduleNativeResize = () => {
      if (nativeResizeRafRef.current) return;
      nativeResizeRafRef.current = requestAnimationFrame(() => {
        nativeResizeRafRef.current = null;
        sendNativeResize();
      });
    };
    const scheduleNativeResizeAfterLayoutSettles = () => {
      clearNativeResizeSettleTimers();
      scheduleNativeResize();
      nativeResizeSettleTimersRef.current = [80, 180].map((delayMs) =>
        setTimeout(() => {
          sendNativeResize();
        }, delayMs)
      );
    };

    sendNativeResize();
    scheduleNativeResizeAfterLayoutSettles();
    window.addEventListener('resize', sendNativeResize);
    const observedElement = containerRef.current || nativePlaceholderRef.current;
    if (typeof ResizeObserver !== 'undefined' && observedElement) {
      nativeResizeObserverRef.current?.disconnect();
      nativeResizeObserverRef.current = new ResizeObserver(() => {
        if (isDisposingRef.current) return;
        scheduleNativeResize();
      });
      nativeResizeObserverRef.current.observe(observedElement);
    }

    return () => {
      window.removeEventListener('resize', sendNativeResize);
      clearNativeResizeSettleTimers();
      nativeResizeObserverRef.current?.disconnect();
      nativeResizeObserverRef.current = null;
      if (nativeResizeRafRef.current) {
        cancelAnimationFrame(nativeResizeRafRef.current);
        nativeResizeRafRef.current = null;
      }
    };
  }, [
    handleNativeLeaseCommandError,
    id,
    isVisibleInLayout,
    nativeSurfacePolicy,
    nativeVteOpened,
    suspendNativeSurface,
  ]);

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

  useEffect(() => {
    if (!shouldUseNativeRenderer) return undefined;

    const handleNativeTerminalExit = (event) => {
      applyTerminalSessionExit(event.detail || {}, { emitBrowserEvent: false });
    };

    window.addEventListener('devhub:terminal-exit', handleNativeTerminalExit);
    return () => {
      window.removeEventListener('devhub:terminal-exit', handleNativeTerminalExit);
    };
  }, [applyTerminalSessionExit, shouldUseNativeRenderer]);

  useEffect(() => {
    if (!shouldUseNativeRenderer) return undefined;

    const handleNativeRuntimeEvent = (event) => {
      const detail = event.detail || {};
      if (detail.panelId !== id) return;
      if (detail.type === 'panel-activated') {
        onActivatePanel?.(id);
        return;
      }
      if (detail.type !== 'runtime-error') return;

      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      setNativeVteOpenFailure(detail.reason || 'open-failed');
      setConnectionState('error');
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
    };

    window.addEventListener('devhub:terminal-native-vte-event', handleNativeRuntimeEvent);
    return () => {
      window.removeEventListener('devhub:terminal-native-vte-event', handleNativeRuntimeEvent);
    };
  }, [clearNativeVteProbeRetryTimer, id, onActivatePanel, shouldUseNativeRenderer]);

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
    fitAndResize,
    scheduleInactiveViewportRepaint,
    syncTerminalViewportOnWorkspaceShow,
    scheduleWorkspaceShowRecovery,
    sendResize,
    reactivateTerminalViewport,
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

  const adjustFontSize = useCallback((delta) => {
    setFontSize((prev) => {
      const next = Math.min(24, Math.max(8, prev + delta));
      try {
        window.localStorage.setItem(FONT_SIZE_KEY, String(next));
        // Size fine-tuning stays local per panel (the A-/A+ buttons).
        // The base font family + weight + line/letter come from CSS vars (see getTerminalFontOptions).
      } catch {
        /* ignore */
      }
      if (termRef.current && !isDisposingRef.current) {
        termRef.current.options.fontSize = next;
        try {
          fitRef.current?.fit();
          // Keep WebGL atlas happy when metrics change.
          if (typeof termRef.current.clearTextureAtlas === 'function') {
            termRef.current.clearTextureAtlas();
          }
          termRef.current.refresh(0, termRef.current.rows - 1);
        } catch (err) {
          // Same teardown race as the ResizeObserver path: a font-size click
          // landing during dispose can hit the WebGL addon's stale renderer.
          if (!isStaleXtermRendererError(err)) throw err;
        }
      }
      return next;
    });
  }, []);

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

  useLayoutEffect(() => {
    const prevVisible = prevVisibleInLayoutRef.current;
    const nextVisible = isVisibleInLayout;

    // Snapshot the global layout-settled generation when this panel becomes hidden.
    // On reveal we compare it against the live generation to detect churn that
    // happened in other workspaces; those events carry panelIds of the active
    // workspace, so they never reach this hidden panel via the normal listener.
    if (!nextVisible && layoutHiddenGenerationRef.current === 0) {
      layoutHiddenGenerationRef.current = getTerminalLayoutSettledGeneration();
    }

    if (workspaceShowSyncTimerRef.current) {
      clearTimeout(workspaceShowSyncTimerRef.current);
      workspaceShowSyncTimerRef.current = null;
    }
    if (workspaceShowRecoverTimerRef.current) {
      clearTimeout(workspaceShowRecoverTimerRef.current);
      workspaceShowRecoverTimerRef.current = null;
    }

    // NOTE: we intentionally do NOT release WebGL/Canvas when the panel becomes
    // hidden. Workspaces are kept mounted with visibility:hidden, so the addon
    // must stay attached for instant reactivation. Real GPU disposal happens on
    // unmount via disposeXtermRuntime().

    if (shouldSyncTerminalViewportOnLayoutShow(prevVisible, nextVisible)) {
      restoreInitialCommandDispatchGuard();
      // Phase 6 terminal-engine-v2: skip legacy GPU survivor recovery on show.
      if (!usesLegacyTerminalSurvivorRecovery(isEngineV2Ref.current)) {
        if (termRef.current && containerRef.current && fitRef.current) {
          fitTerminalViewport({
            container: containerRef.current,
            fitAddon: fitRef.current,
            term: termRef.current,
            socket: wsRef.current,
            clearAtlas: false,
            lastPtySizeRef: lastPtySizeRef.current,
          });
        }
        needsViewportSyncOnShowRef.current = false;
        layoutChurnedWhileHiddenRef.current = false;
        layoutHiddenGenerationRef.current = 0;
      } else if (shouldUseNativeRenderer && nativeVteOpened) {
        void showAndResizeNativeLease();
      } else {
        const isWorkspaceTabReveal =
          isWorkspaceShellVisible && !prevWorkspaceShellVisibleRef.current;
        const softGpuEligible = shouldSoftGpuWorkspaceReveal({
          operationalRendererMode: operationalRendererModeRef.current,
          webglAddon: webglAddonRef.current,
          canvasAddon: canvasAddonRef.current,
          visibleTerminalPanelCount: visibleTerminalPanelCountRef.current,
          pendingWebglRecovery: pendingWebglRecoveryRef.current,
          webglReleasedOnLayoutHide: webglReleasedOnLayoutHideRef.current,
          canvasReleasedOnLayoutHide: canvasReleasedOnLayoutHideRef.current,
        });
        const revealMode = resolveWorkspaceLayoutShowRevealMode({
          isWorkspaceTabReveal,
          softGpuEligible,
          hiddenOutputCatchupPending: hiddenOutputCatchupPendingRef.current,
          tuiSessionActive: tuiSessionActiveRef.current,
        });

        // If layout churn happened while this panel was hidden, the GPU framebuffer
        // may be stale even though the addon is still attached. Skip the soft/no-op
        // paths and run a real fit + clear + repaint, with bounded retries.
        const hadLocalChurn = layoutChurnedWhileHiddenRef.current;
        const hiddenGeneration = layoutHiddenGenerationRef.current;
        const currentGeneration = getTerminalLayoutSettledGeneration();
        const hadGlobalChurn = hiddenGeneration > 0 && currentGeneration > hiddenGeneration;
        const hadLayoutChurn = hadLocalChurn || hadGlobalChurn;
        layoutChurnedWhileHiddenRef.current = false;
        layoutHiddenGenerationRef.current = 0;

        if (revealMode === 'soft' && !hadLayoutChurn) {
          needsViewportSyncOnShowRef.current = false;
          coalescedSoftGpuVisibilityReveal(
            termRef.current,
            hiddenOutputBufferRef.current,
            hiddenOutputCatchupPendingRef,
            { reason: 'workspace-show-soft-reveal' }
          );
          logViewportDiagnostic('workspace-show-visible-soft-gpu-reveal');
          if (!isWorkspaceTabReveal) {
            // Parked windows were visibility:hidden — one deferred refresh after the
            // shell becomes visible so WebGL composites the live bitmap (no clear()).
            requestAnimationFrame(() => {
              if (!isVisibleInLayoutRef.current || !termRef.current) return;
              coalescedSoftGpuVisibilityReveal(
                termRef.current,
                hiddenOutputBufferRef.current,
                hiddenOutputCatchupPendingRef,
                { reason: 'workspace-show-soft-reveal-deferred' }
              );
            });
          }
        } else {
          const rendererReadyNow = Boolean(
            termRef.current && isTerminalRendererReady(termRef.current)
          );
          if (!rendererReadyNow) {
            needsViewportSyncOnShowRef.current = true;
            scheduleBoundedGpuRecoverRef.current?.(48);
          }
          void (async () => {
            if (
              needsGpuRendererReattach({
                operationalRendererMode: operationalRendererModeRef.current,
                webglAddon: webglAddonRef.current,
                canvasAddon: canvasAddonRef.current,
              })
            ) {
              if (
                shouldAttachWebglRenderer({
                  operationalRendererMode: operationalRendererModeRef.current,
                })
              ) {
                await tryReattachWebglAddonRef.current?.({
                  clearAtlas: false,
                  skipFitWhenUnchanged: true,
                });
              } else if (
                shouldAttachCanvasRenderer({
                  operationalRendererMode: operationalRendererModeRef.current,
                })
              ) {
                await tryReattachCanvasAddonRef.current?.();
              }
            }
            const stillNeedsGpu = needsGpuRendererReattach({
              operationalRendererMode: operationalRendererModeRef.current,
              webglAddon: webglAddonRef.current,
              canvasAddon: canvasAddonRef.current,
            });
            if (stillNeedsGpu || !isTerminalRendererReady(termRef.current)) {
              needsViewportSyncOnShowRef.current = true;
              scheduleBoundedGpuRecoverRef.current?.(48);
            } else if (isVisibleInLayoutRef.current && termRef.current) {
              if (hadLayoutChurn) {
                // The GPU framebuffer may have been discarded while the panel was
                // opacity-hidden. For plain shells a real clear+repaint is safe.
                // For live TUIs (OpenCode/Grok/etc.) a clearAtlas wipes the canvas
                // and the TUI does not repaint until it receives SIGWINCH/input, so
                // we use a TUI-safe path: fit without PTY notify, refresh+force
                // repaint, then nudge the PTY with an unchanged-dimension SIGWINCH
                // to make the TUI redraw without altering its layout.
                if (tuiSessionActiveRef.current && containerRef.current && fitRef.current) {
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
                      reason: 'workspace-show-layout-churn-recover-tui',
                    });
                  }
                  nudgeTerminalPtyResize({
                    term: termRef.current,
                    socket: wsRef.current,
                    lastPtySizeRef: lastPtySizeRef.current,
                    force: true,
                  });
                  logViewportDiagnostic('workspace-show-layout-churn-recover-tui');
                } else {
                  void syncTerminalViewportOnWorkspaceShow('workspace-show-layout-churn-recover', {
                    clearAtlas: true,
                  });
                }
                scheduleBoundedGpuRecoverRef.current?.(24);
              } else {
                coalescedSoftGpuVisibilityReveal(
                  termRef.current,
                  hiddenOutputBufferRef.current,
                  hiddenOutputCatchupPendingRef,
                  { reason: 'workspace-show-soft-reveal-fallback' }
                );
              }
            }
            scheduleWorkspaceShowRecovery(
              hadLayoutChurn ? 'workspace-show-layout-churn-recover' : 'workspace-show-visible'
            );
          })();
        }
      }
    } else if (!isVisibleInLayout) {
      needsViewportSyncOnShowRef.current = true;
    } else if (isVisibleInLayout && needsViewportSyncOnShowRef.current) {
      syncTerminalViewportOnWorkspaceShow('workspace-show-pending', { clearAtlas: true });
    }

    prevVisibleInLayoutRef.current = isVisibleInLayout;
    prevWorkspaceShellVisibleRef.current = isWorkspaceShellVisible;

    return () => {
      if (workspaceShowSyncTimerRef.current) {
        clearTimeout(workspaceShowSyncTimerRef.current);
        workspaceShowSyncTimerRef.current = null;
      }
      if (workspaceShowRecoverTimerRef.current) {
        clearTimeout(workspaceShowRecoverTimerRef.current);
        workspaceShowRecoverTimerRef.current = null;
      }
      workspaceShowZeroSizeObserverRef.current?.disconnect();
      workspaceShowZeroSizeObserverRef.current = null;
    };
  }, [
    coalescedForceRepaint,
    coalescedSoftGpuVisibilityReveal,
    fitTerminalViewport,
    isVisibleInLayout,
    isWorkspaceShellVisible,
    logViewportDiagnostic,
    nativeVteOpened,
    operationalRendererMode,
    releaseCanvasAddon,
    releaseWebglAddonForInactivePanel,
    restoreInitialCommandDispatchGuard,
    scheduleWorkspaceShowRecovery,
    shouldUseNativeRenderer,
    showAndResizeNativeLease,
    syncTerminalViewportOnWorkspaceShow,
  ]);

  useEffect(() => {
    if (!usesLegacyTerminalSurvivorRecovery(isEngineV2)) {
      return undefined;
    }

    const handleSurvivorRecover = (event) => {
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
  }, [
    id,
    coalescedForceRepaint,
    disposeWebglAddonForContextLoss,
    fitTerminalViewport,
    initialCommand,
    isEngineV2,
    isKimiTuiLive,
    logViewportDiagnostic,
    nudgeTerminalPtyResize,
    refreshTerminalViewport,
    releaseCanvasAddon,
    releaseWebglAddonForInactivePanel,
    scheduleWorkspaceShowRecovery,
    stabilizeTerminalRenderer,
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

  useEffect(() => {
    const handleSearch = (event) => {
      const detail = event.detail || {};
      const targetId = detail.targetId;
      const query = detail.query;
      const direction = detail.direction || 'next';

      if (!targetId || targetId !== id || !query || !searchRef.current) return;

      if (direction === 'prev') {
        searchRef.current.findPrevious(query, { caseSensitive: false, incremental: true });
        return;
      }

      searchRef.current.findNext(query, { caseSensitive: false, incremental: true });
    };

    window.addEventListener('devhub:terminal-search', handleSearch);
    return () => window.removeEventListener('devhub:terminal-search', handleSearch);
  }, [id]);

  useEffect(() => {
    const handleZedInput = (event) => {
      const detail = event?.detail;
      const target = detail?.terminalId || detail?.session_id || detail?.panelId;
      if (!detail || target !== id) return;
      sendTerminalPasteInput({
        socket: wsRef.current,
        transport: transportRef.current,
        text: detail.input,
      });
    };
    window.addEventListener('devhub:zed-terminal-input', handleZedInput);
    return () => window.removeEventListener('devhub:zed-terminal-input', handleZedInput);
  }, [id]);

  useEffect(() => {
    reactivateTerminalViewportRef.current = reactivateTerminalViewport;
  }, [reactivateTerminalViewport]);

  useEffect(() => {
    tryReattachWebglAddonRef.current = tryReattachWebglAddon;
  }, [tryReattachWebglAddon]);

  useEffect(() => {
    tryReattachCanvasAddonRef.current = tryReattachCanvasAddon;
  }, [tryReattachCanvasAddon]);

  // Recover viewport/WebGL only when this panel becomes active (false→true edge).
  useLayoutEffect(() => {
    const becameActive = shouldRecoverPanelOnActivation(
      prevIsActivePanelRef.current,
      isActivePanel
    );
    prevIsActivePanelRef.current = isActivePanel;

    if (!becameActive || shouldUseNativeRenderer) return;
    const term = termRef.current;
    if (!term) return;

    const hadGpuRenderer = Boolean(webglAddonRef.current || canvasAddonRef.current);
    const canUseWebgl = shouldAttachWebglRenderer({ operationalRendererMode });
    const canUseCanvas = shouldAttachCanvasRenderer({ operationalRendererMode });
    const clearAtlas =
      (canUseWebgl || canUseCanvas) && shouldClearWebglAtlasOnPanelActivation(hadGpuRenderer);

    if (
      shouldSkipReactivateViewportOnPanelActivation({
        hadGpuRenderer,
        clearAtlas,
        term,
        container: containerRef.current,
        fitAddon: fitRef.current,
      })
    ) {
      prepareActiveTuiTerminalFocus(term, {
        tuiSessionActive: tuiSessionActiveRef.current,
      });
      if (autoFocus) {
        term.focus?.();
      }
      return;
    }

    logRenderHealth('panel-activated-recover');
    if (canUseWebgl) {
      void tryReattachWebglAddonRef.current?.();
    } else if (canUseCanvas) {
      void tryReattachCanvasAddonRef.current?.();
    }
    reactivateTerminalViewportRef.current?.({
      clearAtlas,
    });

    if (hiddenOutputCatchupPendingRef.current && termRef.current) {
      void syncTerminalViewportOnWorkspaceShow('panel-activated-catchup', { clearAtlas: true });
    }

    if (!autoFocus) return;
    prepareActiveTuiTerminalFocus(term, {
      tuiSessionActive: tuiSessionActiveRef.current,
    });
    term.focus?.();
  }, [
    autoFocus,
    isActivePanel,
    logRenderHealth,
    operationalRendererMode,
    shouldUseNativeRenderer,
    syncTerminalViewportOnWorkspaceShow,
  ]);

  // Auto-reconnect when disconnected or error, with exponential backoff.
  // No hard attempt limit — the EBADF server fix prevents infinite hammering.
  // Backoff: 300ms → 600ms → 1200ms → 2400ms → 5000ms (max), then stays at 5s.
  const reconnectAttemptsRef = useRef(0);
  // Track autoFocus changes to reset the counter when the user switches to this tab.
  const prevAutoFocusRef = useRef(autoFocus);
  useEffect(() => {
    if (autoFocus && !prevAutoFocusRef.current) {
      // User actively switched to this terminal — give it a fresh reconnect budget.
      reconnectAttemptsRef.current = 0;
    }
    prevAutoFocusRef.current = autoFocus;
  }, [autoFocus]);

  useEffect(() => {
    if (sessionClosingRef.current) return undefined;

    if (shouldAutoReconnectTerminal(connectionState, autoFocus, initError)) {
      if (!autoFocus) {
        cliLog(`CLIENT:${id}`, 'auto-reconnect SKIPPED (not autoFocus)', { connectionState });
        return;
      }
      const delay = Math.min(300 * 2 ** reconnectAttemptsRef.current, 5000);
      cliLog(`CLIENT:${id}`, 'auto-reconnect scheduled', {
        connectionState,
        attempt: reconnectAttemptsRef.current,
        delayMs: delay,
      });
      logTerminalSession('terminal-auto-reconnect-scheduled', {
        panelId: id,
        connectionState,
        attempt: reconnectAttemptsRef.current,
        delayMs: delay,
      });
      const timer = setTimeout(() => {
        reconnectAttemptsRef.current += 1;
        reconnect();
      }, delay);
      return () => clearTimeout(timer);
    }
    // Reset counter on stable connection — next disconnect starts from 300ms again.
    if (connectionState === 'connected') {
      cliLog(`CLIENT:${id}`, 'connected — resetting reconnect counter');
      reconnectAttemptsRef.current = 0;
    }
  }, [autoFocus, connectionState, initError, reconnect]);

  useEffect(() => {
    const restoreNativeSurfaceAfterAppResume = () => {
      if (requestedRendererModeRef.current !== 'vte-experimental') return;
      if (!isVisibleInLayoutRef.current) return;
      if (nativeLeaseRef.current) {
        showAndResizeNativeLease();
      }
      queueNativeVteProbeRetry(0);
    };

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;

      restoreNativeSurfaceAfterAppResume();

      if (!isVisibleInLayout) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }

      // Treat OS window restore the same as a workspace shell reveal: run the full
      // viewport sync pipeline so WebGL/Canvas reattach and the forced repaint happen.
      if (
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        isWebglAddonContextLost(webglAddonRef.current)
      ) {
        logViewportDiagnostic('visibility-webgl-context-lost');
        disposeWebglAddonForContextLoss('visibility-webgl-context-lost');
      }

      if (
        shouldRunTerminalViewportReactivation({
          isActivePanel,
          isVisibleInLayout,
          documentVisibilityState: document.visibilityState,
        })
      ) {
        logViewportDiagnostic('visibility-visible');
        void syncTerminalViewportOnWorkspaceShowRef
          .current?.('visibility-visible', { clearAtlas: true, forceScroll: false })
          .then(() => {
            if (isDisposingRef.current || !termRef.current) return;
            prepareActiveTuiTerminalFocus(termRef.current, {
              tuiSessionActive: tuiSessionActiveRef.current,
            });
            if (autoFocus) {
              termRef.current?.focus?.();
            }
          });
      } else {
        // Inactive split siblings don't get reactivate — repaint them too so they don't
        // stay garbled after OS window restore (Bug A).
        scheduleInactiveViewportRepaint();
      }
    };

    const handleWindowResize = () => {
      if (!isVisibleInLayoutRef.current) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }
      logViewportDiagnostic('window-resize');
      if (isActivePanel) {
        sendResize();
      } else {
        fitAndResize({ clearAtlas: false });
      }
      queueNativeVteProbeRetry();
    };
    const handleWindowFocus = () => {
      restoreNativeSurfaceAfterAppResume();

      if (!isVisibleInLayout) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }

      if (
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        isWebglAddonContextLost(webglAddonRef.current)
      ) {
        logViewportDiagnostic('window-focus-webgl-context-lost');
        disposeWebglAddonForContextLoss('window-focus-webgl-context-lost');
      }

      if (shouldRunTerminalViewportReactivation({ isActivePanel, isVisibleInLayout })) {
        logViewportDiagnostic('window-focus');
        void syncTerminalViewportOnWorkspaceShowRef
          .current?.('window-focus', { clearAtlas: true, forceScroll: false })
          .then(() => {
            if (isDisposingRef.current || !termRef.current) return;
            prepareActiveTuiTerminalFocus(termRef.current, {
              tuiSessionActive: tuiSessionActiveRef.current,
            });
            if (autoFocus) {
              termRef.current?.focus?.();
            }
          });
      } else {
        scheduleInactiveViewportRepaint();
      }
    };
    const handlePageShow = () => {
      restoreNativeSurfaceAfterAppResume();

      if (!isVisibleInLayout) {
        needsViewportSyncOnShowRef.current = true;
        return;
      }

      if (
        shouldAttachWebglRenderer({
          operationalRendererMode: operationalRendererModeRef.current,
        }) &&
        isWebglAddonContextLost(webglAddonRef.current)
      ) {
        logViewportDiagnostic('pageshow-webgl-context-lost');
        disposeWebglAddonForContextLoss('pageshow-webgl-context-lost');
      }

      if (shouldRunTerminalViewportReactivation({ isActivePanel, isVisibleInLayout })) {
        logViewportDiagnostic('pageshow');
        void syncTerminalViewportOnWorkspaceShowRef
          .current?.('pageshow', { clearAtlas: true, forceScroll: false })
          .then(() => {
            if (isDisposingRef.current || !termRef.current) return;
            prepareActiveTuiTerminalFocus(termRef.current, {
              tuiSessionActive: tuiSessionActiveRef.current,
            });
            if (autoFocus) {
              termRef.current?.focus?.();
            }
          });
      } else {
        scheduleInactiveViewportRepaint();
      }
    };

    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (reactivateCoalesceTimerRef.current) {
        clearTimeout(reactivateCoalesceTimerRef.current);
        reactivateCoalesceTimerRef.current = null;
      }
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    isActivePanel,
    isVisibleInLayout,
    id,
    autoFocus,
    coalescedSoftGpuVisibilityReveal,
    logViewportDiagnostic,
    queueNativeVteProbeRetry,
    fitAndResize,
    scheduleInactiveViewportRepaint,
    sendResize,
    showAndResizeNativeLease,
    disposeWebglAddonForContextLoss,
  ]);

  const layoutSettleBurstCleanupRef = useRef(null);

  useEffect(() => {
    const handleLayoutSettled = (event) => {
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
  }, [
    id,
    initialCommand,
    sendInitialCommandIfReady,
    disposeWebglAddonForContextLoss,
    fitTerminalViewport,
    forceTerminalViewportRepaint,
    initialCommand,
    isKimiTuiLive,
    logViewportDiagnostic,
    maybeConnectAfterViewportFit,
    nudgeTerminalPtyResize,
    refreshTerminalViewport,
    scheduleBoundedForceRepaint,
    scheduleBoundedFitRepaint,
    scheduleBoundedGpuRecover,
    scheduleWorkspaceShowRecovery,
    scrollTerminalToBottom,
    sendInitialCommandIfReady,
    stabilizeTerminalRenderer,
    syncTerminalViewportOnWorkspaceShow,
  ]);

  // --- Scroll fix: preserve/restore scroll position when panel visibility changes ---
  useEffect(() => {
    if (!termRef.current) return;
    // Kimi behaves like a normal scrolling terminal (xterm viewportY moves with the
    // buffer), so it goes through the same save/restore path as shells — preserving the
    // scroll position across panel/workspace switches instead of jumping.
    if (isVisibleInLayout) {
      const saved = lastViewportYRef.current;
      if (saved != null) {
        restoreTerminalViewportScroll(termRef.current, saved);
      } else if (isActivePanel) {
        scrollTerminalToBottom(true);
      }
    } else {
      lastViewportYRef.current = getTerminalViewportScrollOffset(termRef.current);
    }
  }, [initialCommand, isVisibleInLayout, isActivePanel, scrollTerminalToBottom]);

  const handleViewportMouseDown = useCallback(
    (event) => {
      if (shouldUseNativeRenderer) {
        onActivatePanel?.(id);
        if (nativeVteOpened) {
          Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(
            handleNativeLeaseCommandError
          );
        }
        return;
      }

      const term = termRef.current;
      const shell = viewportShellRef.current;
      const cell =
        event && shell && term
          ? resolveTerminalCellFromPointer(term, shell, event.clientX, event.clientY)
          : null;
      const grokSession = isGrokSessionRef.current || isGrokTuiInitialCommand(initialCommand);
      const isKimiSession = kimiReadyNotifiedRef.current || isKimiLaunchCommand(initialCommand);
      const inputZoneRows = resolveTerminalWheelInputZoneRows({
        isGrokSession: grokSession,
        isKimiSession,
      });
      const inTranscript = cell
        ? isTerminalTranscriptCell(cell.row, term.rows, inputZoneRows)
        : lastPointerZoneRef.current !== 'input';

      if (inTranscript) {
        lastPointerZoneRef.current = 'transcript';
      } else {
        lastPointerZoneRef.current = 'input';
      }

      // Activation is handled by the parent panel shell (onMouseDown bubbles up).
      prepareActiveTuiTerminalFocus(term, {
        tuiSessionActive: tuiSessionActiveRef.current,
      });
      term?.focus?.();

      const tuiReady = grokSession
        ? grokTuiReadyRef.current === true
        : tuiSessionFooterConfirmedRef.current === true;
      const tuiActive = tuiSessionActiveRef.current || grokSession;
      if (inTranscript && cell && tuiActive && tuiReady && isVisibleInLayoutRef.current === true) {
        const payload = buildTerminalMousePressSequence(cell.col, cell.row);
        sendTerminalPasteInput({
          socket: wsRef.current,
          transport: transportRef.current,
          text: payload,
        });
      }
    },
    [
      handleNativeLeaseCommandError,
      id,
      initialCommand,
      nativeVteOpened,
      onActivatePanel,
      shouldUseNativeRenderer,
    ]
  );

  const isConnected = connectionState === 'connected';
  const showTerminalViewport =
    shouldShowTerminalViewport(isInitializing, initError) && !shouldUseNativeRenderer;
  const showTerminalLoadingOverlay = shouldShowTerminalLoadingOverlay(
    isInitializing,
    connectionState,
    hasConnectedOnce
  );
  const showTerminalStatusOverlay = shouldShowTerminalStatusOverlay(
    isInitializing,
    initError,
    connectionState
  );
  const exitOverlayCopy = buildTerminalExitOverlayCopy({
    initialCommand,
    reason: sessionExitReason,
    initError,
    connectionState,
  });

  const handleSessionRecoveryClick = useCallback(() => {
    if (connectionState === 'agent-exited' || isAgentTuiCommand(initialCommand)) {
      clearPanelSessionExit(id);
      setSessionExitReason(null);
      processExitedRef.current = false;
      window.dispatchEvent(
        new CustomEvent('devhub:manual-revive-requested', {
          detail: { panelId: id, sessionId: extractOpenCodeSessionId(initialCommand) || id },
        })
      );
      return;
    }
    reconnect();
  }, [connectionState, id, initialCommand, reconnect]);

  const statusLabel = isConnected
    ? 'Conectado'
    : connectionState === 'suspended'
      ? 'Suspendida'
      : connectionState === 'agent-exited'
        ? 'Agente finalizado'
        : connectionState === 'connecting'
          ? 'Conectando...'
          : connectionState === 'terminated'
            ? 'Finalizada'
            : 'Desconectado';

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
