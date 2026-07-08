'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  closeNativeBrowser,
  focusNativeBrowser,
  loadNativeBrowserUrl,
  openNativeBrowser,
  probeNativeBrowser,
  resizeNativeBrowser,
  raiseNativeBrowser,
  setNativeBrowserVisibility,
  awaitNativeBrowserStartupSweep,
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
const MAX_BOUNDS_SETTLE_FRAMES = 8;

function boundsAreGood(bounds) {
  return !!(
    bounds &&
    Number(bounds.width) >= 48 &&
    Number(bounds.height) >= MIN_NATIVE_BROWSER_BOUNDS_HEIGHT
  );
}

function boundsArePlausible(bounds) {
  if (!boundsAreGood(bounds)) return false;
  if (typeof window === 'undefined') return true;
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  if (vw <= 0 || vh <= 0) return true;
  const TOP_CHROME_PX = 48;
  // Full-height right dock panels are expected. Only reject native overlays that
  // start above the workspace tab bar and are wide enough to steal toolbar clicks.
  if (bounds.y < TOP_CHROME_PX && bounds.width > vw * 0.35) {
    return false;
  }
  return true;
}

function waitForStableBounds(measureBounds, maxFrames = MAX_BOUNDS_SETTLE_FRAMES) {
  return new Promise((resolve) => {
    const first = measureBounds?.() || null;
    if (boundsSafeForNativeOpen(first)) {
      resolve(first);
      return;
    }

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      resolve(first);
      return;
    }

    let attempts = 0;
    let lastGood = null;
    const tick = () => {
      const measured = measureBounds?.() || null;
      if (boundsSafeForNativeOpen(measured)) {
        lastGood = measured;
        resolve(measured);
        return;
      }
      if (boundsAreGood(measured)) {
        lastGood = measured;
      }
      if (attempts >= maxFrames) {
        resolve(lastGood || measured);
        return;
      }
      attempts += 1;
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

function urlsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    return new URL(String(a)).href === new URL(String(b)).href;
  } catch {
    return false;
  }
}

function boundsSafeForNativeOpen(bounds) {
  if (!boundsArePlausible(bounds)) return false;
  if (typeof window === 'undefined') return boundsAreGood(bounds);
  return Number(bounds.y) >= 48;
}

function resolveOpenBounds(bounds, { rightInsetPx = 0, avoidRects = [] } = {}) {
  if (!boundsSafeForNativeOpen(bounds)) return null;
  return shrinkBoundsForOverlays(bounds, { rightInsetPx, avoidRects });
}

// Ongoing resize/move sync must not use the dock open gate (y >= 48). Pizarra
// cards and fullscreen takeover routinely sit above that line; rejecting them
// left the HWND frozen while the React chrome moved.
function resolveSyncBounds(bounds, { rightInsetPx = 0, avoidRects = [] } = {}) {
  if (!boundsAreGood(bounds)) return null;
  return shrinkBoundsForOverlays(bounds, { rightInsetPx, avoidRects });
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function intersectionArea(a, b) {
  if (!rectsIntersect(a, b)) return 0;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

// ponytail: Windows embedded path ignores avoid_rects in Rust — shrink/hide in JS instead.
// Supports right-side dock overlays (edit panel) and full-screen modal holes (>55% overlap).
function shrinkBoundsForOverlays(bounds, { rightInsetPx = 0, avoidRects = [] } = {}) {
  if (!boundsAreGood(bounds)) return null;

  let { x, y, width, height } = bounds;
  const area = Math.max(width * height, 1);

  if (rightInsetPx > 0) {
    const inset = Math.min(Math.max(rightInsetPx, 0), Math.max(width - 64, 0));
    width -= inset;
  }

  for (const rect of avoidRects) {
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    const hole = {
      x: Number(rect.x) || 0,
      y: Number(rect.y) || 0,
      width: Number(rect.width) || 0,
      height: Number(rect.height) || 0,
    };
    const candidate = { x, y, width, height };
    if (intersectionArea(candidate, hole) / area > 0.55) {
      return null;
    }
    // Top chrome hole (toolbar/modal): push the native surface down.
    if (
      hole.y <= y + 4 &&
      hole.y + hole.height > y &&
      hole.x <= x + width &&
      hole.x + hole.width >= x
    ) {
      const push = Math.max(0, hole.y + hole.height - y);
      y += push;
      height = Math.max(height - push, MIN_NATIVE_BROWSER_BOUNDS_HEIGHT);
    }
    // Right-side overlay: leave room for React panels rendered above the viewport.
    if (hole.x >= x + width * 0.45 && hole.x < x + width) {
      const trim = Math.max(0, x + width - hole.x + 12);
      width = Math.max(width - trim, 64);
    }
  }

  if (!boundsAreGood({ x, y, width, height })) return null;
  return { x, y, width, height };
}

function bridgeReason(result, fallback) {
  if (result?.reason) return String(result.reason);
  return fallback;
}

function boundsMatchCache(prev, rounded) {
  if (!prev || !rounded) return false;
  return (
    prev.x === rounded.x &&
    prev.y === rounded.y &&
    prev.width === rounded.width &&
    prev.height === rounded.height
  );
}

async function applyNativeBoundsOnce(
  panelId,
  rounded,
  avoidRects,
  { visible = true, resizeOnly = false } = {}
) {
  const cacheKey = applyNativeBounds.__cacheKey || (applyNativeBounds.__cacheKey = {});
  const prev = cacheKey[panelId] || null;
  const sameBounds = boundsMatchCache(prev, rounded);

  if (prev && prev.visible === visible && sameBounds) {
    return { ok: true };
  }

  if (!visible) {
    // Keep HWND sized while hidden so reveal does not flash the old box.
    if (rounded && boundsAreGood(rounded) && !sameBounds) {
      const resizeWhileHidden = await resizeNativeBrowser({
        panelId,
        bounds: rounded,
        avoidRects,
      });
      if (resizeWhileHidden?.reason) {
        delete cacheKey[panelId];
        return { ok: false, reason: bridgeReason(resizeWhileHidden, 'resize-failed') };
      }
    }
    if (prev?.visible === false && sameBounds) {
      return { ok: true };
    }
    const hideResult = await setNativeBrowserVisibility({
      panelId,
      visible: false,
      bounds: rounded || undefined,
      avoidRects,
    });
    if (hideResult?.reason) {
      delete cacheKey[panelId];
      return { ok: false, reason: bridgeReason(hideResult, 'hide-failed') };
    }
    cacheKey[panelId] = { ...(rounded || {}), visible: false };
    return { ok: true };
  }

  if (!boundsAreGood(rounded)) return { ok: false, reason: 'missing-bounds' };

  const resizeResult = await resizeNativeBrowser({
    panelId,
    bounds: rounded,
    avoidRects,
  });
  if (resizeResult?.reason) {
    delete cacheKey[panelId];
    return { ok: false, reason: bridgeReason(resizeResult, 'resize-failed') };
  }
  if (!resizeOnly || prev?.visible !== true) {
    const showResult = await setNativeBrowserVisibility({
      panelId,
      visible: true,
      bounds: rounded,
      avoidRects,
    });
    if (showResult?.reason) {
      delete cacheKey[panelId];
      return { ok: false, reason: bridgeReason(showResult, 'show-failed') };
    }
  }
  cacheKey[panelId] = { ...rounded, visible: true };
  return { ok: true };
}

// ponytail: rAF fires every frame — coalesce to latest request so an older resize
// cannot land after a newer one (stuck intermediate size).
async function applyNativeBounds(
  panelId,
  bounds,
  avoidRects,
  { visible = true, resizeOnly = false } = {}
) {
  const rounded =
    bounds && boundsAreGood(bounds)
      ? {
          x: Math.round(Number(bounds.x) || 0),
          y: Math.round(Number(bounds.y) || 0),
          width: Math.round(Number(bounds.width) || 0),
          height: Math.round(Number(bounds.height) || 0),
        }
      : null;

  const pending = applyNativeBounds.__pending || (applyNativeBounds.__pending = {});
  const chains = applyNativeBounds.__chains || (applyNativeBounds.__chains = {});

  pending[panelId] = { rounded, avoidRects, visible, resizeOnly };

  const prev = chains[panelId] || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      let lastResult = { ok: true };
      while (pending[panelId]) {
        const req = pending[panelId];
        delete pending[panelId];
        lastResult = await applyNativeBoundsOnce(panelId, req.rounded, req.avoidRects, {
          visible: req.visible,
          resizeOnly: req.resizeOnly,
        });
      }
      return lastResult;
    });

  chains[panelId] = next.finally(() => {
    if (chains[panelId] === next) {
      delete chains[panelId];
    }
  });

  return next;
}

function invalidateNativeBoundsCache(panelId) {
  const cacheKey = applyNativeBounds.__cacheKey;
  if (cacheKey && panelId) delete cacheKey[panelId];
}

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
    normalized.startsWith('open-failed')
  );
}

