'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardPaste, Copy, Loader2, RotateCcw, Wifi, WifiOff, X } from 'lucide-react';
import { getTerminalTheme } from '@/components/terminal/TerminalThemeSync';
import {
  getTerminalAppShellStyle,
  getTerminalFloatingControlStyle,
  getTerminalTitleBarStyle,
  getTerminalViewportFrameStyle,
} from '@/components/terminal/terminalChromeStyles';
import {
  closeNativeVtePanel,
  focusNativeVtePanel,
  isNativeVteRuntimeAvailable,
  openNativeVtePanel,
  pasteNativeVtePanel,
  probeNativeVte,
  resizeNativeVtePanel,
  setNativeVtePanelVisibility,
  getCachedNativeVteProbeResult,
  subscribeNativeVteEvents,
} from '@/lib/terminal/nativeVteBridge';
import {
  NATIVE_SURFACE_SETTLE_DELAYS_MS,
  scheduleNativeSurfaceActivation,
  computeCarvedBounds,
} from '@/components/terminal/nativeLayoutSync';
import {
  getTerminalRendererFallbackCopy,
  getTerminalRendererOptionLabel,
  getTerminalRendererRuntimeCapabilities,
  resolveRendererSelection,
} from '@/components/terminal/terminalRendererCapabilities';
// Phase 4 of pizarra-shared-view-state: when mounted inside a
// <SharedSurfacesProvider>, register this TerminalTTY as the
// singleton for `surfaceId`. The WebSocket / VTE lease are
// preserved across React re-mounts (e.g. when the user toggles
// workspace ↔ pizarra mode). The provider's onSurfaceDestroy
// is the only path that closes the WS and disposes XTerm.
// The import is wrapped in a try so SSR / non-React environments
// without the workspace chunk don't break the existing module.
import { useSurfaceRegistry } from '@/components/workspace/SharedSurfacesProvider';
import { extractOpenCodeSessionId } from '@/lib/terminal/restorePolicyResolver';

/** One initial-command inject per panel (survives React Strict Mode remount). */
const nativeInitialCommandInjected = new Set();

/**
 * Fire-and-forget logger → POST to /api/terminal/log (writes to data/logs/terminal-debug.log).
 * Never awaited — diagnostic only, does not affect control flow.
 */
function cliLog(tag, msg, extra = {}) {
  try {
    fetch('/api/terminal/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag, msg, extra }),
    }).catch(() => {});
  } catch {
    // never crash
  }
}

/**
 * Pure function: returns Framer Motion animation props for the xterm container.
 * Fades in (opacity 0→1, 150ms ease-out) when the terminal viewport should be visible.
 *
 * @param {boolean} visible - whether the terminal viewport should be visible
 * @returns {{ initial, animate, transition }} Framer Motion props
 */
export function getXtermContainerAnimProps(visible) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: visible ? 1 : 0 },
    transition: { duration: 0.15, ease: 'easeOut' },
  };
}

const DEFAULT_TERMINAL_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

export function resolveTerminalFontFamily() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return DEFAULT_TERMINAL_FONT_FAMILY;
  }

  const cssMonoStack = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--font-family-mono')
    .replace(/\s+/g, ' ')
    .trim();

  return cssMonoStack || DEFAULT_TERMINAL_FONT_FAMILY;
}

export function shouldShowTerminalViewport(isInitializing, initError) {
  return !isInitializing && !initError;
}

export function shouldShowTerminalStatusOverlay(isInitializing, initError, connectionState) {
  if (connectionState === 'suspended') return true;
  if (isInitializing) return false;

  return Boolean(
    initError ||
    connectionState === 'error' ||
    connectionState === 'disconnected' ||
    connectionState === 'terminated'
  );
}

export function refreshTerminalViewport(term) {
  if (
    !term ||
    typeof term.refresh !== 'function' ||
    !Number.isInteger(term.rows) ||
    term.rows <= 0
  ) {
    return false;
  }

  term.refresh(0, term.rows - 1);
  return true;
}

export function stabilizeTerminalRenderer(term) {
  if (!term) return false;

  if (typeof term.clearTextureAtlas === 'function') {
    term.clearTextureAtlas();
  }

  return refreshTerminalViewport(term);
}

export function isTerminalViewportNearBottom(term, threshold = 2) {
  const activeBuffer = term?.buffer?.active;
  const baseY = activeBuffer?.baseY;
  const viewportY = activeBuffer?.viewportY ?? activeBuffer?.ydisp;

  if (!Number.isInteger(baseY) || !Number.isInteger(viewportY)) {
    return false;
  }

  return baseY - viewportY <= threshold;
}

export function getTerminalViewportScrollOffset(term) {
  const activeBuffer = term?.buffer?.active;
  const viewportY = activeBuffer?.viewportY ?? activeBuffer?.ydisp;
  return Number.isInteger(viewportY) ? viewportY : null;
}

export function restoreTerminalViewportScroll(term, targetViewportY) {
  if (!term || typeof term.scrollToLine !== 'function') return false;
  if (!Number.isInteger(targetViewportY)) return false;

  const buffer = term?.buffer?.active;
  if (!buffer) return false;

  // After resize/reflow the buffer line count can change.
  // Clamp to valid range so scrollToLine does not silently default to top.
  const totalLines = buffer.length;
  const rows = term.rows;
  let clampedY = targetViewportY;
  if (
    typeof totalLines === 'number' &&
    typeof rows === 'number' &&
    !Number.isNaN(totalLines) &&
    !Number.isNaN(rows)
  ) {
    const maxY = Math.max(0, totalLines - rows);
    clampedY = Math.max(0, Math.min(targetViewportY, maxY));
  }

  try {
    term.scrollToLine(clampedY);
    return true;
  } catch {
    return false;
  }
}

export function shouldRunTerminalViewportReactivation({
  isActivePanel,
  isVisibleInLayout = true,
  documentVisibilityState,
} = {}) {
  return Boolean(isActivePanel && isVisibleInLayout && documentVisibilityState !== 'hidden');
}

export function isTerminalRendererReady(term) {
  if (!term) return false;

  if (term._core?._isDisposed) return false;
  if (term.element && !term.element.isConnected) return false;

  const rendererSlot = term._core?._renderService?._renderer;
  if (rendererSlot && !rendererSlot.value) return false;

  return true;
}

function isStaleXtermRendererError(error) {
  const message = String(error?.message || error || '');
  return (
    message.includes('_renderer') ||
    message.includes('dimensions') ||
    message.includes('RenderService')
  );
}

export function fitTerminalViewport({
  container,
  fitAddon,
  term,
  socket,
  websocketOpenState = WebSocket.OPEN,
  getRect,
}) {
  if (!container || !fitAddon || !term) return false;
  if (!isTerminalRendererReady(term)) return false;

  const rect = getRect ? getRect() : container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  try {
    fitAddon.fit();
  } catch (error) {
    if (isStaleXtermRendererError(error)) return false;
    throw error;
  }

  stabilizeTerminalRenderer(term);

  if (socket?.readyState === websocketOpenState) {
    socket.send(
      JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows,
      })
    );
  }

  return true;
}

export function buildTerminalViewportDiagnosticPayload({
  reason,
  containerRect,
  term,
  documentVisibilityState,
  connectionState,
  transport,
  devicePixelRatio,
  requestedRendererMode,
  effectiveRendererMode,
}) {
  const width = Number(containerRect?.width ?? 0);
  const height = Number(containerRect?.height ?? 0);

  return {
    reason,
    width,
    height,
    cols: Number(term?.cols ?? 0),
    rows: Number(term?.rows ?? 0),
    visibility: documentVisibilityState || 'unknown',
    connectionState: connectionState || 'unknown',
    transport: transport || 'unknown',
    dpr: Number(devicePixelRatio ?? 1),
    zeroSized: width <= 0 || height <= 0,
    requestedRendererMode: requestedRendererMode || 'xterm',
    effectiveRendererMode: effectiveRendererMode || 'xterm',
  };
}

export function shouldLogTerminalViewportDiagnostic(previousSnapshot, nextSnapshot) {
  if (!nextSnapshot) return false;
  if (!previousSnapshot) return true;

  return JSON.stringify(previousSnapshot) !== JSON.stringify(nextSnapshot);
}

export function createTerminalViewportDiagnosticLogger({
  id,
  cliLog: logFn,
  lastSnapshotRef,
  getSnapshot,
}) {
  return (reason) => {
    const snapshot = getSnapshot(reason);

    if (!shouldLogTerminalViewportDiagnostic(lastSnapshotRef.current, snapshot)) {
      return;
    }

    lastSnapshotRef.current = snapshot;
    logFn(`CLIENT:${id}`, 'viewport diagnostic', snapshot);
  };
}

export function resolveTerminalConnectionCloseState(previousState, didReceiveProcessExit) {
  if (didReceiveProcessExit || previousState === 'terminated') {
    return 'terminated';
  }

  return previousState === 'error' ? 'error' : 'disconnected';
}

