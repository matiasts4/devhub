'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Loader2, RotateCcw, Wifi, WifiOff, X } from 'lucide-react';
import { getTerminalTheme } from '@/components/terminal/TerminalThemeSync';
import {
  closeNativeVtePanel,
  focusNativeVtePanel,
  isNativeVteRuntimeAvailable,
  openNativeVtePanel,
  probeNativeVte,
  resizeNativeVtePanel,
  setNativeVtePanelVisibility,
  subscribeNativeVteEvents,
} from '@/lib/terminal/nativeVteBridge';
import {
  getTerminalRendererFallbackCopy,
  getTerminalRendererOptionLabel,
  getTerminalRendererRuntimeCapabilities,
  resolveRendererSelection,
} from '@/components/terminal/terminalRendererCapabilities';

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
  if (suspendNativeSurface && nativeSurfacePolicy === 'dock-side-by-side') {
    return nativeVteOpened
      ? 'native-opened'
      : nativeVteProbe?.ready
        ? 'native-opening'
        : nativeVteProbe
          ? 'native-probing'
          : 'xterm';
  }
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
    showRecoveryBanner: selection.didFallback,
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
}) {
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

  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState(null);
  const [connectionState, setConnectionState] = useState('idle');
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [restoredToast, setRestoredToast] = useState(false);
  const [nativeVteProbeResult, setNativeVteProbeResult] = useState(null);
  const [nativeVteOpenFailure, setNativeVteOpenFailure] = useState(null);
  const [nativeVteOpened, setNativeVteOpened] = useState(false);
  const [nativeVteProbeAttempt, setNativeVteProbeAttempt] = useState(0);
  const [nativeVteRecoveryAttempt, setNativeVteRecoveryAttempt] = useState(0);
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
  const rendererStatusCopy = getTerminalRendererStatusCopy(rendererViewModel);
  const hasSentInitialCommand = useRef(false);
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
  const shouldBootXterm = shouldBootXtermRuntime({
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
      hideNativeLease('unmount');
    };
  }, [hideNativeLease]);

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
    const bounds = getNativeTerminalBounds(nativePlaceholderRef.current || containerRef.current);
    await Promise.resolve(
      setNativeVtePanelVisibility({
        panelId: id,
        visible: true,
        bounds: bounds || undefined,
      })
    ).catch(handleNativeLeaseCommandError);
  }, [handleNativeLeaseCommandError, id]);

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

  const scrollTerminalToBottom = useCallback(() => {
    if (!termRef.current) return;

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
    fitAndResize();
    scrollTerminalToBottom();
    clearTimers();
    rafRef.current = requestAnimationFrame(() => {
      fitAndResize();
      scrollTerminalToBottom();
    });
    timeoutRef.current = setTimeout(() => {
      fitAndResize();
      scrollTerminalToBottom();
    }, 120);
  }, [fitAndResize, clearTimers, scrollTerminalToBottom]);

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

    const bounds = getNativeTerminalBounds(nativePlaceholderRef.current || containerRef.current);
    if (!bounds) return undefined;

    const nativeOpenRequest = {
      panelId: id,
      bounds,
      cwd: cwd || null,
      initialCommand: initialCommand || null,
      sessionId: id,
    };

    const applyNativeOpenResult = (result) => {
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

    openNativeVtePanel(nativeOpenRequest)
      .then((result) => {
        if (cancelled) return;
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
    if (!nativeVteOpened || requestedRendererMode !== 'vte-experimental') return undefined;
    // dock-side-by-side: VTE coexists with the browser dock — do NOT hide the panel.
    if (nativeSurfacePolicy === 'dock-side-by-side') return undefined;
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
      const bounds = getNativeTerminalBounds(nativePlaceholderRef.current || containerRef.current);
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
    const observedElement = nativePlaceholderRef.current || containerRef.current;
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
  }, [handleNativeLeaseCommandError, id, isVisibleInLayout, nativeVteOpened, suspendNativeSurface]);

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
      const queryParams = [cwdParam, sessionIdParam, legacyIdParam].filter(Boolean).join('&');
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
          console.log(`[TTY:${id}] Sending initial command: ${initialCommand}`);
          if (transportRef.current === 'raw') {
            socket.send(initialCommand + '\r');
          } else {
            socket.send(JSON.stringify({ type: 'input', data: initialCommand + '\r' }));
          }
          hasSentInitialCommand.current = true;
        }
        // Initial focus handled by the other useEffect
      };

      socket.onmessage = (event) => {
        if (transportRef.current === 'raw') {
          if (typeof event.data === 'string' && event.data.length > 0) {
            termRef.current?.write(event.data);
            scrollTerminalToBottom();
          }
          return;
        }

        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'output' && typeof payload.data === 'string') {
            termRef.current?.write(payload.data);
            scrollTerminalToBottom();
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
            termRef.current?.write(event.data);
            scrollTerminalToBottom();
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

  const reconnect = useCallback(() => {
    processExitedRef.current = false;
    cliLog(`CLIENT:${id}`, 'reconnect() called');
    termRef.current?.clear();
    // connect() already silences and closes the stale socket — just call it directly.
    connect();
  }, [connect]);

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

        const ready = await waitForVisibleDimensions();
        cliLog(`CLIENT:${id}`, 'waitForVisibleDimensions done', {
          ready,
          width: containerRef.current?.getBoundingClientRect().width,
          height: containerRef.current?.getBoundingClientRect().height,
        });
        if (!mounted || !containerRef.current) {
          cliLog(
            `CLIENT:${id}`,
            'initializeTerminal() aborted — unmounted after waitForVisibleDimensions'
          );
          setIsInitializing(false);
          return;
        }

        const terminal = new Terminal({
          cursorBlink: true,
          fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
          fontSize: 13,
          lineHeight: 1.4,
          allowTransparency: false,
          theme: getTerminalTheme(),
        });

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(searchAddon);
        terminal.open(containerRef.current);

        logViewportDiagnostic(ready ? 'terminal-open-visible' : 'terminal-open-pending');

        if (ready) {
          fitAddon.fit();
        }

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

        sendResize();
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
    runtimePhase,
    sendResize,
    shouldBootXterm,
    waitForVisibleDimensions,
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
      if (document.visibilityState === 'visible') {
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
      logViewportDiagnostic('window-focus');
      reactivateTerminalViewport();
      queueNativeVteProbeRetry(0);
    };
    const handlePageShow = () => {
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
  }, [logViewportDiagnostic, queueNativeVteProbeRetry, reactivateTerminalViewport, sendResize]);

  // ── Custom context menu for terminal ────────────────────────────────────────
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = termRef.current?.getSelection();
    if (text) {
      setContextMenu({ x: e.clientX, y: e.clientY, text });
    }
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
    if (contextMenu?.text) {
      try {
        await navigator.clipboard.writeText(contextMenu.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Fallback: select all and copy
        const textarea = document.createElement('textarea');
        textarea.value = contextMenu.text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    }
    setContextMenu(null);
  }, [contextMenu]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // ── Keyboard shortcut: Ctrl+Shift+C to copy ─────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        e.stopPropagation();
        const text = termRef.current?.getSelection();
        if (text) {
          navigator.clipboard.writeText(text).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
          });
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

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
    : connectionState === 'connecting'
      ? 'Conectando...'
      : connectionState === 'terminated'
        ? 'Finalizada'
        : 'Desconectado';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[var(--surface-app)] relative">
      {!hideTitleBar && (
        <div className="devhub-drag-handle h-9 bg-[#212121] flex items-center justify-between px-3 shrink-0 border-b border-white/5 select-none hover:bg-[#2a2a2a] transition-colors group/handle cursor-pointer">
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
              onClick={reconnect}
              className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-gray-400 group-hover:text-white" strokeWidth={2} />
            </button>
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
          data-testid="terminal-viewport-shell"
          style={TERMINAL_VIEWPORT_SHELL_STYLE}
        >
          <div
            ref={nativePlaceholderRef}
            className="relative h-full w-full overflow-hidden"
            data-testid="terminal-content-body"
            style={TERMINAL_NATIVE_CONTENT_BODY_STYLE}
          >
            {shouldUseNativeRenderer && (
              <div
                className="absolute inset-0 z-10 rounded-md border border-[rgba(var(--accent-rgb,88,166,255),0.18)] bg-[var(--surface-app)]"
                data-testid="terminal-native-placeholder"
              >
                <div className="h-full w-full" aria-hidden="true" />
              </div>
            )}

            <motion.div
              ref={containerRef}
              className="devhub-xterm-container h-full w-full p-2.5"
              {...getXtermContainerAnimProps(showTerminalViewport)}
            />
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

          {rendererViewModel.showRecoveryBanner && (
            <div
              className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between gap-3 rounded-md border border-amber-400/40 bg-[#1e1a12]/90 px-3 py-2 text-xs text-amber-100 backdrop-blur-sm"
              data-testid="terminal-renderer-fallback-banner"
            >
              <div className="min-w-0">
                <div className="font-semibold" data-testid="terminal-renderer-fallback-title">
                  Renderer en fallback: {rendererViewModel.requestedLabel}
                </div>
                <div className="truncate" data-testid="terminal-renderer-fallback-copy">
                  {rendererStatusCopy}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onResetRendererToXterm?.()}
                className="shrink-0 rounded-md border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-black/30"
                data-testid="terminal-renderer-reset"
              >
                {getTerminalRendererRecoveryActionLabel()}
              </button>
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
          {showTerminalStatusOverlay && (
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

          {/* Copy button — top-right corner */}
          {isConnected && showQuickCopyButton && (
            <button
              onClick={async () => {
                if (termRef.current) {
                  try {
                    const text = termRef.current.getSelection();
                    if (text) {
                      await navigator.clipboard.writeText(text);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }
                  } catch {
                    // Clipboard API may not be available
                  }
                }
              }}
              className="absolute top-2 right-2 z-20 p-1.5 rounded-md bg-[#1e1e1e]/90 border border-white/10 hover:bg-white/10 transition-colors"
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
                background: '#1e1e1e',
                borderColor: '#3a3a3a',
              }}
            >
              <button
                onClick={handleCopyFromMenu}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-lg"
              >
                <Copy className="w-3.5 h-3.5 text-gray-400" />
                Copiar selección
                <span className="ml-auto text-[10px] text-gray-500 font-mono">Ctrl+Shift+C</span>
              </button>
              <div className="h-px bg-[#3a3a3a] mx-2 my-1" />
              <button
                onClick={() => setContextMenu(null)}
                className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a] transition-colors rounded-lg"
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
