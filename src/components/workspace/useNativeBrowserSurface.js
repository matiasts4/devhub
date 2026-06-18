'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  closeNativeBrowser,
  focusNativeBrowser,
  loadNativeBrowserUrl,
  openNativeBrowser,
  probeNativeBrowser,
  resizeNativeBrowser,
  setNativeBrowserVisibility,
} from '@/lib/browser/nativeBrowserBridge';

function normalizeNativeCapability(result) {
  return {
    ready: result?.ready === true,
    reason: result?.reason || null,
    persistentProfile: result?.persistentProfile === true,
    capabilities: result?.capabilities || null,
  };
}

const MIN_NATIVE_BROWSER_BOUNDS_HEIGHT = 24;
const MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS = 12;

function rectsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every(
    (r, i) =>
      r.x === b[i].x &&
      r.y === b[i].y &&
      r.width === b[i].width &&
      r.height === b[i].height &&
      r.source === b[i].source
  );
}

function registerNativeAvoidRectListener(onChange) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => {
    const { rect, source, action } = event?.detail || {};
    if (!rect || !source) return;
    onChange({ ...rect, source }, action);
  };
  window.addEventListener('devhub:register-avoid-rect', handler);
  return () => window.removeEventListener('devhub:register-avoid-rect', handler);
}

function isPanelNotFoundReason(reason) {
  return String(reason || '') === 'panel-not-found';
}

function isRecoverableNativeOpenReason(reason) {
  const normalized = String(reason || '');
  return (
    isPanelNotFoundReason(normalized) ||
    normalized === 'missing-bounds' ||
    normalized === 'open-failed'
  );
}

function hasRecoverableNativeBridgeReason(result) {
  return isRecoverableNativeOpenReason(result?.reason);
}

export function useNativeBrowserCapability({ panelId, requested = false }) {
  const [nativeCapability, setNativeCapability] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (!requested) {
      setNativeCapability(null);
      return undefined;
    }

    probeNativeBrowser({
      panelId,
      requestedMode: 'native-gtk',
      tauriAvailable: true,
    }).then((result) => {
      if (cancelled) return;
      setNativeCapability(normalizeNativeCapability(result));
    });

    return () => {
      cancelled = true;
    };
  }, [panelId, requested]);

  return nativeCapability;
}