export function shouldAutoReconnectTerminal(connectionState, autoFocus) {
  if (!autoFocus) return false;
  return connectionState === 'disconnected' || connectionState === 'error';
}

function getClipboardApi() {
  return globalThis?.navigator?.clipboard || null;
}

export function resolveTerminalClipboardShortcut(event) {
  if (!event || event.altKey) return null;

  const key = String(event.key || '');
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;

  if (event.ctrlKey) {
    // Linux terminal semantics:
    // Ctrl+Shift+C → copy
    if (event.shiftKey && normalizedKey === 'c') return 'copy';
    // Ctrl+Shift+V → paste
    if (event.shiftKey && normalizedKey === 'v') return 'paste';
  }

  if (!event.ctrlKey && event.shiftKey && normalizedKey === 'Insert') {
    return 'paste';
  }

  return null;
}

export function getTerminalRuntimePlatform(explicitPlatform) {
  if (explicitPlatform) return String(explicitPlatform).toLowerCase();
  if (typeof navigator !== 'undefined') {
    return String(
      navigator.userAgentData?.platform || navigator.platform || 'unknown'
    ).toLowerCase();
  }
  return 'unknown';
}

export function getNativeTerminalBounds(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) return null;

  const width = Number(rect.width || 0);
  const height = Number(rect.height || 0);

  if (width <= 0 || height <= 0) return null;

  const browserWindow = typeof window !== 'undefined' ? window : null;
  if (browserWindow) {
    const viewportWidth = Number(browserWindow.innerWidth || 0);
    const viewportHeight = Number(browserWindow.innerHeight || 0);
    const left = Number(rect.left || 0);
    const top = Number(rect.top || 0);
    const right = Number(rect.right ?? left + width);
    const bottom = Number(rect.bottom ?? top + height);

    if (
      (viewportWidth > 0 && (right <= 0 || left >= viewportWidth)) ||
      (viewportHeight > 0 && (bottom <= 0 || top >= viewportHeight))
    ) {
      return null;
    }
  }

  return {
    x: Number(rect.left || 0),
    y: Number(rect.top || 0),
    width,
    height,
  };
}

export function shouldOpenNativeVtePanel({
  isActivePanel,
  isVisibleInLayout = true,
  suspendNativeSurface = false,
  connectionSuspended = false,
  nativeVteOpenFailure,
  nativeVteProbe,
  requestedRendererMode,
  runtimePlatform,
  tauriAvailable,
} = {}) {
  return Boolean(
    isVisibleInLayout &&
    !suspendNativeSurface &&
    !connectionSuspended &&
    requestedRendererMode === 'vte-experimental' &&
    tauriAvailable &&
    getTerminalRuntimePlatform(runtimePlatform).includes('linux') &&
    nativeVteProbe?.ready &&
    !nativeVteOpenFailure
  );
}

export function resolveTerminalRuntimePhase({
  isActivePanel,
  isVisibleInLayout = true,
  suspendNativeSurface = false,
  nativeSurfacePolicy = 'live',
  nativeVteOpenFailure,
  nativeVteOpened,
  nativeVteProbe,
  requestedRendererMode,
  runtimePlatform,
  tauriAvailable,
} = {}) {
  const nativeCandidate = Boolean(
    requestedRendererMode === 'vte-experimental' &&
    tauriAvailable &&
    getTerminalRuntimePlatform(runtimePlatform).includes('linux')
  );

  if (!nativeCandidate) return 'xterm';
  if (!isVisibleInLayout) return nativeVteOpened ? 'native-hidden' : 'xterm';
  if (suspendNativeSurface) return nativeVteOpened ? 'native-suspended' : 'xterm';
  if (!isActivePanel)
    return nativeVteOpened ? 'native-idle' : nativeVteProbe?.ready ? 'native-opening' : 'xterm';
  if (nativeVteOpened) return 'native-opened';
  if (nativeVteOpenFailure) return 'fallback-xterm';
  if (nativeVteProbe?.ready) return 'native-opening';
  if (!nativeVteProbe) return 'native-probing';
  return 'fallback-xterm';
}

export function shouldBootXtermRuntime(input = {}) {
  const runtimePhase = resolveTerminalRuntimePhase(input);
  return runtimePhase === 'xterm' || runtimePhase === 'fallback-xterm';
}

export function resolveTerminalRendererViewModel({
  requestedRendererMode,
  rendererCapabilities,
  nativeVteReady = false,
} = {}) {
  const selection = resolveRendererSelection({
    requestedMode: requestedRendererMode || 'xterm',
    capabilities: rendererCapabilities,
  });

  if (requestedRendererMode === 'vte-experimental' && nativeVteReady) {
    return {
      ...selection,
      effectiveMode: 'vte-experimental',
      didFallback: false,
      fallbackReason: null,
      capability: rendererCapabilities?.['vte-experimental'] || selection.capability,
      requestedLabel: getTerminalRendererOptionLabel(selection.requestedMode),
      effectiveLabel: getTerminalRendererOptionLabel('vte-experimental'),
      showRecoveryBanner: false,
    };
  }

  return {
    ...selection,
    requestedLabel: getTerminalRendererOptionLabel(selection.requestedMode),
    effectiveLabel: getTerminalRendererOptionLabel(selection.effectiveMode),
    showRecoveryBanner: false,
  };
}

export function getTerminalRendererStatusCopy(rendererViewModel) {
  return getTerminalRendererFallbackCopy(rendererViewModel);
}

export function getTerminalRendererRecoveryActionLabel() {
  return 'Volver a xterm';
}

export function shouldReinitializeTerminalForRenderer(previousEffectiveMode, nextEffectiveMode) {
  // TERM-02 cares about runtime churn only when the live renderer changes.
  // Requested-mode flips that still resolve to xterm must stay on the same imperative instance.
  return previousEffectiveMode !== nextEffectiveMode;
}

export const TERMINAL_VIEWPORT_SHELL_STYLE = Object.freeze({
  isolation: 'isolate',
});

export const TERMINAL_NATIVE_CONTENT_BODY_STYLE = Object.freeze({
  isolation: 'isolate',
});

const MAX_NATIVE_VTE_PROBE_RETRIES = 4;

