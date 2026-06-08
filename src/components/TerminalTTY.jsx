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
import {
  closeNativeVtePanel,
  focusNativeVtePanel,
  isNativeVteRuntimeAvailable,
  openNativeVtePanel,
  pasteNativeVtePanel,
  probeNativeVte,
  resizeNativeVtePanel,
  setNativeVtePanelVisibility,
  subscribeNativeVteEvents,
} from '@/lib/terminal/nativeVteBridge';
import WebglErrorSection from './terminal/components/WebglErrorSection';
import {
  getTerminalRendererFallbackCopy,
  getTerminalRendererOptionLabel,
  getTerminalRendererRuntimeCapabilities,
  getTerminalRendererWebglFallbackCopy,
  probeWebglSupport,
  resolveRendererSelection,
  TERMINAL_WEBGL_FALLBACK_REASONS,
} from '@/components/terminal/terminalRendererCapabilities';
import { getTerminalFontOptions } from '@/components/terminal/TerminalThemeSync';
import { extractOpenCodeSessionId } from '@/lib/terminal/restorePolicyResolver';
import {
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
} from '@/lib/terminal/terminalNoiseFilter';

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

/** Disables xterm focus/mouse reporting so blur/focus does not leak DA garbage to the PTY. */
export const TERMINAL_DISABLE_FOCUS_REPORTING_SEQ =
  '\x1b[?1004l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l';

export function disableTerminalFocusReporting(term) {
  if (!term || typeof term.write !== 'function') return;
  try {
    term.write(TERMINAL_DISABLE_FOCUS_REPORTING_SEQ);
  } catch {
    // terminal may be mid-dispose
  }
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
    message.includes('RenderService') ||
    message.includes('handleResize')
  );
}

// xterm-addon-webgl@0.16.0 keeps `_renderer` (a MutableDisposable) and the
// terminal.onResize listener as separate entries on the addon's internal
// disposable list. When the addon is disposed, the renderer is cleared
// (.value = undefined) BEFORE the resize listener is unregistered. On
// Linux/WebKitGTK the GTK compositor occasionally fires one last
// ResizeObserver / fit() during that window, and the addon's listener crashes
// with `undefined is not an object (evaluating '_this._renderer.value.handleResize')`.
//
// We can't rewrite the addon, but we can replace the live renderer's
// handleResize with a noop right before dispose so a stray resize lands on
// a safe stub instead of an undefined slot. Best-effort: the addon's internal
// shape may evolve, so we guard every access and never throw from here.
function neutralizeWebglAddonForDisposal(addon) {
  if (!addon) return;
  try {
    const renderer = addon._renderer?.value;
    if (renderer && typeof renderer.handleResize === 'function') {
      renderer.handleResize = () => {};
    }
  } catch {
    // ignore — addon internals are private API; if shape changed, skip.
  }
}