export function useNativeBrowserSurface({
  panelId,
  url,
  active = false,
  visibleInLayout = false,
  measureBounds,
  observeNode,
  focusOnShow = true,
  layoutSyncKey = null,
}) {
  const nativeLeaseRef = useRef({ opened: false, lastUrl: '' });
  const [nativeRuntimeReady, setNativeRuntimeReady] = useState(false);
  const [nativeError, setNativeError] = useState(null);
  const [openRecoveryAttempt, setOpenRecoveryAttempt] = useState(0);
  const [activeAvoidRects, setActiveAvoidRects] = useState([]);
  const openRecoveryTimerRef = useRef(null);
  const rafRef = useRef(null);
  const openInFlightRef = useRef(false);

  useEffect(() => {
    return registerNativeAvoidRectListener((rect, action) => {
      setActiveAvoidRects((prev) => {
        if (action === 'clear') return [];
        if (action === 'remove') {
          const next = prev.filter((r) => r.source !== rect.source);
          return rectsEqual(next, prev) ? prev : next;
        }
        const without = prev.filter((r) => r.source !== rect.source);
        const next = [...without, rect];
        return rectsEqual(next, prev) ? prev : next;
      });
    });
  }, []);

  const closeActiveNativeLease = useCallback(
    async (reason) => {
      if (!nativeLeaseRef.current.opened) return;
      await closeNativeBrowser({ panelId, reason }).catch(() => {});
      nativeLeaseRef.current = { opened: false, lastUrl: '' };
      openInFlightRef.current = false;
    },
    [panelId]
  );

  const hideActiveNativeLease = useCallback(async () => {
    if (!nativeLeaseRef.current.opened) return;
    const bounds = measureBounds?.();
    await setNativeBrowserVisibility({
      panelId,
      visible: false,
      bounds,
      avoidRects: activeAvoidRects,
    }).catch(() => {});
    openInFlightRef.current = false;
  }, [activeAvoidRects, measureBounds, panelId]);

  const clearOpenRecoveryTimer = useCallback(() => {
    if (openRecoveryTimerRef.current) {
      clearTimeout(openRecoveryTimerRef.current);
      openRecoveryTimerRef.current = null;
    }
  }, []);

  const scheduleOpenRecovery = useCallback(
    (delayMs = 120) => {
      clearOpenRecoveryTimer();
      openRecoveryTimerRef.current = setTimeout(() => {
        openRecoveryTimerRef.current = null;
        setOpenRecoveryAttempt((a) => a + 1);
      }, delayMs);
    },
    [clearOpenRecoveryTimer]
  );

  useEffect(() => {
    return () => clearOpenRecoveryTimer();
  }, [clearOpenRecoveryTimer]);

  useEffect(() => {
    let cancelled = false;

    async function syncNativeSurface() {
      try {
        if (!active || !url) {
          await closeActiveNativeLease('surface-inactive');
          openInFlightRef.current = false;
          if (!cancelled) {
            setNativeRuntimeReady(false);
            setNativeError(null);
          }
          return;
        }

        if (!visibleInLayout) {
          await hideActiveNativeLease();
          openInFlightRef.current = false;
          if (!cancelled) setNativeRuntimeReady(false);
          return;
        }

        if (!cancelled) setNativeError(null);

        const bounds = measureBounds?.();
        const hasGoodBounds = !!(bounds && bounds.height >= MIN_NATIVE_BROWSER_BOUNDS_HEIGHT);
        if (!hasGoodBounds) {
          if (!cancelled) setNativeRuntimeReady(false);
          scheduleOpenRecovery(bounds ? 80 : 160);
          return;
        }

        if (!nativeLeaseRef.current.opened) {
          // Always call open: probe.ready only means the GTK host exists, NOT that this
          // panel_id is registered. Skipping open caused panel-not-found on load/resize.
          // registry_open_panel reuses an existing panel when the pid is already live.
          if (openInFlightRef.current) {
            return;
          }
          openInFlightRef.current = true;
          let result;
          try {
            result = await openNativeBrowser({
              panelId,
              url,
              bounds,
              avoidRects: activeAvoidRects,
            });
          } finally {
            openInFlightRef.current = false;
          }

          if (cancelled || !visibleInLayout) {
            if (result?.opened === true) {
              await closeNativeBrowser({ panelId, reason: 'stale-open-cancelled' }).catch(() => {});
            }
            return;
          }

          if (result?.opened !== true) {
            if (
              hasRecoverableNativeBridgeReason(result) &&
              openRecoveryAttempt < MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS
            ) {
              await closeNativeBrowser({ panelId, reason: 'open-recovery' }).catch(() => {});
              nativeLeaseRef.current = { opened: false, lastUrl: '' };
              if (!cancelled) {
                setNativeRuntimeReady(false);
                setNativeError(null);
                scheduleOpenRecovery(result?.reason === 'missing-bounds' ? 120 : 0);
              }
              return;
            }
            if (!cancelled) {
              setNativeRuntimeReady(false);
              setNativeError(result?.reason || 'open-failed');
            }
            return;
          }

          nativeLeaseRef.current = { opened: true, lastUrl: url };
        } else if (nativeLeaseRef.current.lastUrl !== url) {
          const result = await loadNativeBrowserUrl({ panelId, url });
          if (cancelled) return;

          if (result?.loaded === false) {
            if (
              isPanelNotFoundReason(result?.reason) &&
              openRecoveryAttempt < MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS
            ) {
              await closeNativeBrowser({ panelId, reason: 'load-recovery' }).catch(() => {});
              nativeLeaseRef.current = { opened: false, lastUrl: '' };
              if (!cancelled) {
                setNativeRuntimeReady(false);
                setNativeError(null);
                scheduleOpenRecovery(0);
              }
              return;
            }
            setNativeRuntimeReady(false);
            setNativeError(result?.reason || 'load-failed');
            return;
          }

          nativeLeaseRef.current.lastUrl = url;
        }

        // Re-measure post-open in case the layout continued settling between the
        // decision bounds and the native webview actually being created.
        const postOpenBounds = measureBounds?.();
        const finalBounds =
          postOpenBounds && postOpenBounds.height >= MIN_NATIVE_BROWSER_BOUNDS_HEIGHT
            ? postOpenBounds
            : bounds;

        const resizeResult = await resizeNativeBrowser({
          panelId,
          bounds: finalBounds,
          avoidRects: activeAvoidRects,
        }).catch((error) => ({ reason: error?.message || 'resize-failed' }));
        if (
          hasRecoverableNativeBridgeReason(resizeResult) &&
          openRecoveryAttempt < MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS
        ) {
          await closeNativeBrowser({ panelId, reason: 'resize-recovery' }).catch(() => {});
          nativeLeaseRef.current = { opened: false, lastUrl: '' };
          if (!cancelled) {
            setNativeRuntimeReady(false);
            setNativeError(null);
            scheduleOpenRecovery(0);
          }
          return;
        }
        if (hasRecoverableNativeBridgeReason(resizeResult)) {
          if (!cancelled) {
            setNativeRuntimeReady(false);
            setNativeError(resizeResult?.reason || 'resize-failed');
          }
          return;
        }

        const visibilityResult = await setNativeBrowserVisibility({
          panelId,
          visible: true,
          bounds: finalBounds,
          avoidRects: activeAvoidRects,
        }).catch((error) => ({ reason: error?.message || 'visibility-failed' }));
        if (
          hasRecoverableNativeBridgeReason(visibilityResult) &&
          openRecoveryAttempt < MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS
        ) {
          await closeNativeBrowser({ panelId, reason: 'visibility-recovery' }).catch(() => {});
          nativeLeaseRef.current = { opened: false, lastUrl: '' };
          if (!cancelled) {
            setNativeRuntimeReady(false);
            setNativeError(null);
            scheduleOpenRecovery(0);
          }
          return;
        }
        if (hasRecoverableNativeBridgeReason(visibilityResult)) {
          if (!cancelled) {
            setNativeRuntimeReady(false);
            setNativeError(visibilityResult?.reason || 'visibility-failed');
          }
          return;
        }

        if (focusOnShow) {
          await focusNativeBrowser({ panelId }).catch(() => {});
        }

        if (!cancelled) {
          setNativeError(null);
          setNativeRuntimeReady(true);
          // rAF correction after ready: guarantees the native surface matches the
          // finally laid out web rect even if all previous measures were early.
          // This is the key to stop needing manual resize/refresh to "fix the sol".
          requestAnimationFrame(() => {
            if (cancelled) return;
            const settleBounds = measureBounds?.();
            if (settleBounds && settleBounds.height >= MIN_NATIVE_BROWSER_BOUNDS_HEIGHT) {
              resizeNativeBrowser({
                panelId,
                bounds: settleBounds,
                avoidRects: activeAvoidRects,
              }).catch(() => {});
              setNativeBrowserVisibility({
                panelId,
                visible: true,
                bounds: settleBounds,
                avoidRects: activeAvoidRects,
              }).catch(() => {});
              if (focusOnShow) {
                focusNativeBrowser({ panelId }).catch(() => {});
              }
            }
          });
        }
      } catch (err) {
        // pizarra-browser-fix: any unhandled bridge rejection previously left
        // nativeRuntimeReady in an indeterminate state causing a perpetual
        // loading spinner. Reset to false so WorkspaceBrowserPane can fall back.

        console.error('[useNativeBrowserSurface] syncNativeSurface failed:', err);
        openInFlightRef.current = false;
        if (!cancelled) {
          setNativeRuntimeReady(false);
          setNativeError(err?.message || 'native-browser-sync-failed');
        }
      }
    }

    syncNativeSurface();

    return () => {
      cancelled = true;
      clearOpenRecoveryTimer();
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    active,
    activeAvoidRects,
    closeActiveNativeLease,
    focusOnShow,
    hideActiveNativeLease,
    layoutSyncKey,
    measureBounds,
    openRecoveryAttempt,
    panelId,
    scheduleOpenRecovery,
    url,
    visibleInLayout,
  ]);

  useEffect(
    () => () => {
      clearOpenRecoveryTimer();
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      openInFlightRef.current = false;
      if (!nativeLeaseRef.current.opened) return;
      // Hide on unmount (so native doesn't paint when its controlling view/pane is not active,
      // e.g. during normal <-> pizarra switch for the same browser pid).
      // Do NOT close the webview instance here: close only on explicit browser close/remove
      // or ws level close. This lets the live content survive the owner switch without re-init/re-load.
      hideActiveNativeLease().catch(() => {});
      nativeLeaseRef.current = { opened: false, lastUrl: '' };
    },
    [panelId]
  );

  useEffect(() => {
    if (!active || !nativeRuntimeReady) return undefined;
    if (typeof window === 'undefined' || typeof window.ResizeObserver !== 'function') {
      return undefined;
    }

    const node = observeNode?.current || observeNode;
    if (!node) return undefined;

    const observer = new window.ResizeObserver(() => {
      const bounds = measureBounds?.();
      if (!bounds) return;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const fresh = measureBounds?.() || bounds;
        if (!fresh || fresh.height < MIN_NATIVE_BROWSER_BOUNDS_HEIGHT) {
          if (nativeLeaseRef.current.opened) {
            setNativeBrowserVisibility({
              panelId,
              visible: false,
              bounds: fresh,
              avoidRects: activeAvoidRects,
            }).catch(() => {});
          }
          return;
        }
        resizeNativeBrowser({ panelId, bounds: fresh, avoidRects: activeAvoidRects }).catch(
          () => {}
        );
        setNativeBrowserVisibility({
          panelId,
          visible: visibleInLayout,
          bounds: fresh,
          avoidRects: activeAvoidRects,
        }).catch(() => {});
      });
    });

    observer.observe(node);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      observer.disconnect();
    };
  }, [
    active,
    activeAvoidRects,
    measureBounds,
    nativeRuntimeReady,
    observeNode,
    panelId,
    visibleInLayout,
  ]);

  const retryNative = useCallback(() => {
    setNativeError(null);
    setNativeRuntimeReady(false);
    setOpenRecoveryAttempt((attempt) => attempt + 1);
  }, []);

  return { nativeRuntimeReady, nativeError, retryNative };
}
