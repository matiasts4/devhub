/**
 * useTerminalNativeVteLifecycle — native GTK/VTE surface orchestration.
 * Extracted from TerminalTTY.jsx (terminal-decompose Slice 4).
 *
 * This code is mostly dead in production (ENABLE_NATIVE_VTE is false outside
 * tests), but the test path must stay intact. The hook receives the big ref-bag
 * via ctxRef and returns the small surface of callbacks that the rest of TTY
 * still consumes.
 */
/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps -- ctxRef bag */
import { useCallback, useEffect } from 'react';
import { cliLog, getNativeTerminalBounds } from '@/components/terminal/TerminalTTY.helpers';
import {
  clearNativeVteLease,
  consumeHiddenNativeVteLease,
  hasHiddenNativeVteLease,
  markNativeVteLeaseHidden,
} from '@/lib/terminal/nativeVteLayoutLifecycle';
import { NATIVE_VTE_STUBS } from '@/lib/terminal/nativeVteNoopStubs';
import { readPanelSessionExit } from '@/lib/terminal/agentSessionExit';

const MAX_NATIVE_VTE_PROBE_RETRIES = 4;
const ENABLE_NATIVE_VTE = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

const {
  setNativeVtePanelVisibility,
  openNativeVtePanel,
  closeNativeVtePanel,
  resizeNativeVtePanel,
  focusNativeVtePanel,
  probeNativeVte,
  shouldOpenNativeVtePanel,
} = NATIVE_VTE_STUBS;