export function fitTerminalViewport({
  container,
  fitAddon,
  term,
  socket,
  websocketOpenState = WebSocket.OPEN,
}) {
  if (!container || !fitAddon || !term) return false;
  if (!isTerminalRendererReady(term)) return false;

  const rect = container.getBoundingClientRect();
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

export function getTerminalViewportScrollOffset(term) {
  const activeBuffer = term?.buffer?.active;
  const viewportY = activeBuffer?.viewportY ?? activeBuffer?.ydisp;
  return Number.isInteger(viewportY) ? viewportY : null;
}

export function isTerminalViewportNearBottom(term, threshold = 2) {
  const activeBuffer = term?.buffer?.active;
  const baseY = activeBuffer?.baseY;
  const viewportY = activeBuffer?.viewportY ?? activeBuffer?.ydisp;
  if (!Number.isInteger(baseY) || !Number.isInteger(viewportY)) return false;
  return baseY - viewportY <= threshold;
}

export function restoreTerminalViewportScroll(term, targetViewportY) {
  if (!term || typeof term.scrollToLine !== 'function') return false;
  if (!Number.isInteger(targetViewportY)) return false;

  const buffer = term?.buffer?.active;
  if (!buffer) return false;

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

  const INSET = 1;
  return {
    x: Number(rect.left || 0) + INSET,
    y: Number(rect.top || 0) + INSET,
    width: Math.max(0, width - INSET * 2),
    height: Math.max(0, height - INSET * 2),
  };
}

export function shouldRunTerminalViewportReactivation({
  isActivePanel,
  isVisibleInLayout = true,
  documentVisibilityState,
}) {
  if (documentVisibilityState === 'hidden') return false;
  return isActivePanel && isVisibleInLayout;
}

export function shouldOpenNativeVtePanel({
  isActivePanel,
  isVisibleInLayout = true,
  suspendNativeSurface = false,
  nativeVteOpenFailure,
  nativeVteProbe,
  requestedRendererMode,
  runtimePlatform,
  tauriAvailable,
} = {}) {
  return Boolean(
    isVisibleInLayout &&
    !suspendNativeSurface &&
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

  if (ENABLE_NATIVE_VTE && requestedRendererMode === 'vte-experimental' && nativeVteReady) {
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

// Master switch for the legacy native VTE (GTK) backend.
// We keep the entire implementation (nativeVteBridge, probes, lease logic, etc.)
// in the tree exactly as-is so it can be re-enabled later if needed.
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
  isActivePanel = autoFocus,
  isVisibleInLayout = true,
  suspendNativeSurface = false,
  nativeSurfacePolicy = 'live',
  runtimePlatform,
  showQuickCopyButton = true,
  swarmContext = null,
  connectionState: externalConnectionState,
}) {
  const terminalRootRef = useRef(null);
  const containerRef = useRef(null);

  // We keep the root bg in sync with the terminal theme so there are no
  // "letterbox" flashes or thin frames when the TUI draws full-bleed boxes.
  // The real content (xterm canvas) now starts closer to the panel edges.
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
  const lastViewportYRef = useRef(null);

  const FONT_SIZE_KEY = 'devhub:terminalFontSize';
  const [fontSize, setFontSize] = useState(() => {
    try {
      // Simple local per-device size (persisted via the +/- buttons).
      // Base default is larger (15) + the CSS --terminal-font-weight (now 800)
      // so the letter feels thicker and "más grande" like a comfortable native terminal by default.
      const stored = typeof window !== 'undefined' && window.localStorage.getItem(FONT_SIZE_KEY);
      const parsed = stored ? parseInt(stored, 10) : NaN;
      if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 24) return parsed;
      return 15;
    } catch {
      return 15;
    }
  });

  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState(null);
  const [internalConnectionState, setInternalConnectionState] = useState('idle');
  const connectionState =
    externalConnectionState !== undefined ? externalConnectionState : internalConnectionState;
  const setConnectionState =
    externalConnectionState !== undefined ? () => {} : setInternalConnectionState;
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [restoredToast, setRestoredToast] = useState(false);
  const [nativeVteProbeResult, setNativeVteProbeResult] = useState(null);
  const [nativeVteOpenFailure, setNativeVteOpenFailure] = useState(null);
  const [nativeVteOpened, setNativeVteOpened] = useState(false);
  const [nativeVteProbeAttempt, setNativeVteProbeAttempt] = useState(0);
  const [nativeVteRecoveryAttempt, setNativeVteRecoveryAttempt] = useState(0);
  const [webglProbeResult, setWebglProbeResult] = useState(() => probeWebglSupport());
  const [webglFallback, setWebglFallback] = useState(null);
  const [xtermBootNonce, setXtermBootNonce] = useState(0);
  const webglAddonRef = useRef(null);
  const terminalBlurCleanupRef = useRef(null);
  const tauriAvailable = isNativeVteRuntimeAvailable();
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
  const hasSentInitialCommand = useRef(false);
  const isActivePanelRef = useRef(isActivePanel);
  const processExitedRef = useRef(false);
  const rafRef = useRef(null);
  const timeoutRef = useRef(null);
  const initTimeoutRef = useRef(null);
  const autoScrollRafRef = useRef(null);
  const effectiveRendererModeRef = useRef(rendererViewModel.effectiveMode);
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

  const disposeXtermRuntime = useCallback(() => {
    // 1. Stop observing the container FIRST so no new resize callbacks queue.
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;

    // 2. Cancel any RAF / setTimeout that might call fit() or sendResize()
    //    after the runtime is gone. Without this, a queued RAF can fire
    //    fitAddon.fit() on a terminal that has already started disposing
    //    and trigger the WebGL addon's stale-renderer crash on Linux.
    clearTimers();

    // 3. Silence and close the websocket. Closing it first means the
    //    onmessage/onclose can't push more output into a disposed terminal.
    if (wsRef.current) {
      const stale = wsRef.current;
      stale.onopen = null;
      stale.onmessage = null;
      stale.onerror = null;
      stale.onclose = null;
      try {
        stale.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    if (terminalBlurCleanupRef.current) {
      try {
        terminalBlurCleanupRef.current();
      } catch {
        // ignore
      }
      terminalBlurCleanupRef.current = null;
    }

    // 4. Snapshot refs and null them out IMMEDIATELY. Any concurrent code
    //    (queued resize, focus handler, paste handler) that re-checks the
    //    refs now sees null and bails out before we start tearing things
    //    down. This is the key ordering change for the Linux/WebKitGTK race.
    const webglAddon = webglAddonRef.current;
    const term = termRef.current;
    webglAddonRef.current = null;
    termRef.current = null;
    fitRef.current = null;
    searchRef.current = null;

    // 5. Neutralize the WebGL addon's internal handleResize before any
    //    dispose runs. See neutralizeWebglAddonForDisposal — this is the
    //    fix for the `_renderer.value.handleResize` undefined crash that
    //    xterm-addon-webgl@0.16.0 exposes during teardown.
    neutralizeWebglAddonForDisposal(webglAddon);

    // 6. Dispose the terminal FIRST. xterm's AddonManager will walk the
    //    registered addons (including WebglAddon) in a safe internal order
    //    and detach the resize listener before clearing the renderer slot.
    if (term) {
      try {
        term.dispose();
      } catch (err) {
        if (!isStaleXtermRendererError(err)) {
          console.warn('Error disposing Terminal instance:', err);
        }
      }
    }

    // 7. Defensive second dispose for the addon ref. xterm cascades the
    //    dispose in step 6, but if loadAddon never completed (WebGL context
    //    creation threw) the addon won't be in the AddonManager's list, so
    //    we still need to release its handlers explicitly. dispose() is
    //    idempotent on the official addon.
    if (webglAddon) {
      try {
        webglAddon.dispose?.();
      } catch (err) {
        if (!isStaleXtermRendererError(err)) {
          console.warn('Error disposing WebglAddon:', err);
        }
      }
    }
  }, [clearTimers]);

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

  useEffect(() => {
    isActivePanelRef.current = isActivePanel;
  }, [isActivePanel]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    requestedRendererModeRef.current = requestedRendererMode;
  }, [requestedRendererMode]);

  useEffect(() => {
    effectiveRendererModeRef.current = rendererViewModel.effectiveMode;
  }, [rendererViewModel.effectiveMode]);

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
  }, [requestedRendererMode, rendererViewModel.effectiveMode, webglProbeResult]);

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
      if (!nativeLeaseRef.current) return;
      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      await Promise.resolve(closeNativeVtePanel({ panelId: id, reason })).catch(() => {});
    },
    [id]
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
    },
    [id]
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

  const waitForVisibleDimensions = useCallback(async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const container = containerRef.current;
      if (!container) return false;

      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && document.visibilityState !== 'hidden') {
        return true;
      }

      await new Promise((resolve) => {
        rafRef.current = requestAnimationFrame(() => {
          timeoutRef.current = setTimeout(resolve, 40);
        });
      });
    }

    const rect = containerRef.current?.getBoundingClientRect();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  }, []);

  const fitAndResize = useCallback(() => {
    const fitWorked = fitTerminalViewport({
      container: containerRef.current,
      fitAddon: fitRef.current,
      term: termRef.current,
      socket: wsRef.current,
    });

    logViewportDiagnostic(fitWorked ? 'fit-resize' : 'fit-skipped');
  }, [logViewportDiagnostic]);

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

  const scrollIfActivePanel = useCallback(() => {
    if (isActivePanelRef.current) scrollTerminalToBottom();
  }, [scrollTerminalToBottom]);

  const sendResize = useCallback(() => {
    if (!termRef.current || !fitRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    fitAndResize();
    if (isActivePanel) scrollTerminalToBottom();
    clearTimers();
    rafRef.current = requestAnimationFrame(() => {
      fitAndResize();
      if (isActivePanel) scrollTerminalToBottom();
    });
    timeoutRef.current = setTimeout(() => {
      fitAndResize();
      if (isActivePanel) scrollTerminalToBottom();
    }, 120);
  }, [isActivePanel, fitAndResize, clearTimers, scrollTerminalToBottom]);

  const reactivateTerminalViewport = useCallback(() => {
    logViewportDiagnostic('reactivate-start');
    const repaint = () => {
      stabilizeTerminalRenderer(termRef.current);
      scrollTerminalToBottom();
    };

    sendResize();
    repaint();

    rafRef.current = requestAnimationFrame(() => {
      repaint();

      if (autoFocus) {
        // Same protection as in handleViewportMouseDown: ensure focus reporting
        // is off before we focus, so our activation doesn't inject a focus-in
        // event that triggers DA queries whose responses leak as visible text.
        disableTerminalFocusReporting(termRef.current);
        termRef.current?.focus?.();
      }

      timeoutRef.current = setTimeout(() => {
        sendResize();
        repaint();
        logViewportDiagnostic('reactivate-settled');
      }, 120);
    });
  }, [autoFocus, logViewportDiagnostic, scrollTerminalToBottom, sendResize]);

  useEffect(() => {
    if (!ENABLE_NATIVE_VTE) return undefined;

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

    if (!ENABLE_NATIVE_VTE || requestedRendererMode !== 'vte-experimental') {
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
        setIsInitializing(false);
        clearNativeVteProbeRetryTimer();
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
  const lastEffectiveModeRef = useRef(rendererViewModel.effectiveMode);
  const lastIdRef = useRef(id);
  useEffect(() => {
    if (
      lastRequestedModeRef.current === requestedRendererMode &&
      lastEffectiveModeRef.current === rendererViewModel.effectiveMode &&
      lastIdRef.current === id
    ) {
      return undefined;
    }
    lastRequestedModeRef.current = requestedRendererMode;
    lastEffectiveModeRef.current = rendererViewModel.effectiveMode;
    lastIdRef.current = id;

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
  }, [requestedRendererMode, rendererViewModel.effectiveMode, disposeXtermRuntime, id]);

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

      const writeTerminalOutput = (chunk) => {
        const filtered = filterTerminalOutputForSession(null, chunk);
        if (typeof filtered !== 'string' || filtered.length === 0) return;
        termRef.current?.write(filtered);
        scrollIfActivePanel();
      };

      socket.onmessage = (event) => {
        if (transportRef.current === 'raw') {
          if (typeof event.data === 'string' && event.data.length > 0) {
            writeTerminalOutput(event.data);
          }
          return;
        }

        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'output' && typeof payload.data === 'string') {
            writeTerminalOutput(payload.data);
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
            writeTerminalOutput(event.data);
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
  }, [scrollIfActivePanel, scrollTerminalToBottom, sendResize, cwd, initialCommand, id]);

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
      if (termRef.current) {
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
    const term = termRef.current;
    if (!term) return;

    if (!isActivePanel) {
      disableTerminalFocusReporting(term);
      try {
        if (term.element?.contains(document.activeElement)) {
          term.blur?.();
        }
      } catch {
        // intentional: terminal may already be disposed during unmount
      }
      return;
    }

    disableTerminalFocusReporting(term);
  }, [isActivePanel]);

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
      await Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(
        handleNativeLeaseCommandError
      );
      const pastePayload = { panelId: id };
      if (text) {
        pastePayload.text = text;
      }
      const result = await pasteNativeVtePanel(pastePayload);
      cliLog('[paste]', `pasteNativeVtePanel returned supported=${result?.supported}`);
      return Boolean(result?.supported);
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

    if (!shouldBootXterm) {
      disposeXtermRuntime();
      setInitError(null);
      setIsInitializing(runtimePhase === 'native-probing' || runtimePhase === 'native-opening');

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
        disposeXtermRuntime();
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
        const importList = [
          import('xterm'),
          import('xterm-addon-fit'),
          import('xterm-addon-search'),
        ];
        // Attempt WebGL addon on explicit user choice (requested) even if the snapshot effective
        // was still 'xterm' because the async probe had not arrived yet. The probe only informs
        // the switcher labels and initial resolver; the actual load decides.
        const wantsWebgl = rendererViewModel.effectiveMode === 'xterm-webgl';
        if (wantsWebgl) {
          importList.push(
            import('xterm-addon-webgl').catch((err) => {
              console.warn(`[TTY:${id}] Failed to import xterm-addon-webgl:`, err?.message || err);
              return { failed: true };
            })
          );
        }
        const importResults = await Promise.all(importList);

        const [{ Terminal }, { FitAddon }, { SearchAddon }] = importResults;
        const WebglAddonCtor =
          wantsWebgl && importResults[3] && !importResults[3].failed
            ? importResults[3].WebglAddon
            : null;

        if (!mounted || !containerRef.current) {
          cliLog(
            `CLIENT:${id}`,
            'initializeTerminal() aborted — unmounted or no container (after import)'
          );
          return;
        }

        const theme = getTerminalTheme();
        cliLog(`CLIENT:${id}`, 'computed theme colors', theme);

        // Font configuration comes from CSS variables via the central TerminalThemeSync
        // (opencode-vars.css / globals.css). This keeps the defaults (Kali thick style)
        // in a general CSS layer instead of inside the terminal component.
        const fontOpts = getTerminalFontOptions();

        const terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: 'bar',
          cursorWidth: 2,
          fontFamily: fontOpts.fontFamily || resolveTerminalFontFamily(),
          fontSize: fontSize,
          fontWeight: fontOpts.fontWeight,
          fontWeightBold: fontOpts.fontWeightBold,
          letterSpacing: fontOpts.letterSpacing,
          lineHeight: fontOpts.lineHeight,
          allowTransparency: false,
          // T2.3 — per-pane scrollback buffer (R-BUF-3). The default
          // xterm scrollback is 1000 lines, which is too shallow for
          // director + 4 workers during a swarm launch: the user loses
          // the prompt injection context as soon as the TUI scrolls.
          // 5000 lines per pane × 5 panes = 25K total per launch, well
          // under the xterm memory budget. Per-pane (not global) so
          // single-pane users don't pay the extra memory.
          scrollback: 5000,
          theme: theme,
        });

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(searchAddon);

        terminal.open(containerRef.current);
        disableTerminalFocusReporting(terminal);
        if (terminalBlurCleanupRef.current) {
          terminalBlurCleanupRef.current();
          terminalBlurCleanupRef.current = null;
        }
        const blurTarget = terminal.element || containerRef.current;
        const handleTerminalBlur = () => disableTerminalFocusReporting(terminal);
        blurTarget?.addEventListener('focusout', handleTerminalBlur);
        terminalBlurCleanupRef.current = () => {
          blurTarget?.removeEventListener('focusout', handleTerminalBlur);
        };

        if (wantsWebgl) {
          if (WebglAddonCtor) {
            try {
              const webglAddon = new WebglAddonCtor();
              webglAddonRef.current = webglAddon;

              if (typeof webglAddon.onContextLoss === 'function') {
                webglAddon.onContextLoss(() => {
                  console.warn(`[TTY:${id}] WebGL context lost, falling back to DOM renderer`);
                  try {
                    webglAddon.dispose();
                  } catch {
                    // Ignore double dispose
                  }
                  setWebglFallback({
                    active: true,
                    reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_CONTEXT_LOST,
                  });
                });
              }

              terminal.loadAddon(webglAddon);
              setWebglFallback(null);
              cliLog(`CLIENT:${id}`, 'WebGL addon loaded and attached');
            } catch (err) {
              console.warn(
                `[TTY:${id}] xterm-webgl addon failed to register (WebGL context issue or WebKitGTK limitation)`,
                err?.message || err
              );
              setWebglFallback({
                active: true,
                reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_REGISTER_FAILED,
              });
            }
          } else {
            setWebglFallback({
              active: true,
              reason: TERMINAL_WEBGL_FALLBACK_REASONS.WEBGL_ADDON_IMPORT_FAILED,
            });
          }
        }

        terminal.onData((data) => {
          const filtered = filterTerminalInputForSession(null, data);
          if (filtered === null) return;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            if (transportRef.current === 'raw') {
              wsRef.current.send(filtered);
            } else {
              wsRef.current.send(JSON.stringify({ type: 'input', data: filtered }));
            }
          }
        });

        resizeObserverRef.current = new ResizeObserver(() => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) return;
          logViewportDiagnostic('resize-observer');
          sendResize();
        });
        resizeObserverRef.current.observe(containerRef.current);

        termRef.current = terminal;
        fitRef.current = fitAddon;
        searchRef.current = searchAddon;

        setInitError(null);
        setIsInitializing(false);
        connect();

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

            logViewportDiagnostic(ready ? 'terminal-open-visible' : 'terminal-open-pending');

            if (ready) {
              fitAddon.fit();
              stabilizeTerminalRenderer(termRef.current);
              sendResize();
            } else {
              logViewportDiagnostic('terminal-open-timeout');
            }
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
      // Silence the socket before closing so it doesn't set 'disconnected'
      // on the (possibly re-mounting) component during React Strict Mode double-invoke.
      if (wsRef.current) {
        const stale = wsRef.current;
        stale.onopen = null;
        stale.onmessage = null;
        stale.onerror = null;
        stale.onclose = null;
        stale.close();
        wsRef.current = null;
      }
      disposeXtermRuntime();
    };
  }, [
    clearTimers,
    connect,
    disposeXtermRuntime,
    logViewportDiagnostic,
    requestedRendererMode,
    runtimePhase,
    sendResize,
    shouldBootXterm,
    waitForVisibleDimensions,
    xtermBootNonce,
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
    if (!autoFocus || !termRef.current) return undefined;

    const focusTimer = setTimeout(() => {
      termRef.current?.focus?.();
      scrollTerminalToBottom();
      reactivateTerminalViewport();
    }, 50);

    return () => clearTimeout(focusTimer);
  }, [autoFocus, reactivateTerminalViewport, scrollTerminalToBottom]);

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

    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    isActivePanel,
    isVisibleInLayout,
    logViewportDiagnostic,
    queueNativeVteProbeRetry,
    reactivateTerminalViewport,
    sendResize,
  ]);

  // --- Scroll fix: preserve/restore scroll position when panel visibility changes ---
  useEffect(() => {
    if (!termRef.current) return;
    if (isVisibleInLayout) {
      // Panel just became visible - restore scroll position
      const saved = lastViewportYRef.current;
      if (saved != null) {
        restoreTerminalViewportScroll(termRef.current, saved);
      } else if (isActivePanel) {
        scrollTerminalToBottom(true);
      }
    } else {
      // Panel becoming invisible - save current scroll position
      lastViewportYRef.current = getTerminalViewportScrollOffset(termRef.current);
    }
  }, [isVisibleInLayout, isActivePanel]);

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
    // When the user explicitly clicks this panel to activate it, first turn off
    // focus reporting (1004). This stops xterm from emitting a focus-in escape
    // sequence to the pty just because we are giving it DOM focus.
    // Without this, the TUI/shell receives a "terminal gained focus" event and
    // often responds by sending DA queries. The DA response bytes then get
    // delivered as input and appear as the repeating "1;2c0;276;0c..." garbage
    // pasted into the prompt (and it accumulates on every panel switch).
    disableTerminalFocusReporting(termRef.current);
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
      const belongsToTerminal = Boolean(
        rootElement &&
        ((activeElement && rootElement.contains(activeElement)) ||
          (eventTarget && rootElement.contains(eventTarget)) ||
          isActivePanel)
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

      // Check if event belongs to terminal
      const rootElement = terminalRootRef.current;
      const activeElement = document?.activeElement || null;
      const eventTarget = e.target instanceof Node ? e.target : null;
      const belongsToTerminal = Boolean(
        rootElement &&
        ((activeElement && rootElement.contains(activeElement)) ||
          (eventTarget && rootElement.contains(eventTarget)) ||
          isActivePanel)
      );

      // If we use the native VTE renderer, copy is handled natively by VTE/GTK, not JavaScript.
      if (action === 'copy' && shouldUseNativeRenderer) {
        if (belongsToTerminal) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (!action) return;

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
  const statusLabel = isConnected
    ? 'Conectado'
    : connectionState === 'suspended'
      ? 'Suspendida'
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
            {shouldUseNativeRenderer && (
              <div
                className="absolute inset-0 z-10 rounded-md border bg-[var(--surface-app)]"
                data-testid="terminal-native-placeholder"
                style={getTerminalViewportFrameStyle()}
              >
                <div className="h-full w-full" aria-hidden="true" />
              </div>
            )}

            {webglFallback?.active && requestedRendererMode === 'xterm-webgl' ? (
              <WebglErrorSection
                id={id}
                reason={webglFallback.reason}
                onSwitchToXterm={handleSwitchToXterm}
                onRetry={handleRetryProbe}
              />
            ) : (
              <motion.div
                ref={containerRef}
                className="devhub-xterm-container h-full w-full p-1"
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

          {/* Loading overlay — only during init or connecting */}
          {(isInitializing || connectionState === 'connecting') && (
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