export default function TerminalTTY({
  id,
  surfaceId: explicitSurfaceId,
  onClose,
  onActivatePanel,
  cwd,
  autoFocus,
  hideTitleBar,
  initialCommand,
  restored,
  requestedRendererMode = 'vte-experimental',
  onResetRendererToXterm,
  isActivePanel = autoFocus,
  isVisibleInLayout = true,
  suspendNativeSurface = false,
  nativeSurfacePolicy = 'live',
  runtimePlatform,
  showQuickCopyButton = true,
  swarmContext = null,
  connectionState: externalConnectionState,
  externalDimensionSource,
  // Phase 4 (pizarra-shared-view-state): explicit escape
  // valves. By default the surface is registered with the
  // SharedSurfacesProvider (when present) and kept alive on
  // unmount. Set `disposeOnUnmount` to true to opt out of
  // keepAlive and dispose the WS / XTerm when this React
  // instance unmounts. Useful for tests and the standalone
  // TWM panel mode (which doesn't have a provider).
  disposeOnUnmount = false,
  // Parent can listen for the destroy callback (e.g. to
  // remove the surface from the SharedSurfaceRegistry).
  onSurfaceDestroy: onSurfaceDestroyCallback,
}) {
  // Phase 4: surfaceId defaults to `id` so existing callers
  // that already pass a stable `id` get singleton semantics
  // for free when mounted inside a provider.
  const surfaceId = explicitSurfaceId || id;
  // Access the surface registry leniently: when this component
  // is mounted OUTSIDE a SharedSurfacesProvider (the legacy
  // TWM path), registry is null and the component falls back
  // to its original unmount-disposes behavior. Legacy behavior
  // is critical for the existing test infrastructure.
  const surfaceRegistry = useSurfaceRegistry();

  const terminalRootRef = useRef(null);
  const containerRef = useRef(null);
  const nativePlaceholderRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const nativeResizeObserverRef = useRef(null);
  const nativeResizeRafRef = useRef(null);
  const nativeResizeSettleTimersRef = useRef([]);
  const wsRef = useRef(null);
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
  // Phase 4 (pizarra-shared-view-state): when this instance is
  // mounted inside a <SharedSurfacesProvider>, we mark the
  // surface as "kept alive" by default. `destroyedRef` becomes
  // true only after an explicit destroy (X button, kill
  // session) — at which point WS / XTerm are disposed.
  const destroyedRef = useRef(false);
  const surfaceRegisteredRef = useRef(false);

  const FONT_SIZE_KEY = 'devhub:terminalFontSize';
  const [fontSize, setFontSize] = useState(() => {
    try {
      const stored = typeof window !== 'undefined' && window.localStorage.getItem(FONT_SIZE_KEY);
      const parsed = stored ? parseInt(stored, 10) : NaN;
      return Number.isFinite(parsed) && parsed >= 8 && parsed <= 24 ? parsed : 13;
    } catch {
      return 13;
    }
  });

  const [isInitializing, setIsInitializing] = useState(
    () => requestedRendererMode !== 'vte-experimental' || !getCachedNativeVteProbeResult()?.ready
  );
  const [initError, setInitError] = useState(null);
  const [internalConnectionState, setInternalConnectionState] = useState('idle');
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [restoredToast, setRestoredToast] = useState(false);
  const [nativeVteProbeResult, setNativeVteProbeResult] = useState(null);
  const [nativeVteOpenFailure, setNativeVteOpenFailure] = useState(null);
  const [nativeVteOpened, setNativeVteOpened] = useState(false);
  const [nativeVteProbeAttempt, setNativeVteProbeAttempt] = useState(0);
  const [nativeVteRecoveryAttempt, setNativeVteRecoveryAttempt] = useState(0);
  const [terminalRuntimeNonce, setTerminalRuntimeNonce] = useState(0);
  // External connectionState prop takes precedence (allows parent to set 'suspended')
  const connectionState =
    externalConnectionState !== undefined ? externalConnectionState : internalConnectionState;
  const setConnectionState =
    externalConnectionState !== undefined ? () => {} : setInternalConnectionState;
  const tauriAvailable = isNativeVteRuntimeAvailable();
  const resolvedRuntimePlatform = getTerminalRuntimePlatform(runtimePlatform);
  const rendererCapabilities = getTerminalRendererRuntimeCapabilities({
    platform: resolvedRuntimePlatform,
    tauriAvailable,
    nativeVteProbe: nativeVteProbeResult,
    nativeVteOpenFailure,
  });
  const rendererViewModel = resolveTerminalRendererViewModel({
    requestedRendererMode,
    rendererCapabilities,
    nativeVteReady: requestedRendererMode === 'vte-experimental' && nativeVteOpened,
  });
  const isCanvasMode = rendererViewModel.effectiveMode === 'canvas';
  const hasSentInitialCommand = useRef(false);
  const processExitedRef = useRef(false);
  const rafRef = useRef(null);
  const timeoutRef = useRef(null);
  const initTimeoutRef = useRef(null);
  const autoScrollRafRef = useRef(null);
  const xtermInstanceTokenRef = useRef(0);
  const consecutiveStaleFitFailuresRef = useRef(0);
  const effectiveRendererModeRef = useRef(rendererViewModel.effectiveMode);
  const lastViewportYRef = useRef(null);
  // Last seen avoid rects from TWM (for carve when popups are over this terminal).
  // Updated via the workspace-sync event; used in show paths to compute carved
  // bounds so web content can render on top without full suspend.
  const avoidRectsRef = useRef([]);
  const canvasRef = useRef(null);
  const canvasCtxRef = useRef(null);
  const canvasLinesRef = useRef([]); // simple buffer for stub canvas renderer (new view type for pizarra)
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
  const isStartupSuspended = connectionState === 'suspended';
  const shouldBootXterm =
    !isStartupSuspended &&
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
    });
  const shouldBootCanvas = rendererViewModel.effectiveMode === 'canvas' && !isStartupSuspended;

  const clearTimers = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }

    if (nativeVteProbeRetryTimerRef.current) {
      clearTimeout(nativeVteProbeRetryTimerRef.current);
      nativeVteProbeRetryTimerRef.current = null;
      nativeVteProbeRetryDelayRef.current = null;
    }

    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const clearNativeVteProbeRetryTimer = useCallback(() => {
    if (!nativeVteProbeRetryTimerRef.current) return;

    clearTimeout(nativeVteProbeRetryTimerRef.current);
    nativeVteProbeRetryTimerRef.current = null;
    nativeVteProbeRetryDelayRef.current = null;
  }, []);

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

  const disposeXtermRuntime = useCallback(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;

    if (wsRef.current) {
      const stale = wsRef.current;
      stale.onopen = null;
      stale.onmessage = null;
      stale.onerror = null;
      stale.onclose = null;
      stale.close();
      wsRef.current = null;
    }

    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
    searchRef.current = null;
  }, []);

  // Phase 4: explicit hard-destroy of the surface. Called from
  // the X button, kill-session command, or the provider's
  // releaseSurface(id, { keepAlive: false }) path. Closes the
  // WS, disposes XTerm, fires the consumer's onSurfaceDestroy
  // callback (so the parent can also remove the surface from
  // its registry), AND releases the surface from the provider
  // with keepAlive: false so the provider can free the slot.
  const destroySurface = useCallback(() => {
    if (destroyedRef.current) return;
    destroyedRef.current = true;
    try {
      closeNativeLease('destroy');
    } catch {
      // ignore — best-effort
    }
    try {
      if (onSurfaceDestroyCallback) onSurfaceDestroyCallback(surfaceId);
    } catch (err) {
      cliLog(`CLIENT:${surfaceId}`, 'onSurfaceDestroy threw', { error: err?.message });
    }
    disposeXtermRuntime();
    if (surfaceRegistry && surfaceId) {
      try {
        surfaceRegistry.releaseSurface(surfaceId, { keepAlive: false });
      } catch (err) {
        cliLog(`CLIENT:${surfaceId}`, 'releaseSurface threw', { error: err?.message });
      }
    }
  }, [surfaceRegistry, surfaceId, onSurfaceDestroyCallback]);

  // Phase 4: register this surface with the provider on mount
  // (if a provider exists). Soft release on unmount by default
  // (keepAlive: true); the WS / XTerm are NOT disposed. When
  // `disposeOnUnmount` is true OR the surface was destroyed
  // explicitly, the unmount path hard-disposes.
  useEffect(() => {
    if (!surfaceRegistry || !surfaceId) return undefined;
    if (surfaceRegisteredRef.current) return undefined;
    surfaceRegisteredRef.current = true;
    const unregister = surfaceRegistry.registerSurface(surfaceId, { type: 'terminal' });
    return () => {
      unregister();
      surfaceRegisteredRef.current = false;
    };
  }, [surfaceRegistry, surfaceId]);

  const shouldRetryNativeVteProbe =
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

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    requestedRendererModeRef.current = requestedRendererMode;
  }, [requestedRendererMode]);

  useEffect(() => {
    effectiveRendererModeRef.current = rendererViewModel.effectiveMode;
  }, [rendererViewModel.effectiveMode]);

  const logViewportDiagnostic = useCallback(
    createTerminalViewportDiagnosticLogger({
      id,
      cliLog,
      lastSnapshotRef: lastViewportDiagnosticRef,
      getSnapshot: (reason) =>
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
        }),
    }),
    [id]
  );

  const closeNativeLease = useCallback(
    async (reason = 'deactivate') => {
      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      try {
        await closeNativeVtePanel({ panelId: id, reason });
      } catch (error) {
        cliLog(`CLIENT:${id}`, 'native VTE close FAILED', { reason, error: error?.message });
        handleNativeLeaseCommandError(error);
      }
    },
    [id, handleNativeLeaseCommandError]
  );

  const hideNativeLease = useCallback(
    async (reason = 'inactive') => {
      cliLog(`CLIENT:${id}`, 'native VTE hide requested', { reason });
      try {
        await setNativeVtePanelVisibility({
          panelId: id,
          visible: false,
          reason,
        });
      } catch (error) {
        cliLog(`CLIENT:${id}`, 'native VTE hide FAILED', { reason, error: error?.message });
        handleNativeLeaseCommandError(error);
      }
    },
    [id, handleNativeLeaseCommandError]
  );

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      closeNativeLease('unmount');
    };
  }, [closeNativeLease]);

  const showNativeLease = useCallback(async () => {
    if (!nativeLeaseRef.current) return;
    const rawBounds = getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current);
    if (!rawBounds) {
      cliLog(`CLIENT:${id}`, 'native VTE show skipped — invalid bounds');
      return;
    }
    // Carve for popups if we have avoids (from last sync or ref). This keeps
    // terminal live while web UI is shown "sobre" it.
    const avoids = avoidRectsRef.current || [];
    const carved = computeCarvedBounds(rawBounds, avoids);
    const base = carved || rawBounds;
    // Safety inset so split dividers and dock chrome are not overpainted by the native.
    const bounds = {
      x: base.x + 1,
      y: base.y + 1,
      width: Math.max(0, base.width - 2),
      height: Math.max(0, base.height - 2),
    };
    cliLog(`CLIENT:${id}`, 'native VTE show requested', { bounds, carved: !!carved });
    await Promise.resolve(
      setNativeVtePanelVisibility({
        panelId: id,
        visible: true,
        bounds,
        reason: carved ? 'show-carved' : 'show-lease',
      })
    ).catch(handleNativeLeaseCommandError);
  }, [handleNativeLeaseCommandError, id]);

  const resizeNativeLease = useCallback(async () => {
    if (!nativeLeaseRef.current) return;
    const rawBounds = getNativeTerminalBounds(containerRef.current || nativePlaceholderRef.current);
    if (!rawBounds) {
      cliLog(`CLIENT:${id}`, 'native VTE resize skipped — invalid bounds');
      return;
    }
    // Safety inset so split dividers and dock chrome are not overpainted by the native.
    const bounds = {
      x: rawBounds.x + 1,
      y: rawBounds.y + 1,
      width: Math.max(0, rawBounds.width - 2),
      height: Math.max(0, rawBounds.height - 2),
    };
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

  const waitForVisibleDimensions = useCallback(async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const container = containerRef.current;
      if (!container) return false;

      const rect = container.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        (typeof document === 'undefined' || document.visibilityState !== 'hidden')
      ) {
        return true;
      }

      await new Promise((resolve) => {
        initTimeoutRef.current = setTimeout(() => {
          initTimeoutRef.current = null;
          resolve();
        }, 40);
      });
    }

    const rect = containerRef.current?.getBoundingClientRect();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  }, []);

  const getRect = externalDimensionSource ? () => externalDimensionSource() : undefined;

  const fitAndResize = useCallback(() => {
    const fitWorked = fitTerminalViewport({
      container: containerRef.current,
      fitAddon: fitRef.current,
      term: termRef.current,
      socket: wsRef.current,
      getRect,
    });

    logViewportDiagnostic(fitWorked ? 'fit-resize' : 'fit-skipped');

    if (!fitWorked) {
      consecutiveStaleFitFailuresRef.current += 1;
      if (consecutiveStaleFitFailuresRef.current >= 3) {
        consecutiveStaleFitFailuresRef.current = 0;
        disposeXtermRuntime();
        clearTimers();
        setTerminalRuntimeNonce((n) => n + 1);
        cliLog(`CLIENT:${id}`, 'force xterm runtime reinit after stale fits');
      }
    } else {
      consecutiveStaleFitFailuresRef.current = 0;
    }
  }, [logViewportDiagnostic, disposeXtermRuntime, clearTimers, id]);

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

  const sendResize = useCallback(() => {
    if (!termRef.current || !fitRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const shouldStickToBottom = isTerminalViewportNearBottom(termRef.current);
    const instanceToken = xtermInstanceTokenRef.current;
    fitAndResize();
    if (shouldStickToBottom) {
      scrollTerminalToBottom(true);
    }
    clearTimers();
    rafRef.current = requestAnimationFrame(() => {
      if (xtermInstanceTokenRef.current !== instanceToken) return;
      fitAndResize();
      if (shouldStickToBottom) {
        scrollTerminalToBottom(true);
      }
    });
    timeoutRef.current = setTimeout(() => {
      if (xtermInstanceTokenRef.current !== instanceToken) return;
      fitAndResize();
      if (shouldStickToBottom) {
        scrollTerminalToBottom(true);
      }
    }, 120);
  }, [fitAndResize, clearTimers, scrollTerminalToBottom]);

  // Stub for new 'canvas' terminal view type (for pizarra to avoid native widget and xterm lib).
  // Basic ANSI strip + canvas text draw. Later can be upgraded to full VT parser + colors/cursor.
  const stripAnsi = useCallback((str = '') => {
    return str.replace(
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      ''
    );
  }, []);

  const drawToCanvas = useCallback(
    (data = '') => {
      const c = canvasRef.current;
      if (!c || !isCanvasMode) return;
      let ctx = canvasCtxRef.current;
      if (!ctx) {
        ctx = c.getContext('2d', { alpha: false });
        if (!ctx) return;
        canvasCtxRef.current = ctx;
      }
      const text = stripAnsi(data);
      const newLines = text.split(/\r?\n/);
      const buf = canvasLinesRef.current;
      for (const l of newLines) {
        if (l) buf.push(l);
      }
      while (buf.length > 80) buf.shift();
      // size to parent
      const parent = c.parentElement;
      const pw = parent ? parent.clientWidth || 800 : 800;
      const ph = parent ? parent.clientHeight || 600 : 600;
      if (c.width !== pw || c.height !== ph) {
        c.width = pw;
        c.height = ph;
      }
      ctx.fillStyle = '#0f1724';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      const lh = 16;
      const max = Math.floor(c.height / lh) || 30;
      const toDraw = buf.slice(-max);
      toDraw.forEach((line, i) => {
        ctx.fillText(line.slice(0, Math.floor(c.width / 7) || 80), 8, 14 + i * lh);
      });
    },
    [isCanvasMode, stripAnsi]
  );

  // Init stub canvas for 'canvas' mode (new terminal view type).
  useEffect(() => {
    if (!isCanvasMode || !canvasRef.current) return;
    const c = canvasRef.current;
    const parent = c.parentElement;
    const w = (parent && parent.clientWidth) || 800;
    const h = (parent && parent.clientHeight) || 600;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (ctx) {
      canvasCtxRef.current = ctx;
      ctx.fillStyle = '#0f1724';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#64748b';
      ctx.font = '12px monospace';
      ctx.fillText('[Canvas Terminal View - stub for pizarra (no xterm, native parked)]', 10, 20);
      ctx.fillText('PTY content will render here via drawToCanvas on data.', 10, 36);
    }
  }, [isCanvasMode]);

  // --- Scroll fix: preserve/restore scroll position when panel visibility changes ---
  useEffect(() => {
    if (!termRef.current) return;
    if (isVisibleInLayout) {
      // Panel just became visible - restore scroll position
      const saved = lastViewportYRef.current;
      if (saved != null) {
        restoreTerminalViewportScroll(termRef.current, saved);
      } else {
        scrollTerminalToBottom(true);
      }
    } else {
      // Panel becoming invisible - save current scroll position
      lastViewportYRef.current = getTerminalViewportScrollOffset(termRef.current);
    }
  }, [isVisibleInLayout]);

  const reactivateTerminalViewport = useCallback(() => {
    if (
      !shouldRunTerminalViewportReactivation({
        isActivePanel,
        isVisibleInLayout,
        documentVisibilityState:
          typeof document !== 'undefined' ? document.visibilityState : 'visible',
      })
    ) {
      return;
    }

    logViewportDiagnostic('reactivate-start');
    const savedViewportY = getTerminalViewportScrollOffset(termRef.current);
    const shouldStickToBottom = isTerminalViewportNearBottom(termRef.current);
    const repaint = () => {
      stabilizeTerminalRenderer(termRef.current);
      if (shouldStickToBottom) {
        scrollTerminalToBottom(true);
      }
    };

    const instanceToken = xtermInstanceTokenRef.current;
    sendResize();
    repaint();

    // Restore scroll position if the user was not at bottom,
    // guarding against xterm.js resize/fit resetting the viewport.
    if (!shouldStickToBottom && savedViewportY != null) {
      restoreTerminalViewportScroll(termRef.current, savedViewportY);
    }

    rafRef.current = requestAnimationFrame(() => {
      if (xtermInstanceTokenRef.current !== instanceToken) return;
      repaint();

      if (!shouldStickToBottom && savedViewportY != null) {
        restoreTerminalViewportScroll(termRef.current, savedViewportY);
      }

      if (autoFocus) {
        termRef.current?.focus?.();
      }

      timeoutRef.current = setTimeout(() => {
        if (xtermInstanceTokenRef.current !== instanceToken) return;
        sendResize();
        repaint();
        if (!shouldStickToBottom && savedViewportY != null) {
          restoreTerminalViewportScroll(termRef.current, savedViewportY);
        }
        logViewportDiagnostic('reactivate-settled');
      }, 120);
    });
  }, [
    autoFocus,
    isActivePanel,
    isVisibleInLayout,
    logViewportDiagnostic,
    scrollTerminalToBottom,
    sendResize,
  ]);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve(subscribeNativeVteEvents())
      .then((unsubscribe) => {
        if (cancelled) {
          unsubscribe?.();
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (requestedRendererMode !== 'vte-experimental') {
      setNativeVteProbeResult(null);
      setNativeVteOpenFailure(null);
      setNativeVteOpened(false);
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
      closeNativeLease('renderer-disabled');
      return undefined;
    }

    if (!isVisibleInLayout) {
      clearNativeVteProbeRetryTimer();
      return undefined;
    }

    const cachedProbe = getCachedNativeVteProbeResult();
    if (cachedProbe?.ready) {
      setNativeVteProbeResult(cachedProbe);
      setNativeVteOpenFailure(null);
      setIsInitializing(false);
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
          setIsInitializing(false);
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
    isVisibleInLayout,
    nativeVteProbeAttempt,
    requestedRendererMode,
    tauriAvailable,
  ]);

  useEffect(() => {
    if (
      nativeVteOpened ||
      !shouldOpenNativeVtePanel({
        isActivePanel,
        isVisibleInLayout,
        suspendNativeSurface,
        connectionSuspended: isStartupSuspended,
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

    const intervalId = setInterval(retryNativeOpenWhenBoundsRecover, 48);
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
    nativeVteRecoveryAttempt,
    requestedRendererMode,
    resolvedRuntimePlatform,
    suspendNativeSurface,
    isStartupSuspended,
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
        connectionSuspended: isStartupSuspended,
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
      // Interactive shell only — command is pasted after spawn (like xterm onopen).
      initialCommand: null,
      sessionId: id,
    };

    const injectNativeInitialCommand = async (command) => {
      const clean = String(command || '')
        .replace(/\s*#recovery-\d+\s*$/, '')
        .trim();
      if (!clean || hasSentInitialCommand.current || nativeInitialCommandInjected.has(id)) {
        return;
      }
      nativeInitialCommandInjected.add(id);
      hasSentInitialCommand.current = true;
      await new Promise((resolve) => setTimeout(resolve, 200));
      await Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(
        handleNativeLeaseCommandError
      );
      await pasteNativeVtePanel({ panelId: id, text: `${clean}\n` });
      cliLog(`CLIENT:${id}`, 'native VTE injected initial command', { command: clean });
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
        setIsInitializing(false);
        clearNativeVteProbeRetryTimer();
        if (initialCommand) {
          void injectNativeInitialCommand(initialCommand);
        }
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
          await showNativeLease();
          await resizeNativeVtePanel({ panelId: id, bounds });
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
    suspendNativeSurface,
    isStartupSuspended,
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

    // If we have active avoid rects (popups over us), prefer carve path (live partial
    // terminal) instead of full hide/suspend. The sync/show will carve the bounds.
    // This is key to "continuar con la mejor opcion" (carve) without relying on
    // improving suspend UX.
    const currentAvoids = avoidRectsRef.current || [];
    if (currentAvoids.length > 0) {
      // carve will be applied via handler or show; don't force hide here
      return undefined;
    }

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

  useEffect(() => {
    if (requestedRendererMode !== 'vte-experimental') return undefined;

    let cancelScheduledShow = null;

    const clearScheduledShow = () => {
      cancelScheduledShow?.();
      cancelScheduledShow = null;
    };

    const runShowAndResize = () => {
      if (!isVisibleInLayout) return;
      if (suspendNativeSurface && nativeSurfacePolicy !== 'dock-side-by-side') return;
      void showAndResizeNativeLease();
    };

    const scheduleShowAndResize = () => {
      clearScheduledShow();
      cancelScheduledShow = scheduleNativeSurfaceActivation(runShowAndResize);
    };

    const handleWorkspaceNativeSurfaceSync = (event) => {
      const detail = event.detail || {};
      const activePanelIds = new Set(
        Array.isArray(detail.activePanelIds) ? detail.activePanelIds.filter(Boolean) : []
      );
      const hiddenPanelIds = new Set(
        Array.isArray(detail.hiddenPanelIds) ? detail.hiddenPanelIds.filter(Boolean) : []
      );

      if (detail.avoidRects) {
        avoidRectsRef.current = detail.avoidRects;
      }

      if (hiddenPanelIds.has(id)) {
        clearScheduledShow();
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        void hideNativeLease(detail.reason || 'workspace-hidden');
        return;
      }

      if (activePanelIds.has(id)) {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        if (nativeVteOpened) {
          runShowAndResize();
          scheduleShowAndResize();
        } else {
          scheduleShowAndResize();
        }

        // xterm (or fallback) path: on explicit workspace activation for this panel,
        // re-assert the saved viewport if user had scrolled up. The isVisibleInLayout
        // effect + resize observer already do preservation; this makes the
        // "ws now front" signal from TWM explicit so scroll doesn't land on top
        // after the many fit/reactivate calls during a workspace switch transition.
        if (termRef.current && !nativeVteOpened) {
          const saved = lastViewportYRef.current;
          if (saved != null) {
            if (!isTerminalViewportNearBottom(termRef.current)) {
              restoreTerminalViewportScroll(termRef.current, saved);
            }
          } else {
            scrollTerminalToBottom(true);
          }
        }

        // Carve support: if avoid rects (popups) overlap this panel, compute reduced
        // bounds and apply via visibility (visible + carved) so web paints over the
        // avoided area while VTE stays live outside it. If fully covered, hide.
        // This (plus registration in TWM) lets you show "cosas sobre la terminal"
        // (grillas, wizards, dock content, pizarra elements, etc) without full suspend.
        const rawBounds = getNativeTerminalBounds(
          containerRef.current || nativePlaceholderRef.current
        );
        if (rawBounds) {
          const avoids = detail.avoidRects || avoidRectsRef.current || [];
          const carved = computeCarvedBounds(rawBounds, avoids);
          if (carved) {
            void setNativeVtePanelVisibility({
              panelId: id,
              visible: true,
              bounds: carved,
              reason: 'carve-avoid-popup',
            }).catch(handleNativeLeaseCommandError);
          } else if (avoids.length > 0) {
            void hideNativeLease('avoid-fully-covered');
          }
        }
      }
    };

    window.addEventListener('devhub:native-vte-workspace-sync', handleWorkspaceNativeSurfaceSync);

    return () => {
      clearScheduledShow();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
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
    nativeVteOpened,
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
      const rawBounds = getNativeTerminalBounds(
        containerRef.current || nativePlaceholderRef.current
      );
      if (!rawBounds) return;
      // Safety inset (see getNativeTerminalBounds comment for rationale).
      const bounds = {
        x: rawBounds.x + 1,
        y: rawBounds.y + 1,
        width: Math.max(0, rawBounds.width - 2),
        height: Math.max(0, rawBounds.height - 2),
      };
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
      nativeResizeSettleTimersRef.current = NATIVE_SURFACE_SETTLE_DELAYS_MS.map((delayMs) =>
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
      nativeInitialCommandInjected.delete(id);
      closeNativeLease('session-close');
    };

    window.addEventListener('devhub:terminal-session-closing', handleSessionClosing);
    return () => {
      window.removeEventListener('devhub:terminal-session-closing', handleSessionClosing);
    };
  }, [closeNativeLease, id]);

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

  const connect = useCallback(async () => {
    setConnectionState('connecting');
    processExitedRef.current = false;

    cliLog(`CLIENT:${id}`, 'connect() called', { cwd, autoFocus });

    try {
      // Silence the stale socket BEFORE closing it so its onclose doesn't
      // override 'connecting' back to 'disconnected' and trigger a reconnect loop.
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
        stale.close();
        wsRef.current = null;
        cliLog(`CLIENT:${id}`, 'stale socket silenced+closed');
      }

      const cwdParam = cwd ? `cwd=${encodeURIComponent(cwd)}` : '';
      const sessionIdParam = id ? `sessionId=${encodeURIComponent(id)}` : '';
      const legacyIdParam = id ? `id=${encodeURIComponent(id)}` : '';
      const swarmRoleParam = swarmContext?.isSwarmRole ? 'isSwarmRole=1' : '';
      const swarmRoleKeyParam = swarmContext?.roleKey
        ? `roleKey=${encodeURIComponent(swarmContext.roleKey)}`
        : '';
      const swarmLaunchIdParam = swarmContext?.launchId
        ? `launchId=${encodeURIComponent(swarmContext.launchId)}`
        : '';
      const queryParams = [
        cwdParam,
        sessionIdParam,
        legacyIdParam,
        swarmRoleParam,
        swarmRoleKeyParam,
        swarmLaunchIdParam,
      ]
        .filter(Boolean)
        .join('&');
      const queryStr = queryParams ? `?${queryParams}` : '';

      console.log(`[TTY:${id}] Connecting to /api/terminal/session${queryStr}`);
      cliLog(`CLIENT:${id}`, 'fetching session API', { queryStr });
      const sessionResponse = await fetch(`/api/terminal/session${queryStr}`, {
        cache: 'no-store',
      });
      if (!sessionResponse.ok) {
        const errText = await sessionResponse.text().catch(() => '');
        console.error(`[TTY:${id}] Session API failed: ${sessionResponse.status}`, errText);
        cliLog(`CLIENT:${id}`, 'session API FAILED', {
          status: sessionResponse.status,
          body: errText,
        });
        throw new Error(`No se pudo crear la sesión de terminal (${sessionResponse.status}).`);
      }

      const { port, wsPath } = await sessionResponse.json();
      console.log(`[TTY:${id}] Got port=${port}, wsPath=${wsPath}`);
      cliLog(`CLIENT:${id}`, 'session API ok', { port, wsPath });
      transportRef.current = wsPath === '/' ? 'raw' : 'json';
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProtocol}://127.0.0.1:${port}${wsPath}${queryStr}`;
      console.log(`[TTY:${id}] WebSocket URL: ${wsUrl}`);
      cliLog(`CLIENT:${id}`, 'opening WebSocket', { wsUrl });
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      const connectionTimeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          console.error(`[TTY:${id}] WebSocket connection timeout after 10s`);
          cliLog(`CLIENT:${id}`, 'WS connection TIMEOUT (10s)', { readyState: socket.readyState });
          socket.close();
          setConnectionState('error');
        }
      }, 10000);

      socket.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log(`[TTY:${id}] WebSocket connected`);
        cliLog(`CLIENT:${id}`, 'WS onopen — connected');
        setConnectionState('connected');
        sendResize();

        // Show restored toast for sessions from previous run
        if (restored && cwd) {
          setRestoredToast(true);
          setTimeout(() => setRestoredToast(false), 2000);
        }

        // Only send initial command once per component lifecycle to avoid rerunning on fast reconnects
        if (initialCommand && !hasSentInitialCommand.current) {
          // Strip recovery suffix if present (added by session recovery mechanism)
          const cleanCommand = initialCommand.replace(/\s*#recovery-\d+\s*$/, '');
          console.log(`[TTY:${id}] Sending initial command: ${cleanCommand}`);
          if (transportRef.current === 'raw') {
            socket.send(cleanCommand + '\r');
          } else {
            socket.send(JSON.stringify({ type: 'input', data: cleanCommand + '\r' }));
          }
          hasSentInitialCommand.current = true;
        }
        // Initial focus handled by the other useEffect
      };

      socket.onmessage = (event) => {
        if (transportRef.current === 'raw') {
          if (typeof event.data === 'string' && event.data.length > 0) {
            if (isCanvasMode) {
              drawToCanvas(event.data);
            } else if (termRef.current) {
              const shouldStickToBottom = isTerminalViewportNearBottom(termRef.current);
              termRef.current?.write(event.data);
              if (shouldStickToBottom) {
                scrollTerminalToBottom(true);
              }
            }
          }
          return;
        }

        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'output' && typeof payload.data === 'string') {
            if (isCanvasMode) {
              drawToCanvas(payload.data);
            } else if (termRef.current) {
              const shouldStickToBottom = isTerminalViewportNearBottom(termRef.current);
              termRef.current?.write(payload.data);
              if (shouldStickToBottom) {
                scrollTerminalToBottom(true);
              }
            }
            return;
          }

          if (payload.type === 'exit') {
            processExitedRef.current = true;
            cliLog(`CLIENT:${id}`, 'received exit from server');
            setConnectionState('terminated');
            termRef.current?.writeln(
              '\r\n\x1b[33m[Sesión finalizada. Reconectá para iniciar una nueva shell.]\x1b[0m'
            );
            window.dispatchEvent(
              new CustomEvent('devhub:terminal-exit', {
                detail: { id, initialCommand },
              })
            );
          }

          // The server detected an OpenCode session ID in this terminal — propagate it
          // so TerminalWorkspacesManager can persist it and restore it after reboots.
          if (payload.type === 'opencode-session-detected' && payload.sessionId) {
            window.dispatchEvent(
              new CustomEvent('devhub:opencode-session-detected', {
                detail: { panelId: id, sessionId: payload.sessionId },
              })
            );
            return;
          }

          if (payload.type === 'hermes-session-detected' && payload.sessionId) {
            window.dispatchEvent(
              new CustomEvent('devhub:hermes-session-detected', {
                detail: { panelId: id, sessionId: payload.sessionId },
              })
            );
            return;
          }
        } catch {
          if (typeof event.data === 'string' && event.data.length > 0) {
            const shouldStickToBottom = isTerminalViewportNearBottom(termRef.current);
            termRef.current?.write(event.data);
            if (shouldStickToBottom) {
              scrollTerminalToBottom(true);
            }
          }
        }
      };

      socket.onerror = (err) => {
        clearTimeout(connectionTimeout);
        console.error(`[TTY:${id}] WebSocket error:`, err);
        cliLog(`CLIENT:${id}`, 'WS onerror');
        setConnectionState('error');
      };

      socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log(`[TTY:${id}] WebSocket closed: code=${event.code}, reason=${event.reason}`);
        cliLog(`CLIENT:${id}`, 'WS onclose', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        setConnectionState((prev) =>
          resolveTerminalConnectionCloseState(prev, processExitedRef.current)
        );
      };
    } catch (error) {
      console.error(`[TTY:${id}] Connection failed:`, error);
      cliLog(`CLIENT:${id}`, 'connect() catch', { error: error?.message });
      setConnectionState('error');
    }
  }, [scrollTerminalToBottom, sendResize, cwd, initialCommand, id]);

  const adjustFontSize = useCallback((delta) => {
    setFontSize((prev) => {
      const next = Math.min(24, Math.max(8, prev + delta));
      try {
        window.localStorage.setItem(FONT_SIZE_KEY, String(next));
      } catch {
        /* ignore */
      }
      if (termRef.current) {
        termRef.current.options.fontSize = next;
        fitRef.current?.fit();
      }
      return next;
    });
  }, []);

  const reconnect = useCallback(() => {
    processExitedRef.current = false;
    cliLog(`CLIENT:${id}`, 'reconnect() called');
    termRef.current?.clear();
    // connect() already silences and closes the stale socket — just call it directly.
    connect();
  }, [connect]);

  const copyTextToClipboard = useCallback(async (text) => {
    if (!text) return false;

    try {
      const clipboardApi = getClipboardApi();
      if (!clipboardApi?.writeText) {
        throw new Error('clipboard-unavailable');
      }
      await clipboardApi.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    return true;
  }, []);

  const handleCopySelection = useCallback(async () => {
    const text = termRef.current?.getSelection?.() || contextMenu?.text || '';
    return copyTextToClipboard(text);
  }, [contextMenu?.text, copyTextToClipboard]);

  const handlePasteIntoTerminal = useCallback(async () => {
    cliLog('[paste]', 'handlePasteIntoTerminal called');
    if (shouldUseNativeRenderer) {
      // Read clipboard content in JS (not GTK) and send it directly to VTE via paste_text.
      // This bypasses GTK clipboard semantics entirely, ensuring Ctrl+Shift+V and
      // Shift+Insert paste the exact same content as Ctrl+C/Ctrl+V.
      const clipboardApi = getClipboardApi();
      const text = clipboardApi?.readText ? await clipboardApi.readText() : null;
      cliLog('[paste]', `shouldUseNativeRenderer=true, clipboard text len=${text?.length ?? 0}`);
      if (text) {
        await Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(
          handleNativeLeaseCommandError
        );
        const result = await pasteNativeVtePanel({ panelId: id, text });
        cliLog('[paste]', `pasteNativeVtePanel returned supported=${result?.supported}`);
        return Boolean(result?.supported);
      }
      return false;
    }

    const clipboardApi = getClipboardApi();
    if (!clipboardApi?.readText) return false;

    const text = await clipboardApi.readText();
    if (!text) return false;

    if (typeof termRef.current?.paste === 'function') {
      termRef.current.paste(text);
      return true;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (transportRef.current === 'raw') {
        wsRef.current.send(text);
      } else {
        wsRef.current.send(JSON.stringify({ type: 'input', data: text }));
      }
      return true;
    }

    return false;
  }, [handleNativeLeaseCommandError, id, shouldUseNativeRenderer]);

  useEffect(() => {
    let mounted = true;

    if (!shouldBootXterm && !shouldBootCanvas) {
      disposeXtermRuntime();
      // stub dispose for canvas
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      setInitError(null);
      setIsInitializing(
        isStartupSuspended
          ? false
          : runtimePhase === 'native-probing' || runtimePhase === 'native-opening'
      );

      return () => {
        mounted = false;
        clearTimers();
        resizeObserverRef.current?.disconnect();
        nativeResizeObserverRef.current?.disconnect();
        nativeResizeObserverRef.current = null;
        if (nativeResizeRafRef.current) {
          cancelAnimationFrame(nativeResizeRafRef.current);
          nativeResizeRafRef.current = null;
        }
        // Phase 4: only hard-dispose when the surface was
        // explicitly destroyed (X click, kill command) or
        // when the consumer opts in via disposeOnUnmount.
        if (destroyedRef.current || disposeOnUnmount) {
          disposeXtermRuntime();
        } else {
          // Soft cleanup: keep WS / XTerm alive across React
          // re-mounts. The surface descriptor in the provider
          // persists. The next mount re-attaches to the same
          // scrollback.
        }
      };
    }

    async function initializeTerminal() {
      cliLog(`CLIENT:${id}`, 'initializeTerminal() start', {
        cwd,
        autoFocus,
        requestedRendererMode: requestedRendererModeRef.current,
        effectiveRendererMode: rendererViewModel.effectiveMode,
      });
      try {
        const [{ Terminal }, { FitAddon }, { SearchAddon }] = await Promise.all([
          import('xterm'),
          import('xterm-addon-fit'),
          import('xterm-addon-search'),
        ]);

        if (!mounted || !containerRef.current) {
          cliLog(
            `CLIENT:${id}`,
            'initializeTerminal() aborted — unmounted or no container (after import)'
          );
          return;
        }

        const terminal = new Terminal({
          cursorBlink: true,
          fontFamily: resolveTerminalFontFamily(),
          fontSize: fontSize,
          letterSpacing: 0,
          lineHeight: 1.4,
          allowTransparency: false,
          theme: getTerminalTheme(),
        });

        xtermInstanceTokenRef.current += 1;
        consecutiveStaleFitFailuresRef.current = 0;

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(searchAddon);
        terminal.open(containerRef.current);

        const initialRect = externalDimensionSource
          ? (externalDimensionSource() ?? containerRef.current?.getBoundingClientRect())
          : containerRef.current?.getBoundingClientRect();
        const initiallyVisible =
          initialRect.width > 0 &&
          initialRect.height > 0 &&
          (typeof document === 'undefined' || document.visibilityState !== 'hidden');

        logViewportDiagnostic(initiallyVisible ? 'terminal-open-visible' : 'terminal-open-pending');

        terminal.onData((data) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            if (transportRef.current === 'raw') {
              wsRef.current.send(data);
            } else {
              wsRef.current.send(JSON.stringify({ type: 'input', data }));
            }
          }
        });

        resizeObserverRef.current = new ResizeObserver(() => {
          const rect = externalDimensionSource
            ? (externalDimensionSource() ?? containerRef.current?.getBoundingClientRect())
            : containerRef.current?.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) return;
          logViewportDiagnostic('resize-observer');
          // Preserve scroll position across resize events (e.g., workspace switches)
          const savedViewportY = getTerminalViewportScrollOffset(termRef.current);
          const shouldStickToBottom = isTerminalViewportNearBottom(termRef.current);
          lastViewportYRef.current = savedViewportY;
          sendResize();
          if (!shouldStickToBottom && savedViewportY != null) {
            restoreTerminalViewportScroll(termRef.current, savedViewportY);
          }
        });
        resizeObserverRef.current.observe(containerRef.current);

        termRef.current = terminal;
        fitRef.current = fitAddon;
        searchRef.current = searchAddon;

        setInitError(null);
        setIsInitializing(false);
        connect();

        if (initiallyVisible) {
          sendResize();

          // Re-fit after fonts load to recalibrate character metrics.
          // xterm.js CharMeasure may use fallback font metrics if the
          // preferred font has not finished loading at open time.
          if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
            void document.fonts
              .load(`${fontSize}px "JetBrains Mono"`)
              .then(() => {
                if (termRef.current && fitRef.current && mounted) {
                  cliLog(`CLIENT:${id}`, 'font-load-refit', { fontSize });
                  sendResize();
                }
              })
              .catch(() => {});
          }

          return;
        }

        void waitForVisibleDimensions()
          .then((ready) => {
            cliLog(`CLIENT:${id}`, 'waitForVisibleDimensions done', {
              ready,
              width: containerRef.current?.getBoundingClientRect().width,
              height: containerRef.current?.getBoundingClientRect().height,
            });

            if (!mounted || !containerRef.current || !termRef.current || !fitRef.current) {
              return;
            }

            if (ready) {
              sendResize();
              return;
            }

            logViewportDiagnostic('terminal-open-timeout');
          })
          .catch((error) => {
            cliLog(`CLIENT:${id}`, 'waitForVisibleDimensions failed', {
              error: error?.message,
            });
          });
      } catch (error) {
        console.error(`[TTY:${id}] initializeTerminal() failed:`, error);
        cliLog(`CLIENT:${id}`, 'initializeTerminal() failed', { error: error?.message });

        if (!mounted) return;

        setInitError('No se pudo inicializar la terminal en esta ventana.');
        setConnectionState('error');
        setIsInitializing(false);
        disposeXtermRuntime();
        clearTimers();
        return;
      }
    }

    initializeTerminal();

    return () => {
      mounted = false;
      clearTimers();
      resizeObserverRef.current?.disconnect();
      nativeResizeObserverRef.current?.disconnect();
      nativeResizeObserverRef.current = null;
      if (nativeResizeRafRef.current) {
        cancelAnimationFrame(nativeResizeRafRef.current);
        nativeResizeRafRef.current = null;
      }
      // Phase 4: silence the socket so it does not flip the
      // connectionState on a re-mounting component. The actual
      // close happens only when the surface is being hard-
      // destroyed (X click, kill, or `disposeOnUnmount` opt-in).
      // In the singleton path the WS / XTerm / scrollback are
      // preserved across mode toggles.
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
      }
      if (destroyedRef.current || disposeOnUnmount) {
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        disposeXtermRuntime();
      }
      // Otherwise: leave wsRef and termRef intact. The hidden
      // mount in the SharedSurfacesProvider holds the live
      // instance; the next React re-mount re-attaches.
    };
  }, [
    clearTimers,
    connect,
    disposeXtermRuntime,
    logViewportDiagnostic,
    runtimePhase,
    sendResize,
    shouldBootXterm,
    terminalRuntimeNonce,
    waitForVisibleDimensions,
    disposeOnUnmount,
  ]);

  const prevSuspendedRef = useRef(connectionState === 'suspended');

  // Suspended restore ↔ resume (manual "Continuar" or auto relaunch).
  useEffect(() => {
    const wasSuspended = prevSuspendedRef.current;
    const isSuspended = connectionState === 'suspended';
    prevSuspendedRef.current = isSuspended;

    if (isSuspended) {
      setIsInitializing(false);
      setInitError(null);
      if (nativeVteOpened || nativeLeaseRef.current) {
        void setNativeVtePanelVisibility({
          panelId: id,
          visible: false,
          reason: 'restore-suspended',
        }).catch(handleNativeLeaseCommandError);
      }
      return undefined;
    }

    if (wasSuspended) {
      hasSentInitialCommand.current = false;
      nativeInitialCommandInjected.delete(id);
      setTerminalRuntimeNonce((nonce) => nonce + 1);
      if (nativeVteOpened || nativeLeaseRef.current) {
        void setNativeVtePanelVisibility({
          panelId: id,
          visible: true,
          reason: 'restore-resumed',
        })
          .catch(handleNativeLeaseCommandError)
          .finally(() => {
            setNativeVteRecoveryAttempt((attempt) => attempt + 1);
          });
      }
    }

    return undefined;
  }, [connectionState, handleNativeLeaseCommandError, id, nativeVteOpened]);

  useEffect(() => {
    const handleTerminalResumeRequested = (event) => {
      const { panelId } = event.detail || {};
      if (!panelId || panelId !== id) return;
      if (connectionState === 'suspended') return;

      hasSentInitialCommand.current = false;
      nativeInitialCommandInjected.delete(id);
      setTerminalRuntimeNonce((nonce) => nonce + 1);

      if (shouldUseNativeRenderer && nativeVteOpened && initialCommand) {
        const clean = String(initialCommand)
          .replace(/\s*#recovery-\d+\s*$/i, '')
          .trim();
        if (!clean) return;
        void (async () => {
          await Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(
            handleNativeLeaseCommandError
          );
          await pasteNativeVtePanel({ panelId: id, text: `${clean}\n` });
          hasSentInitialCommand.current = true;
          nativeInitialCommandInjected.add(id);
        })();
        return;
      }

      if (shouldBootXterm) {
        reconnect();
      }
    };

    window.addEventListener('devhub:terminal-resume-requested', handleTerminalResumeRequested);
    return () =>
      window.removeEventListener('devhub:terminal-resume-requested', handleTerminalResumeRequested);
  }, [
    connectionState,
    handleNativeLeaseCommandError,
    id,
    initialCommand,
    nativeVteOpened,
    reconnect,
    shouldBootXterm,
    shouldUseNativeRenderer,
  ]);

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

  // Handle focus when tab becomes active
  useEffect(() => {
    if (!autoFocus || !termRef.current || !isActivePanel || !isVisibleInLayout) return undefined;

    const focusTimer = setTimeout(() => {
      reactivateTerminalViewport();
    }, 50);

    return () => clearTimeout(focusTimer);
  }, [autoFocus, isActivePanel, isVisibleInLayout, reactivateTerminalViewport]);

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
    if (shouldAutoReconnectTerminal(connectionState, autoFocus)) {
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
  }, [autoFocus, connectionState, reconnect]);

  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        shouldRunTerminalViewportReactivation({
          isActivePanel,
          isVisibleInLayout,
          documentVisibilityState: document.visibilityState,
        })
      ) {
        logViewportDiagnostic('visibility-visible');
        reactivateTerminalViewport();
        queueNativeVteProbeRetry(0);
      }
    };

    const handleWindowResize = () => {
      logViewportDiagnostic('window-resize');
      sendResize();
      queueNativeVteProbeRetry();
    };
    const handleWindowFocus = () => {
      if (!shouldRunTerminalViewportReactivation({ isActivePanel, isVisibleInLayout })) {
        return;
      }
      logViewportDiagnostic('window-focus');
      reactivateTerminalViewport();
      queueNativeVteProbeRetry(0);
    };
    const handlePageShow = () => {
      if (!shouldRunTerminalViewportReactivation({ isActivePanel, isVisibleInLayout })) {
        return;
      }
      logViewportDiagnostic('pageshow');
      reactivateTerminalViewport();
      queueNativeVteProbeRetry(0);
    };

    const handleLayoutSettled = () => {
      if (isActivePanel && isVisibleInLayout) {
        sendResize();
      }
    };

    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('devhub:terminal-layout-settled', handleLayoutSettled);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('devhub:terminal-layout-settled', handleLayoutSettled);
    };
  }, [
    isActivePanel,
    isVisibleInLayout,
    logViewportDiagnostic,
    queueNativeVteProbeRetry,
    reactivateTerminalViewport,
    sendResize,
  ]);

  // ── Custom context menu for terminal ────────────────────────────────────────
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = termRef.current?.getSelection?.() || '';
    setContextMenu({ x: e.clientX, y: e.clientY, text, canCopy: Boolean(text) });
  }, []);

  const handleViewportMouseDown = useCallback(() => {
    onActivatePanel?.(id);
    if (shouldUseNativeRenderer) {
      if (nativeVteOpened) {
        Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(handleNativeLeaseCommandError);
      }
      return;
    }
    termRef.current?.focus?.();
  }, [
    handleNativeLeaseCommandError,
    id,
    nativeVteOpened,
    onActivatePanel,
    shouldUseNativeRenderer,
  ]);

  const handleCopyFromMenu = useCallback(async () => {
    await handleCopySelection();
    setContextMenu(null);
  }, [handleCopySelection]);

  const handlePasteFromMenu = useCallback(async () => {
    await handlePasteIntoTerminal().catch(() => false);
    setContextMenu(null);
  }, [handlePasteIntoTerminal]);

  const handleViewportPaste = useCallback(
    (e) => {
      if (!shouldUseNativeRenderer) return;
      e.preventDefault();
      e.stopPropagation();
      void handlePasteIntoTerminal().catch(() => false);
    },
    [handlePasteIntoTerminal, shouldUseNativeRenderer]
  );

  useEffect(() => {
    if (!shouldUseNativeRenderer) return;

    const handler = (e) => {
      const rootElement = terminalRootRef.current;
      const activeElement = document?.activeElement || null;
      const eventTarget = e.target instanceof Node ? e.target : null;
      // T-018 fix: the previous check also matched when `isActivePanel` was
      // true, which intercepted paste events fired from OTHER panels (e.g.
      // the right-dock ChatPanel textarea) whenever a terminal happened to
      // be the active workspace panel. Now: the event must actually be
      // for the terminal — focus or target inside the terminal root.
      const belongsToTerminal = Boolean(
        rootElement &&
        ((activeElement && rootElement.contains(activeElement)) ||
          (eventTarget && rootElement.contains(eventTarget)))
      );
      if (!belongsToTerminal) return;

      e.preventDefault();
      e.stopPropagation();
      void handlePasteIntoTerminal().catch(() => false);
    };

    document.addEventListener('paste', handler, true);
    return () => document.removeEventListener('paste', handler, true);
  }, [handlePasteIntoTerminal, isActivePanel, shouldUseNativeRenderer]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // ── Keyboard shortcuts: copy/paste ───────────────────────────────────────────
  useEffect(() => {
    const handler = async (e) => {
      const key = e.key || '';
      const ctrl = e.ctrlKey || false;
      const shift = e.shiftKey || false;
      const alt = e.altKey || false;

      // Log immediately to server
      cliLog('[keydown]', `key=${key} ctrl=${ctrl} shift=${shift} alt=${alt} code=${e.code}`);

      // Determine action
      let action = resolveTerminalClipboardShortcut(e);

      // Fallback: Ctrl+V with native renderer (Ctrl+Shift+V handled above)
      if (!action && shouldUseNativeRenderer && ctrl && !shift && !alt) {
        const norm = key.length === 1 ? key.toLowerCase() : key;
        if (norm === 'v') action = 'paste';
      }

      if (!action) return;

      // Check if event belongs to terminal
      const rootElement = terminalRootRef.current;
      const activeElement = document?.activeElement || null;
      const eventTarget = e.target instanceof Node ? e.target : null;
      // T-018 fix: tightened `belongsToTerminal` — removed `isActivePanel`
      // so that key shortcuts (Ctrl+V/Ctrl+C/Ctrl+Shift+V) fired from
      // other panels (e.g. the right-dock ChatPanel textarea) are not
      // hijacked just because some terminal is the active workspace panel.
      const belongsToTerminal = Boolean(
        rootElement &&
        ((activeElement && rootElement.contains(activeElement)) ||
          (eventTarget && rootElement.contains(eventTarget)))
      );

      cliLog('[keydown]', `action=${action} belongs=${belongsToTerminal}`);

      if (!belongsToTerminal) return;

      e.preventDefault();
      e.stopPropagation();

      if (action === 'paste') {
        cliLog('[keydown]', 'calling handlePasteIntoTerminal');
        await handlePasteIntoTerminal().catch(() => false);
      } else if (action === 'copy') {
        await handleCopySelection();
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [handleCopySelection, handlePasteIntoTerminal, isActivePanel, shouldUseNativeRenderer]);

  const isConnected = connectionState === 'connected';
  const showTerminalViewport =
    shouldShowTerminalViewport(isInitializing, initError) && !shouldUseNativeRenderer;
  const showTerminalStatusOverlay = shouldShowTerminalStatusOverlay(
    isInitializing,
    initError,
    connectionState
  );
  const showLoadingOverlay =
    !shouldUseNativeRenderer && (isInitializing || connectionState === 'connecting');
  const isSuspended = connectionState === 'suspended';
  const statusLabel = isConnected
    ? 'Conectado'
    : connectionState === 'connecting'
      ? 'Conectando...'
      : connectionState === 'terminated'
        ? 'Finalizada'
        : isSuspended
          ? 'Suspendida'
          : 'Desconectado';

  return (
    <div
      ref={terminalRootRef}
      className="flex flex-col h-full w-full overflow-hidden bg-[var(--surface-app)] relative"
      style={{
        ...getTerminalAppShellStyle(),
        pointerEvents: suspendNativeSurface ? 'none' : 'auto',
      }}
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
            {isSuspended && (
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
                data-testid="terminal-close-btn"
                onClick={(event) => {
                  // Phase 4: in singleton mode, close also
                  // hard-destroys the surface (closes WS, XTerm,
                  // removes from provider registry). The
                  // consumer's onClose is then called so it can
                  // remove the shape from its local state.
                  destroySurface();
                  if (typeof onClose === 'function') onClose(event);
                }}
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
          className="relative flex-1 bg-[var(--surface-app)]"
          onContextMenu={handleContextMenu}
          onMouseDown={handleViewportMouseDown}
          onPaste={handleViewportPaste}
          data-testid="terminal-viewport-shell"
          style={{ ...TERMINAL_VIEWPORT_SHELL_STYLE, ...getTerminalViewportFrameStyle() }}
        >
          <div
            ref={nativePlaceholderRef}
            className="relative h-full w-full overflow-hidden"
            data-testid="terminal-content-body"
            style={TERMINAL_NATIVE_CONTENT_BODY_STYLE}
          >
            {shouldUseNativeRenderer ? (
              <div
                className="absolute inset-0 z-0 pointer-events-none"
                data-testid="terminal-native-placeholder"
                aria-hidden="true"
                style={{
                  // Match the exact bg the native VTE uses so when we suspend
                  // (for modals or transient overlays) the web content that
                  // covers it doesn't have a jarring color shift or "black hole".
                  // This is cheap CSS, no capture/IPC cost.
                  background: '#0d1117',
                }}
              />
            ) : null}

            <motion.div
              ref={containerRef}
              className="devhub-xterm-container h-full w-full p-2.5"
              {...getXtermContainerAnimProps(showTerminalViewport)}
            />
          </div>
          {isCanvasMode && (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 z-20 bg-[#0f1724]"
              style={{ imageRendering: 'crisp-edges' }}
            />
          )}
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

          {/* Loading overlay — only during init or connecting */}
          {showLoadingOverlay && (
            <div className="absolute inset-0 bg-[var(--surface-app)]/80 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-10 backdrop-blur-sm">
              <Loader2 className="w-6 h-6 animate-spin text-[#388bfd]" />
              {connectionState === 'connecting' ? 'Conectando...' : 'Iniciando terminal...'}
            </div>
          )}

          {/* Error/Disconnected overlay */}
          {showTerminalStatusOverlay && connectionState !== 'suspended' && (
            <div className="absolute inset-0 bg-[var(--surface-app)]/90 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-10 backdrop-blur-sm">
              <WifiOff className="w-8 h-8 text-red-400" />
              <span className="text-red-400 font-semibold">
                {initError
                  ? 'Terminal no visible todavía'
                  : connectionState === 'error'
                    ? 'Error de conexión'
                    : connectionState === 'terminated'
                      ? 'Sesión finalizada'
                      : 'Desconectado'}
              </span>
              <span className="text-gray-500 text-center max-w-xs">
                {initError ||
                  (connectionState === 'error'
                    ? 'No se pudo conectar al servidor de terminal. Verificá que el servidor esté corriendo.'
                    : connectionState === 'terminated'
                      ? 'La sesión terminó. Reconectá para iniciar una shell nueva sin relanzar el comando inicial.'
                      : 'La conexión con la terminal se perdió.')}
              </span>
              <button
                onClick={reconnect}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e1e1e] border border-white/10 hover:bg-white/10 transition-colors text-gray-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reconectar
              </button>
            </div>
          )}

          {/* Suspended state overlay */}
          {showTerminalStatusOverlay && connectionState === 'suspended' && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-xs text-gray-400 font-mono z-[60] backdrop-blur-sm pointer-events-auto"
              style={{ background: '#0d1117' }}
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
                <span className="ml-auto text-[10px] text-gray-500 font-mono">Ctrl+Shift+V</span>
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