function hasRecoverableNativeBridgeReason(result) {
  return isRecoverableNativeOpenReason(result?.reason);
}

export { boundsAreGood, boundsArePlausible, applyNativeBounds, resolveSyncBounds };

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
  observeNode = null,
  // ponytail: default false — auto-focus on every bounds sync stole clicks/keyboard from the
  // React toolbar (URL, back/forward/reload). Focus only via explicit viewport click.
  focusOnShow = false,
  layoutSyncKey = null,
  // Gate first open until dock placeholder + heavy surfaces are measured (cold-start).
  layoutReady = true,
  occludeNative = false,
  occludeUntilReady = false,
  rightInsetPx = 0,
}) {
  const nativeLeaseRef = useRef({ opened: false, lastUrl: '' });
  const [nativeRuntimeReady, setNativeRuntimeReady] = useState(false);
  const [nativeError, setNativeError] = useState(null);
  const openRecoveryAttemptRef = useRef(0);
  const [recoveryNonce, setRecoveryNonce] = useState(0);
  const [activeAvoidRects, setActiveAvoidRects] = useState([]);
  const activeAvoidRectsRef = useRef(activeAvoidRects);
  const openRecoveryTimerRef = useRef(null);
  const boundsSyncRafRef = useRef(null);
  const boundsSyncSettleTimersRef = useRef([]);
  const openSettleTimersRef = useRef([]);
  const observeNodeRef = useRef(observeNode);
  const openInFlightRef = useRef(false);
  const lastOpenAtRef = useRef(0);
  const occludeNativeRef = useRef(occludeNative);
  const occludeUntilReadyRef = useRef(occludeUntilReady);
  const rightInsetPxRef = useRef(rightInsetPx);
  const surfaceRevealedRef = useRef(false);
  const forceBoundsSyncRef = useRef(true);

  useEffect(() => {
    observeNodeRef.current = observeNode;
  }, [observeNode]);
  const focusNativeViewport = useCallback(() => {
    if (!nativeLeaseRef.current.opened) return;
    raiseNativeBrowser({ panelId }).catch(() => {});
    focusNativeBrowser({ panelId }).catch(() => {});
  }, [panelId]);

  useEffect(() => {
    occludeNativeRef.current = occludeNative;
  }, [occludeNative]);

  useEffect(() => {
    occludeUntilReadyRef.current = occludeUntilReady;
  }, [occludeUntilReady]);

  useEffect(() => {
    rightInsetPxRef.current = rightInsetPx;
  }, [rightInsetPx]);

  useEffect(() => {
    surfaceRevealedRef.current = false;
  }, [panelId]);

  // layoutSyncKey / epoch: cache-bust + force next apply — never reopen (reopen loops on resize).
  // Without forceBoundsSyncRef, rAF/RO skip when CSS rects match last local copy while IPC
  // cache was cleared (dock drag end), leaving WebView2 stuck at the pre-drag size.
  useEffect(() => {
    if (layoutSyncKey == null) return;
    invalidateNativeBoundsCache(panelId);
    forceBoundsSyncRef.current = true;
  }, [layoutSyncKey, panelId]);

  // DPI / display / visibility: bust IPC cache and force a re-measure apply.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const bust = () => {
      invalidateNativeBoundsCache(panelId);
      forceBoundsSyncRef.current = true;
    };
    window.addEventListener('resize', bust);
    window.addEventListener('visibilitychange', bust);
    return () => {
      window.removeEventListener('resize', bust);
      window.removeEventListener('visibilitychange', bust);
    };
  }, [panelId]);

  useEffect(() => {
    if (!nativeError || !nativeLeaseRef.current.opened) return undefined;
    applyNativeBounds(panelId, measureBounds?.() || null, activeAvoidRectsRef.current, {
      visible: false,
    }).catch(() => {});
    return undefined;
  }, [measureBounds, nativeError, panelId]);

  const layoutOverlayOptions = useCallback(
    () => ({
      rightInsetPx: rightInsetPxRef.current,
      avoidRects: activeAvoidRectsRef.current,
    }),
    []
  );

  const syncNativeBounds = useCallback(
    async (bounds, avoidRects, { reveal = false } = {}) => {
      if (reveal) {
        surfaceRevealedRef.current = true;
      }
      const visible =
        !occludeNativeRef.current && (!occludeUntilReadyRef.current || surfaceRevealedRef.current);
      await applyNativeBounds(panelId, bounds, avoidRects, { visible, resizeOnly: visible });
    },
    [panelId]
  );

  useEffect(() => {
    if (!active || !nativeLeaseRef.current.opened) return undefined;
    const avoidRects = activeAvoidRectsRef.current;
    if (occludeNative) {
      applyNativeBounds(panelId, measureBounds?.() || null, avoidRects, { visible: false }).catch(
        () => {}
      );
      return undefined;
    }
    const bounds = resolveOpenBounds(measureBounds?.(), layoutOverlayOptions());
    if (bounds && surfaceRevealedRef.current) {
      applyNativeBounds(panelId, bounds, avoidRects, { visible: true }).catch(() => {});
    }
    return undefined;
  }, [active, layoutOverlayOptions, measureBounds, occludeNative, panelId]);

  useEffect(() => {
    activeAvoidRectsRef.current = activeAvoidRects;
  }, [activeAvoidRects]);

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
      const cacheKey = applyNativeBounds.__cacheKey;
      if (cacheKey) delete cacheKey[panelId];
    },
    [panelId]
  );

  const reregisterNativePanel = useCallback(
    async (targetUrl, bounds) => {
      nativeLeaseRef.current = { opened: false, lastUrl: '' };
      const result = await openNativeBrowser({
        panelId,
        url: targetUrl,
        bounds,
        avoidRects: activeAvoidRectsRef.current,
      });
      if (result?.opened === true) {
        nativeLeaseRef.current = { opened: true, lastUrl: targetUrl };
        return true;
      }
      return false;
    },
    [panelId]
  );

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
        openRecoveryAttemptRef.current += 1;
        if (openRecoveryAttemptRef.current <= MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS) {
          setRecoveryNonce((value) => value + 1);
        }
      }, delayMs);
    },
    [clearOpenRecoveryTimer]
  );

  // External close (dock-not-browser / workspace-switch) — clear lease without waiting for IPC fail.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onClosed = (event) => {
      const closedId = event?.detail?.panelId;
      const reason = String(event?.detail?.reason || '');
      if (!closedId || closedId !== panelId) return;
      nativeLeaseRef.current = { opened: false, lastUrl: '' };
      openInFlightRef.current = false;
      surfaceRevealedRef.current = false;
      invalidateNativeBoundsCache(panelId);
      setNativeRuntimeReady(false);
      // Intentional dock teardown — do not fight the controller by reopening.
      if (
        reason === 'dock-not-browser' ||
        reason === 'workspace-switch' ||
        reason === 'startup-sweep'
      ) {
        return;
      }
      if (openRecoveryAttemptRef.current < MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS) {
        scheduleOpenRecovery(0);
      }
    };
    window.addEventListener('devhub:native-browser-closed', onClosed);
    return () => window.removeEventListener('devhub:native-browser-closed', onClosed);
  }, [panelId, scheduleOpenRecovery]);

  // Child killed after open (startup purge race, dock-not-browser) leaves lease stale.
  const recoverDeadNativeLease = useCallback(
    (reason) => {
      if (!isPanelNotFoundReason(reason)) return false;
      nativeLeaseRef.current = { opened: false, lastUrl: '' };
      openInFlightRef.current = false;
      surfaceRevealedRef.current = false;
      const cacheKey = applyNativeBounds.__cacheKey;
      if (cacheKey) delete cacheKey[panelId];
      if (openRecoveryAttemptRef.current < MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS) {
        scheduleOpenRecovery(0);
      }
      return true;
    },
    [panelId, scheduleOpenRecovery]
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

        await awaitNativeBrowserStartupSweep({ timeoutMs: 0 });
        if (cancelled) return;

        if (!cancelled) setNativeError(null);

        const avoidRects = activeAvoidRectsRef.current;

        if (!visibleInLayout) {
          // ponytail: hide() preserves the panel for tab switches; close() is for teardown only.
          if (nativeLeaseRef.current.opened) {
            await setNativeBrowserVisibility({
              panelId,
              visible: false,
              bounds: measureBounds?.() || undefined,
              avoidRects,
            }).catch(() => {});
          }
          openInFlightRef.current = false;
          if (!cancelled) setNativeRuntimeReady(false);
          return;
        }

        // Cold-start gate: do not open until dock layout has real pixel bounds.
        if (!layoutReady && !nativeLeaseRef.current.opened) {
          if (!cancelled) setNativeRuntimeReady(false);
          if (openRecoveryAttemptRef.current < MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS) {
            scheduleOpenRecovery(80);
          }
          return;
        }

        if (occludeNativeRef.current && nativeLeaseRef.current.opened) {
          await applyNativeBounds(panelId, measureBounds?.() || null, avoidRects, {
            visible: false,
          });
        }

        // Already live with the same URL — reposition + ensure visible (never re-navigate).
        if (nativeLeaseRef.current.opened && urlsEqual(nativeLeaseRef.current.lastUrl, url)) {
          const liveBounds =
            resolveSyncBounds(measureBounds?.(), layoutOverlayOptions()) ||
            resolveOpenBounds(measureBounds?.(), layoutOverlayOptions());
          if (liveBounds) {
            surfaceRevealedRef.current = true;
            invalidateNativeBoundsCache(panelId);
            const applied = await applyNativeBounds(panelId, liveBounds, avoidRects, {
              visible: !occludeNativeRef.current,
              resizeOnly: false,
            });
            if (applied?.ok === false && recoverDeadNativeLease(applied.reason)) {
              if (!cancelled) setNativeRuntimeReady(false);
              return;
            }
            if (!cancelled) {
              setNativeRuntimeReady(true);
              setNativeError(null);
            }
          } else if (nativeLeaseRef.current.opened && !occludeNativeRef.current) {
            await applyNativeBounds(panelId, measureBounds?.() || null, avoidRects, {
              visible: false,
            });
          }
          return;
        }

        const bounds = await waitForStableBounds(measureBounds);
        if (cancelled || !visibleInLayout) return;

        const openBounds =
          resolveOpenBounds(bounds, layoutOverlayOptions()) ||
          (openRecoveryAttemptRef.current >= MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS ? bounds : null);
        if (!openBounds || !boundsSafeForNativeOpen(openBounds)) {
          if (!cancelled && !nativeLeaseRef.current.opened) {
            setNativeRuntimeReady(false);
          }
          if (openRecoveryAttemptRef.current < MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS) {
            scheduleOpenRecovery(120);
          } else if (!cancelled) {
            setNativeError('missing-bounds');
          }
          return;
        }

        if (!nativeLeaseRef.current.opened) {
          const now = Date.now();
          if (now - lastOpenAtRef.current < 400) {
            scheduleOpenRecovery(80);
            return;
          }
          // Always call open: probe.ready only means the GTK host exists, NOT that this
          // panel_id is registered. Skipping open caused panel-not-found on load/resize.
          // registry_open_panel reuses an existing panel when the pid is already live.
          if (openInFlightRef.current) {
            scheduleOpenRecovery(80);
            return;
          }
          openInFlightRef.current = true;
          let result;
          try {
            result = await openNativeBrowser({
              panelId,
              url,
              bounds: openBounds,
              avoidRects,
            });
          } finally {
            openInFlightRef.current = false;
          }

          if (cancelled) return;

          if (!visibleInLayout) {
            if (result?.opened === true) {
              await closeNativeBrowser({ panelId, reason: 'stale-open-not-visible' }).catch(
                () => {}
              );
              nativeLeaseRef.current = { opened: false, lastUrl: '' };
            }
            return;
          }

          if (result?.opened === true) {
            nativeLeaseRef.current = { opened: true, lastUrl: url };
            lastOpenAtRef.current = Date.now();
          }

          if (result?.opened !== true) {
            if (
              hasRecoverableNativeBridgeReason(result) &&
              openRecoveryAttemptRef.current < MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS
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
        } else if (!urlsEqual(nativeLeaseRef.current.lastUrl, url)) {
          const result = await loadNativeBrowserUrl({ panelId, url });
          if (cancelled || !visibleInLayout) return;

          if (result?.loaded === false) {
            if (
              isPanelNotFoundReason(result?.reason) &&
              openRecoveryAttemptRef.current < MAX_NATIVE_OPEN_RECOVERY_ATTEMPTS
            ) {
              const rebound = await reregisterNativePanel(url, openBounds);
              if (rebound) {
                nativeLeaseRef.current.lastUrl = url;
                invalidateNativeBoundsCache(panelId);
                surfaceRevealedRef.current = true;
                await applyNativeBounds(panelId, openBounds, avoidRects, {
                  visible: !occludeNativeRef.current,
                  resizeOnly: false,
                });
                if (!cancelled) {
                  setNativeRuntimeReady(true);
                  setNativeError(null);
                }
                return;
              }
              nativeLeaseRef.current = { opened: false, lastUrl: '' };
              scheduleOpenRecovery(120);
              return;
            }
            setNativeError(result?.reason || 'load-failed');
            return;
          }

          nativeLeaseRef.current.lastUrl = url;
        }

        // Single reveal: bust cache → forced show → then mark ready.
        // Prefer live shell measure (resolveSyncBounds) so pizarra cards / dock
        // slots are not rejected by the dock-only y>=48 open gate.
        invalidateNativeBoundsCache(panelId);
        const liveMeasured = measureBounds?.() || null;
        const postOpenBounds =
          resolveSyncBounds(liveMeasured, layoutOverlayOptions()) ||
          resolveOpenBounds(liveMeasured, layoutOverlayOptions()) ||
          openBounds;
        if (postOpenBounds) {
          surfaceRevealedRef.current = true;
          const applied = await applyNativeBounds(panelId, postOpenBounds, avoidRects, {
            visible: !occludeNativeRef.current,
            resizeOnly: false,
          });
          if (applied?.ok === false && recoverDeadNativeLease(applied.reason)) {
            if (!cancelled) setNativeRuntimeReady(false);
            return;
          }
        }

        if (!cancelled) {
          setNativeError(null);
          setNativeRuntimeReady(true);
        }

        if (focusOnShow) {
          focusNativeViewport();
        }

        if (!cancelled && openRecoveryAttemptRef.current > 0) {
          openRecoveryAttemptRef.current = 0;
        }

        // Settle burst: shell often finishes flex layout 1–2 frames after open.
        const settleTimers = [0, 50, 160].map((delayMs) =>
          setTimeout(() => {
            if (cancelled || occludeNativeRef.current) return;
            const settleBounds =
              resolveSyncBounds(measureBounds?.(), layoutOverlayOptions()) ||
              resolveOpenBounds(measureBounds?.(), layoutOverlayOptions());
            if (!settleBounds) return;
            invalidateNativeBoundsCache(panelId);
            applyNativeBounds(panelId, settleBounds, activeAvoidRectsRef.current, {
              visible:
                !occludeNativeRef.current &&
                (!occludeUntilReadyRef.current || surfaceRevealedRef.current),
              resizeOnly: false,
            })
              .then((applied) => {
                if (applied?.ok === false) recoverDeadNativeLease(applied.reason);
              })
              .catch(() => {});
          }, delayMs)
        );
        openSettleTimersRef.current = settleTimers;
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
      openSettleTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      openSettleTimersRef.current = [];
    };
  }, [
    active,
    closeActiveNativeLease,
    focusNativeViewport,
    focusOnShow,
    layoutOverlayOptions,
    layoutReady,
    measureBounds,
    occludeUntilReady,
    recoveryNonce,
    panelId,
    recoverDeadNativeLease,
    reregisterNativePanel,
    scheduleOpenRecovery,
    syncNativeBounds,
    url,
    visibleInLayout,
  ]);

  useEffect(
    () => () => {
      clearOpenRecoveryTimer();
      openInFlightRef.current = false;
      if (!nativeLeaseRef.current.opened) return;
      closeActiveNativeLease('surface-unmount').catch(() => {});
    },
    [closeActiveNativeLease, panelId]
  );

  // Bounds sync while lease is live — same contract as native VTE:
  // ResizeObserver + window resize + layout-settled, with short settle bursts.
  // Continuous rAF fought Framer/dock drag and skipped reapply after cache bust.
  useEffect(() => {
    if (!active || !visibleInLayout) return undefined;
    if (!nativeLeaseRef.current.opened && !nativeRuntimeReady) return undefined;
    if (typeof window === 'undefined') return undefined;

    let lastBounds = null;
    let lastAvoidRects = null;
    let lastVisible = null;
    let firstTick = true;
    let cancelled = false;
    let resizeObserver = null;

    const clearSettleTimers = () => {
      boundsSyncSettleTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      boundsSyncSettleTimersRef.current = [];
    };

    const pushBounds = ({ force = false } = {}) => {
      if (cancelled || !nativeLeaseRef.current.opened) return;

      const visible =
        !occludeNativeRef.current && (!occludeUntilReadyRef.current || surfaceRevealedRef.current);
      const measured = measureBounds?.() || null;
      // Never push a razor-thin strip (collapsed flex / bad measure) — wait for a real box.
      if (!boundsAreGood(measured)) {
        return;
      }
      const bounds = resolveSyncBounds(measured, layoutOverlayOptions());
      const avoidRects = activeAvoidRectsRef.current;
      if (!bounds) {
        if (nativeLeaseRef.current.opened && visible) {
          applyNativeBounds(panelId, measured, avoidRects, {
            visible: false,
          }).catch(() => {});
          lastVisible = false;
        }
        return;
      }

      const forceSync = force || forceBoundsSyncRef.current || firstTick;
      const hadAppliedBounds = !!lastBounds;
      const boundsChanged =
        !lastBounds ||
        Math.round(lastBounds.x) !== Math.round(bounds.x) ||
        Math.round(lastBounds.y) !== Math.round(bounds.y) ||
        Math.round(lastBounds.width) !== Math.round(bounds.width) ||
        Math.round(lastBounds.height) !== Math.round(bounds.height);
      const visibilityChanged = lastVisible !== visible;
      if (
        !forceSync &&
        !boundsChanged &&
        !visibilityChanged &&
        rectsEqual(lastAvoidRects, avoidRects)
      ) {
        return;
      }

      forceBoundsSyncRef.current = false;
      lastBounds = bounds;
      lastAvoidRects = avoidRects;
      lastVisible = visible;
      const forceShow = firstTick || visibilityChanged || !hadAppliedBounds || force;
      firstTick = false;
      applyNativeBounds(panelId, bounds, avoidRects, {
        visible,
        resizeOnly: visible && !forceShow,
      })
        .then((applied) => {
          if (applied?.ok === false && recoverDeadNativeLease(applied.reason)) {
            lastBounds = null;
            lastVisible = null;
            firstTick = true;
            forceBoundsSyncRef.current = true;
          }
        })
        .catch(() => {});
    };

    const schedulePush = ({ force = false } = {}) => {
      if (boundsSyncRafRef.current != null) {
        if (force) forceBoundsSyncRef.current = true;
        return;
      }
      if (force) forceBoundsSyncRef.current = true;
      if (typeof window.requestAnimationFrame !== 'function') {
        pushBounds({ force });
        return;
      }
      boundsSyncRafRef.current = window.requestAnimationFrame(() => {
        boundsSyncRafRef.current = null;
        pushBounds({ force: force || forceBoundsSyncRef.current });
      });
    };

    const scheduleSettleBurst = (reason = 'layout') => {
      clearSettleTimers();
      schedulePush({ force: true });
      boundsSyncSettleTimersRef.current = [80, 180].map((delayMs) =>
        setTimeout(() => {
          schedulePush({ force: true });
        }, delayMs)
      );
      void reason;
    };

    const onWindowResize = () => schedulePush({ force: true });
    const onLayoutSettled = () => scheduleSettleBurst('layout-settled');

    forceBoundsSyncRef.current = true;
    scheduleSettleBurst('mount');
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('devhub:terminal-layout-settled', onLayoutSettled);

    const observed =
      observeNodeRef.current?.current ||
      (observeNodeRef.current && observeNodeRef.current.nodeType === 1
        ? observeNodeRef.current
        : null);
    let pollRaf = null;
    if (typeof ResizeObserver === 'function' && observed) {
      resizeObserver = new ResizeObserver(() => {
        schedulePush({ force: false });
      });
      resizeObserver.observe(observed);
    } else if (typeof window.requestAnimationFrame === 'function') {
      // ponytail: no RO (tests / missing node) — light rAF poll while visible.
      // Uses a separate handle so schedulePush coalesce still works.
      const poll = () => {
        pollRaf = window.requestAnimationFrame(poll);
        pushBounds();
      };
      pollRaf = window.requestAnimationFrame(poll);
    }

    return () => {
      cancelled = true;
      clearSettleTimers();
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('devhub:terminal-layout-settled', onLayoutSettled);
      resizeObserver?.disconnect();
      if (pollRaf != null) cancelAnimationFrame(pollRaf);
      if (boundsSyncRafRef.current != null) {
        cancelAnimationFrame(boundsSyncRafRef.current);
        boundsSyncRafRef.current = null;
      }
    };
  }, [
    active,
    layoutOverlayOptions,
    layoutSyncKey,
    measureBounds,
    panelId,
    recoverDeadNativeLease,
    visibleInLayout,
    // Re-arm when lease becomes ready after open.
    nativeRuntimeReady,
  ]);

  const retryNative = useCallback(() => {
    setNativeError(null);
    setNativeRuntimeReady(false);
    openRecoveryAttemptRef.current = 0;
    setRecoveryNonce((attempt) => attempt + 1);
  }, []);

  // Keep lease lastUrl in sync when the WebView navigates on its own (in-page links).
  // Without this, toolbar load_url short-circuits incorrectly after in-page navigations.
  const noteNativeUrl = useCallback((nextUrl) => {
    if (!nextUrl || !nativeLeaseRef.current.opened) return;
    nativeLeaseRef.current.lastUrl = String(nextUrl);
  }, []);

  return { nativeRuntimeReady, nativeError, retryNative, focusNativeViewport, noteNativeUrl };
}