export default function useTerminalNativeVteLifecycle({
  ctxRef,
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
}) {
  const tauriAvailable = false;

  const clearNativeVteProbeRetryTimer = useCallback(() => {
    const { nativeVteProbeRetryTimerRef, nativeVteProbeRetryDelayRef } = ctxRef.current;
    if (!nativeVteProbeRetryTimerRef.current) return;

    clearTimeout(nativeVteProbeRetryTimerRef.current);
    nativeVteProbeRetryTimerRef.current = null;
    nativeVteProbeRetryDelayRef.current = null;
  }, [ctxRef]);

  const shouldRetryNativeVteProbe =
    ENABLE_NATIVE_VTE &&
    isActivePanel &&
    requestedRendererMode === 'vte-experimental' &&
    !nativeVteOpened &&
    !nativeVteOpenFailure &&
    nativeVteProbeResult?.ready === false &&
    nativeVteProbeResult?.reason === 'probe-failed';

  useEffect(() => {
    ctxRef.current.shouldRetryNativeVteProbeRef.current = shouldRetryNativeVteProbe;
  }, [shouldRetryNativeVteProbe, ctxRef]);

  const queueNativeVteProbeRetry = useCallback(
    (delayMs = 80) => {
      const {
        shouldRetryNativeVteProbeRef,
        nativeVteProbeRetryCountRef,
        setNativeVteProbeAttempt,
      } = ctxRef.current;

      if (!shouldRetryNativeVteProbeRef.current) return;
      if (nativeVteProbeRetryCountRef.current >= MAX_NATIVE_VTE_PROBE_RETRIES) return;

      if (delayMs <= 0) {
        clearNativeVteProbeRetryTimer();
        nativeVteProbeRetryCountRef.current += 1;
        setNativeVteProbeAttempt((attempt) => attempt + 1);
        return;
      }

      const { nativeVteProbeRetryTimerRef, nativeVteProbeRetryDelayRef } = ctxRef.current;
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
    [clearNativeVteProbeRetryTimer, ctxRef]
  );

  const closeNativeLease = useCallback(
    async (reason = 'deactivate') => {
      const {
        id,
        restoredHiddenLeaseThisMountRef,
        requestedRendererModeRef,
        nativeLeaseRef,
        setNativeVteOpened,
      } = ctxRef.current;

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
    [ctxRef]
  );

  const hideNativeLease = useCallback(
    async (reason = 'inactive') => {
      const { id, nativeLeaseRef } = ctxRef.current;
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
    [ctxRef]
  );

  const handleNativeLeaseCommandError = useCallback(
    (error) => {
      const {
        nativeLeaseRef,
        setNativeVteOpened,
        setNativeVteOpenFailure,
        nativeVteProbeRetryCountRef,
        setNativeVteRecoveryAttempt,
      } = ctxRef.current;
      const reason = String(error?.message || error || '');
      if (!reason.includes('panel-not-active')) return;

      nativeLeaseRef.current = false;
      setNativeVteOpened(false);
      setNativeVteOpenFailure(null);
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
      setNativeVteRecoveryAttempt((attempt) => attempt + 1);
    },
    [clearNativeVteProbeRetryTimer, ctxRef]
  );

  const showNativeLease = useCallback(async () => {
    const { id, nativeLeaseRef, containerRef, nativePlaceholderRef } = ctxRef.current;
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
  }, [handleNativeLeaseCommandError, ctxRef]);

  const resizeNativeLease = useCallback(async () => {
    const { id, nativeLeaseRef, containerRef, nativePlaceholderRef } = ctxRef.current;
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
  }, [handleNativeLeaseCommandError, ctxRef]);

  const showAndResizeNativeLease = useCallback(async () => {
    await showNativeLease();
    await resizeNativeLease();
  }, [resizeNativeLease, showNativeLease]);

  // Probe the native VTE backend when vte-experimental is requested.
  useEffect(() => {
    const {
      id,
      setNativeVteProbeResult,
      setNativeVteOpenFailure,
      setNativeVteOpened,
      nativeVteProbeRetryCountRef,
    } = ctxRef.current;

    let cancelled = false;
    const prevMode = ctxRef.current.prevRequestedRendererModeRef?.current;
    if (ctxRef.current.prevRequestedRendererModeRef) {
      ctxRef.current.prevRequestedRendererModeRef.current = requestedRendererMode;
    }

    if (!ENABLE_NATIVE_VTE || requestedRendererMode !== 'vte-experimental') {
      setNativeVteProbeResult(null);
      setNativeVteOpenFailure(null);
      setNativeVteOpened(false);
      nativeVteProbeRetryCountRef.current = 0;
      clearNativeVteProbeRetryTimer();
      if (prevMode === 'vte-experimental' || ctxRef.current.nativeLeaseRef.current) {
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
    ctxRef,
    isActivePanel,
    nativeVteProbeAttempt,
    requestedRendererMode,
    isVisibleInLayout,
  ]);

  // Queue a probe retry when the retry predicate becomes true.
  useEffect(() => {
    if (!shouldRetryNativeVteProbe) return undefined;

    queueNativeVteProbeRetry(160);
    return undefined;
  }, [queueNativeVteProbeRetry, shouldRetryNativeVteProbe]);

  // Open the native VTE panel when conditions allow.
  useEffect(() => {
    const {
      id,
      cwd,
      initialCommand,
      containerRef,
      nativePlaceholderRef,
      nativeLeaseRef,
      setNativeVteOpenFailure,
      setNativeVteOpened,
      setConnectionState,
      setSessionExitReason,
      processExitedRef,
      setIsInitializing,
      clearNativeVteProbeRetryTimer,
    } = ctxRef.current;

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
      const { nativeVteProbeRetryCountRef } = ctxRef.current;
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
    ctxRef,
    handleNativeLeaseCommandError,
    isActivePanel,
    isVisibleInLayout,
    nativeVteOpenFailure,
    nativeVteOpened,
    nativeVteProbeResult,
    nativeVteRecoveryAttempt,
    requestedRendererMode,
    resolvedRuntimePlatform,
    showAndResizeNativeLease,
    suspendNativeSurface,
    tauriAvailable,
  ]);

  // Retry opening when the container bounds recover from a zero-size state.
  useEffect(() => {
    const { id, containerRef, nativePlaceholderRef, setNativeVteRecoveryAttempt } = ctxRef.current;

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
    ctxRef,
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

  // Hide the native lease when the panel loses visibility.
  useEffect(() => {
    if (!nativeVteOpened || requestedRendererMode !== 'vte-experimental') return undefined;

    if (nativeSurfacePolicy === 'dock-side-by-side') {
      if (isVisibleInLayout && !suspendNativeSurface) return undefined;
      (async () => {
        try {
          await setNativeVtePanelVisibility({
            panelId: ctxRef.current.id,
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
          panelId: ctxRef.current.id,
          visible: false,
          reason: suspendNativeSurface ? 'suspended' : undefined,
        });
      } catch (error) {
        handleNativeLeaseCommandError(error);
      }
    })();

    return undefined;
  }, [
    ctxRef,
    handleNativeLeaseCommandError,
    isVisibleInLayout,
    nativeSurfacePolicy,
    nativeVteOpened,
    requestedRendererMode,
    suspendNativeSurface,
  ]);

  // Hide the native lease when the renderer mode changes away from vte-experimental.
  useEffect(() => {
    const { id, nativeLeaseRef } = ctxRef.current;
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
  }, [ctxRef, handleNativeLeaseCommandError, nativeVteOpened, requestedRendererMode]);

  // Sync native surface visibility with workspace layout events.
  useEffect(() => {
    const { id, hideTimerRef, nativeLeaseRef } = ctxRef.current;

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
    ctxRef,
    hideNativeLease,
    isVisibleInLayout,
    nativeSurfacePolicy,
    requestedRendererMode,
    showAndResizeNativeLease,
    suspendNativeSurface,
  ]);

  // Hide the native lease when the panel is in vte mode but not visible in layout.
  useEffect(() => {
    const { id } = ctxRef.current;
    if (requestedRendererMode !== 'vte-experimental' || isVisibleInLayout) return undefined;

    Promise.resolve(
      setNativeVtePanelVisibility({
        panelId: id,
        visible: false,
        reason: 'layout-hidden',
      })
    ).catch(handleNativeLeaseCommandError);

    return undefined;
  }, [ctxRef, handleNativeLeaseCommandError, isVisibleInLayout, requestedRendererMode]);

  // Re-show native VTE after layout becomes visible again.
  useEffect(() => {
    const { id, nativeLeaseRef } = ctxRef.current;
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
      ctxRef.current.setNativeVteOpened(true);
    }

    const timers = [0, 80, 180, 400, 800].map((delayMs) =>
      setTimeout(() => {
        if (!ctxRef.current.isVisibleInLayoutRef.current) return;
        showAndResizeNativeLease();
      }, delayMs)
    );

    return () => {
      timers.forEach((timerId) => clearTimeout(timerId));
    };
  }, [
    ctxRef,
    isVisibleInLayout,
    nativeSurfacePolicy,
    nativeVteOpened,
    requestedRendererMode,
    showAndResizeNativeLease,
    suspendNativeSurface,
  ]);

  // Focus the native VTE panel when it is active and autoFocus is enabled.
  useEffect(() => {
    const { id } = ctxRef.current;
    if (!nativeVteOpened || suspendNativeSurface || !autoFocus || !isActivePanel) return undefined;

    Promise.resolve(focusNativeVtePanel({ panelId: id })).catch(handleNativeLeaseCommandError);
    return undefined;
  }, [
    autoFocus,
    ctxRef,
    handleNativeLeaseCommandError,
    isActivePanel,
    nativeVteOpened,
    suspendNativeSurface,
  ]);

  // Resize the native VTE panel on container size changes.
  useEffect(() => {
    const {
      id,
      containerRef,
      nativePlaceholderRef,
      nativeResizeObserverRef,
      nativeResizeRafRef,
      nativeResizeSettleTimersRef,
      isDisposingRef,
    } = ctxRef.current;

    if (!nativeVteOpened || !isVisibleInLayout) return undefined;
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
    ctxRef,
    handleNativeLeaseCommandError,
    isVisibleInLayout,
    nativeSurfacePolicy,
    nativeVteOpened,
    suspendNativeSurface,
  ]);

  return {
    closeNativeLease,
    hideNativeLease,
    showAndResizeNativeLease,
    handleNativeLeaseCommandError,
    queueNativeVteProbeRetry,
    clearNativeVteProbeRetryTimer,
  };
}
