'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  closeNativeBrowser,
  focusNativeBrowser,
  loadNativeBrowserUrl,
  openNativeBrowser,
  probeNativeBrowser,
  resizeNativeBrowser,
  setNativeBrowserAvoidRects,
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
  workspaceId = null,
  isolateProfile = false,
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

  // Push avoid-rects to host as a dedicated command (Electron subtracts; Tauri may ignore).
  useEffect(() => {
    if (!nativeLeaseRef.current.opened) return;
    setNativeBrowserAvoidRects({ panelId, rects: activeAvoidRects }).catch(() => {});
  }, [activeAvoidRects, panelId]);

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
    // CRITICAL: do NOT pass measureBounds here. On unmount/mode switch the host
    // rect is often 0×0 or mid-layout; writing that into the registry parks the
    // WebContentsView at a wrong size/position and the next show looks "desfasado".
    // Keep last good bounds; only flip visibility so the guest stays warm off-screen.
    await setNativeBrowserVisibility({
      panelId,
      visible: false,
      avoidRects: activeAvoidRects,
    }).catch(() => {});
    openInFlightRef.current = false;
  }, [activeAvoidRects, panelId]);

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
          // Warm park — never destroy the guest on mode/suspend toggles.
          // Destroying WebContentsView/DOM webview is what blanked pizarra on the 2nd switch.
          if (nativeLeaseRef.current.opened) {
            await hideActiveNativeLease();
          }
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
          // Always call open: probe.ready only means the host exists, NOT that this
          // panel_id is registered. Skipping open caused panel-not-found on load/resize.
          // Electron WCV registry reuses an existing panel when the pid is already live
          // (warm handoff after hide — no reload).
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
              workspaceId: workspaceId || undefined,
              isolateProfile: isolateProfile === true,
              visible: true,
            });
            if (typeof console !== 'undefined' && console.debug) {
              console.debug('[useNativeBrowserSurface] open', {
                panelId,
                url,
                bounds,
                visibleInLayout,
                result,
              });
            }
          } finally {
            openInFlightRef.current = false;
          }

          if (cancelled || !visibleInLayout) {
            // Do NOT close — hide so the next host (pizarra ↔ workspace) reclaims warm.
            if (result?.opened === true) {
              nativeLeaseRef.current = { opened: true, lastUrl: url };
              await hideActiveNativeLease();
            }
            return;
          }

          if (result?.opened !== true) {
            if (
              hasRecoverableNativeBridgeReason(result) &&
              openRecoveryAttempt < MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS
            ) {
              // Soft recovery: try hide + re-open, avoid hard destroy when possible.
              await hideActiveNativeLease();
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
          // Mark ready as soon as host accepted open — don't wait for resize chain
          // or the SPA keeps an opaque spinner while WebContentsView is already live.
          if (!cancelled) {
            setNativeError(null);
            setNativeRuntimeReady(true);
          }
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
    isolateProfile,
    layoutSyncKey,
    measureBounds,
    openRecoveryAttempt,
    panelId,
    scheduleOpenRecovery,
    url,
    visibleInLayout,
    workspaceId,
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
      // inactive surfaces stay warm off-screen. Only hide this panel —
      // workspace filter also parks others. Keep lease so remount skips reload.
      hideActiveNativeLease().catch(() => {});
      nativeLeaseRef.current = {
        opened: true,
        lastUrl: nativeLeaseRef.current.lastUrl,
      };
    },
    [panelId, hideActiveNativeLease]
  );

  const resolvedNode = observeNode?.current || observeNode;

  useEffect(() => {
    if (!active || !nativeRuntimeReady) return undefined;
    if (typeof window === 'undefined' || typeof window.ResizeObserver !== 'function') {
      return undefined;
    }

    const node = resolvedNode;
    if (!node) return undefined;

    let cancelled = false;
    let lastPushed = null;
    let settleRaf = null;
    let settleFrames = 0;
    const SETTLE_FRAMES = 24; // ~400ms of position tracking after show/mode switch
    const settleTimers = [];

    const boundsChanged = (a, b) => {
      if (!a || !b) return true;
      return (
        Math.abs(a.x - b.x) > 0.5 ||
        Math.abs(a.y - b.y) > 0.5 ||
        Math.abs(a.width - b.width) > 0.5 ||
        Math.abs(a.height - b.height) > 0.5
      );
    };

    const pushBounds = (immediate = false) => {
      const run = () => {
        if (cancelled) return;
        rafRef.current = null;
        const fresh = measureBounds?.();
        if (!fresh || fresh.height < MIN_NATIVE_BROWSER_BOUNDS_HEIGHT || fresh.width < 2) {
          // Never write zero bounds into the registry — only hide visibility.
          if (nativeLeaseRef.current.opened && !visibleInLayout) {
            setNativeBrowserVisibility({
              panelId,
              visible: false,
              avoidRects: activeAvoidRects,
            }).catch(() => {});
          }
          return;
        }
        if (!boundsChanged(lastPushed, fresh) && visibleInLayout) {
          return; // no-op — stops thrash/flicker
        }
        lastPushed = { ...fresh };
        resizeNativeBrowser({ panelId, bounds: fresh, avoidRects: activeAvoidRects }).catch(
          () => {}
        );
        setNativeBrowserVisibility({
          panelId,
          visible: visibleInLayout,
          bounds: fresh,
          avoidRects: activeAvoidRects,
        }).catch(() => {});
      };

      if (immediate) {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        run();
        return;
      }
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(run);
    };

    const observer = new window.ResizeObserver(() => {
      pushBounds(false);
    });

    observer.observe(node);

    // Track split-drag without flooding IPC (rAF + boundsChanged gate).
    const onDragMove = () => {
      if (!nativeLeaseRef.current.opened) return;
      pushBounds(false);
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onPointerUp);
      pushBounds(true);
    };
    const onPointerDown = () => {
      window.addEventListener('pointermove', onDragMove, { passive: true });
      window.addEventListener('pointerup', onPointerUp, { passive: true });
    };
    const onWindowResize = () => pushBounds(false);
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('resize', onWindowResize, { passive: true });

    // Mode switch / dock layout: host often moves without a size change, so RO
    // alone never fires. Track position for a short settle window + delayed snaps.
    const settleTick = () => {
      settleRaf = null;
      if (cancelled || !visibleInLayout) return;
      pushBounds(true);
      settleFrames += 1;
      if (settleFrames < SETTLE_FRAMES) {
        settleRaf = requestAnimationFrame(settleTick);
      }
    };
    settleFrames = 0;
    settleRaf = requestAnimationFrame(settleTick);
    for (const ms of [32, 80, 160, 320, 600]) {
      settleTimers.push(setTimeout(() => pushBounds(true), ms));
    }

    pushBounds(true);

    return () => {
      cancelled = true;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (settleRaf != null) cancelAnimationFrame(settleRaf);
      for (const t of settleTimers) clearTimeout(t);
      observer.disconnect();
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onWindowResize);
    };
  }, [
    active,
    activeAvoidRects,
    layoutSyncKey,
    measureBounds,
    nativeRuntimeReady,
    resolvedNode,
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
