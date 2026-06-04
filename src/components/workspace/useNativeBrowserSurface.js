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
  const [openRecoveryAttempt, setOpenRecoveryAttempt] = useState(0);
  const openRecoveryTimerRef = useRef(null);
  const rafRef = useRef(null);
  const openInFlightRef = useRef(false);

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
    await setNativeBrowserVisibility({ panelId, visible: false, bounds }).catch(() => {});
    openInFlightRef.current = false;
  }, [measureBounds, panelId]);

  const clearOpenRecoveryTimer = useCallback(() => {
    if (openRecoveryTimerRef.current) {
      clearTimeout(openRecoveryTimerRef.current);
      openRecoveryTimerRef.current = null;
    }
  }, []);

  const scheduleOpenRecovery = useCallback((delayMs = 120) => {
    clearOpenRecoveryTimer();
    openRecoveryTimerRef.current = setTimeout(() => {
      openRecoveryTimerRef.current = null;
      setOpenRecoveryAttempt((a) => a + 1);
    }, delayMs);
  }, [clearOpenRecoveryTimer]);

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
          }
          return;
        }

        if (!visibleInLayout) {
          await hideActiveNativeLease();
          openInFlightRef.current = false;
          return;
        }

        const bounds = measureBounds?.();
        const hasGoodBounds = !!(bounds && bounds.height >= MIN_NATIVE_BROWSER_BOUNDS_HEIGHT);
        if (!hasGoodBounds) {
          if (!cancelled) setNativeRuntimeReady(false);
          // Schedule recovery as safety; the post-open correction below will also
          // fix up the size shortly after we attempt with whatever (possibly early)
          // bounds we have here. This keeps tests (which may see small rects in jsdom)
          // passing while still self-correcting in real browser layout races.
          if (bounds) {
            scheduleOpenRecovery(80);
          }
        }

        if (!nativeLeaseRef.current.opened) {
          // On view switch (e.g. normal -> pizarra for carried browser pid), the previous
          // controlling pane may have left the webview "opened" (we hide instead of close in cleanup).
          // Probe first: if already live for this pid, just claim the lease (no re-open, which
          // would re-init and cause load delay/blank). Then fall to resize/visible.
          let claimed = false;
          try {
            const probe = await probeNativeBrowser({ panelId, requestedMode: 'native-gtk', tauriAvailable: true }).catch(() => null);
            if (probe && (probe.ready || probe.opened || probe.persistentProfile)) {
              nativeLeaseRef.current = { opened: true, lastUrl: url || '' };
              claimed = true;
            }
          } catch { /* probe failed, will try open */ }

          if (!claimed) {
            if (openInFlightRef.current) {
              // Another recovery bumped while a previous open is still pending.
              // Do not spawn duplicate opens; the pending one will resolve and
              // its closure will handle stale/cancel if the world changed.
              return;
            }
            openInFlightRef.current = true;
            let result;
            try {
              result = await openNativeBrowser({ panelId, url, bounds });
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
              if (!cancelled) setNativeRuntimeReady(false);
              return;
            }

            nativeLeaseRef.current = { opened: true, lastUrl: url };
          }

          // If claimed or just opened, and url changed, ensure loaded (for carry of exact page).
          if (nativeLeaseRef.current.lastUrl !== url) {
            const result = await loadNativeBrowserUrl({ panelId, url });
            if (cancelled) return;

            if (result?.loaded === false) {
              setNativeRuntimeReady(false);
              return;
            }

            nativeLeaseRef.current.lastUrl = url;
          }
        } else if (nativeLeaseRef.current.lastUrl !== url) {
          const result = await loadNativeBrowserUrl({ panelId, url });
          if (cancelled) return;

          if (result?.loaded === false) {
            setNativeRuntimeReady(false);
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

        await resizeNativeBrowser({ panelId, bounds: finalBounds }).catch(() => {});
        await setNativeBrowserVisibility({ panelId, visible: true, bounds: finalBounds }).catch(() => {});

        if (focusOnShow) {
          await focusNativeBrowser({ panelId }).catch(() => {});
        }

        if (!cancelled) {
          setNativeRuntimeReady(true);
          // rAF correction after ready: guarantees the native surface matches the
          // finally laid out web rect even if all previous measures were early.
          // This is the key to stop needing manual resize/refresh to "fix the sol".
          requestAnimationFrame(() => {
            if (cancelled) return;
            const settleBounds = measureBounds?.();
            if (settleBounds && settleBounds.height >= MIN_NATIVE_BROWSER_BOUNDS_HEIGHT) {
              resizeNativeBrowser({ panelId, bounds: settleBounds }).catch(() => {});
              setNativeBrowserVisibility({ panelId, visible: true, bounds: settleBounds }).catch(() => {});
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
        if (!cancelled) setNativeRuntimeReady(false);
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
            setNativeBrowserVisibility({ panelId, visible: false, bounds: fresh }).catch(() => {});
          }
          return;
        }
        resizeNativeBrowser({ panelId, bounds: fresh }).catch(() => {});
        setNativeBrowserVisibility({
          panelId,
          visible: visibleInLayout,
          bounds: fresh,
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
  }, [active, measureBounds, nativeRuntimeReady, observeNode, panelId, visibleInLayout]);

  return { nativeRuntimeReady };
}
