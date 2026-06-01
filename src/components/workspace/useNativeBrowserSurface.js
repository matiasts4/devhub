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

  const closeActiveNativeLease = useCallback(
    async (reason) => {
      if (!nativeLeaseRef.current.opened) return;
      await closeNativeBrowser({ panelId, reason }).catch(() => {});
      nativeLeaseRef.current = { opened: false, lastUrl: '' };
    },
    [panelId]
  );

  const hideActiveNativeLease = useCallback(async () => {
    if (!nativeLeaseRef.current.opened) return;
    const bounds = measureBounds?.();
    await setNativeBrowserVisibility({ panelId, visible: false, bounds }).catch(() => {});
  }, [measureBounds, panelId]);

  useEffect(() => {
    let cancelled = false;

    async function syncNativeSurface() {
      if (!active || !url) {
        await closeActiveNativeLease('surface-inactive');
        if (!cancelled) setNativeRuntimeReady(false);
        return;
      }

      if (!visibleInLayout) {
        await hideActiveNativeLease();
        return;
      }

      const bounds = measureBounds?.();
      if (!bounds) {
        if (!cancelled) setNativeRuntimeReady(false);
        return;
      }

      if (!nativeLeaseRef.current.opened) {
        const result = await openNativeBrowser({ panelId, url, bounds });

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
      } else if (nativeLeaseRef.current.lastUrl !== url) {
        const result = await loadNativeBrowserUrl({ panelId, url });
        if (cancelled) return;

        if (result?.loaded === false) {
          setNativeRuntimeReady(false);
          return;
        }

        nativeLeaseRef.current.lastUrl = url;
      }

      await resizeNativeBrowser({ panelId, bounds }).catch(() => {});
      await setNativeBrowserVisibility({ panelId, visible: true, bounds }).catch(() => {});

      if (focusOnShow) {
        await focusNativeBrowser({ panelId }).catch(() => {});
      }

      if (!cancelled) setNativeRuntimeReady(true);
    }

    syncNativeSurface();

    return () => {
      cancelled = true;
    };
  }, [
    active,
    closeActiveNativeLease,
    focusOnShow,
    hideActiveNativeLease,
    layoutSyncKey,
    measureBounds,
    panelId,
    url,
    visibleInLayout,
  ]);

  useEffect(
    () => () => {
      if (!nativeLeaseRef.current.opened) return;
      closeNativeBrowser({ panelId, reason: 'component-unmount' }).catch(() => {});
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
      resizeNativeBrowser({ panelId, bounds }).catch(() => {});
      setNativeBrowserVisibility({
        panelId,
        visible: visibleInLayout,
        bounds,
      }).catch(() => {});
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [active, measureBounds, nativeRuntimeReady, observeNode, panelId, visibleInLayout]);

  return { nativeRuntimeReady };
}