import { useCallback, useEffect, useMemo } from 'react';
import { useSwarmBusSnapshot } from '@/lib/hooks/useSwarmBusSnapshot';
import { resolveSwarmDelegatedRoleKeys } from '@/lib/operations/swarmDelegatedRoles';
import { readWorkspaceSwarmLaunchSummary } from '@/components/terminal/models/swarmRoleModel';
import { applyRightDockLayerBounds } from '@/components/terminal/rightDockLayerSync';
import { getRightDockAnimProps } from '@/components/terminal/workspaceAnimProps';
import {
  resolveMeasuredRightDockBounds,
  resolveRightDockLayerStyle,
} from '@/components/terminal/hooks/useRightDockController';
import { DEFAULT_RIGHT_DOCK_STATE } from '@/components/workspace/rightDockState';
import {
  flushNativeBrowserResize,
  scheduleNativeBrowserResize,
  setNativeBrowserVisibility,
} from '@/lib/browser/nativeBrowserBridge';

export default function useWorkspaceRightDockSync({
  activeWorkspace,
  activeWsIdRef,
  applyLiveRightDockBoundsRef,
  dockWorkspaceId,
  heavySurfacesReady,
  isDraggingDock,
  isDraggingDockRef,
  isDraggingInternalSplit,
  projectId,
  rightDockLayerRef,
  rightDockMeasuredBounds,
  rightDockPlaceholderRef,
  rightDockState,
  setIsDraggingDock,
  setIsDraggingInternalSplit,
  storage,
  swarmControlSnapshot,
  syncRightDockMeasuredBounds,
  syncRightDockMeasuredBoundsRef,
  workspaceGridAreaRef,
}) {
  // Global drag-state listeners for the right-dock resize handle.
  useEffect(() => {
    if (!isDraggingDock) return undefined;

    const stopDockDrag = () => setIsDraggingDock(false);

    window.addEventListener('mouseup', stopDockDrag);
    window.addEventListener('pointerup', stopDockDrag);
    window.addEventListener('dragend', stopDockDrag);
    window.addEventListener('blur', stopDockDrag);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        stopDockDrag();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Continuous rAF sync while dragging: read placeholder geometry and write
    // left/width directly on the dock layer so resize tracks at display refresh
    // without waiting for React commits or localStorage persistence.
    let raf = null;
    const tick = () => {
      if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
        applyLiveRightDockBoundsRef.current?.();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mouseup', stopDockDrag);
      window.removeEventListener('pointerup', stopDockDrag);
      window.removeEventListener('dragend', stopDockDrag);
      window.removeEventListener('blur', stopDockDrag);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [isDraggingDock, setIsDraggingDock]);

  // Global drag-state listeners for internal split resize handles.
  useEffect(() => {
    if (!isDraggingInternalSplit) return undefined;

    const stopSplitDrag = () => setIsDraggingInternalSplit(false);

    window.addEventListener('mouseup', stopSplitDrag);
    window.addEventListener('pointerup', stopSplitDrag);
    window.addEventListener('dragend', stopSplitDrag);
    window.addEventListener('blur', stopSplitDrag);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        stopSplitDrag();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('mouseup', stopSplitDrag);
      window.removeEventListener('pointerup', stopSplitDrag);
      window.removeEventListener('dragend', stopSplitDrag);
      window.removeEventListener('blur', stopSplitDrag);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDraggingInternalSplit, setIsDraggingInternalSplit]);

  const activeSwarmLaunchSummary = readWorkspaceSwarmLaunchSummary(
    storage,
    activeWorkspace,
    projectId,
    swarmControlSnapshot
  );
  const { snapshot: swarmBusSnapshot, pendingCountByRole: swarmInboxPendingByRole } =
    useSwarmBusSnapshot(activeSwarmLaunchSummary?.launchId || null, {
      enabled: Boolean(activeSwarmLaunchSummary?.launchId),
    });
  const swarmDelegatedRoleKeys = useMemo(
    () => resolveSwarmDelegatedRoleKeys(swarmBusSnapshot),
    [swarmBusSnapshot]
  );
  const activeWorkspaceOwnsDockState = activeWorkspace?.id === dockWorkspaceId;
  const effectiveRightDockState = activeWorkspaceOwnsDockState
    ? rightDockState
    : { ...DEFAULT_RIGHT_DOCK_STATE };

  // pizarra-sidebar-toggle-sync: notify App.js when Pizarra canvas mode is active
  // so the main workspace sidebar can be autohidden or collapsed.
  useEffect(() => {
    const isPizarraActive = !!(
      effectiveRightDockState?.visible &&
      effectiveRightDockState?.maximized &&
      effectiveRightDockState?.maximizedView === 'pizarra'
    );
    window.dispatchEvent(
      new CustomEvent('devhub:pizarra-active', {
        detail: { active: isPizarraActive },
      })
    );
  }, [
    effectiveRightDockState?.visible,
    effectiveRightDockState?.maximized,
    effectiveRightDockState?.maximizedView,
  ]);

  // Live dock CSS + WebView2 HWND. During splitter drag the layer is mutated via
  // style.left/width; ResizeObserver often misses left-only moves, so push the
  // viewport-shell rect every frame. Read panelId from the live DOM so we never
  // resize a stale/wrong id while the chrome moves and HWND stays stuck.
  const applyLiveRightDockBounds = useCallback(() => {
    const containerElement = workspaceGridAreaRef.current;
    const placeholderElement = rightDockPlaceholderRef.current;
    const dockLayer = rightDockLayerRef.current;
    if (!containerElement || !placeholderElement || !dockLayer) return false;

    const dragging = Boolean(isDraggingDockRef.current);
    let applied = false;

    if (dragging) {
      const nextBounds = resolveMeasuredRightDockBounds(
        containerElement.getBoundingClientRect?.(),
        placeholderElement.getBoundingClientRect?.()
      );
      if (nextBounds) {
        applied = applyRightDockLayerBounds(dockLayer, nextBounds);
      }
    }

    const dock = rightDockState;
    const browserLive =
      dock?.visible && (dock?.activeTab === 'browser' || dock?.maximizedView === 'browser');
    if (!browserLive) return applied;

    try {
      const pane = dockLayer.querySelector?.('[data-testid="workspace-browser-pane"]');
      const shell =
        dockLayer.querySelector?.('[data-testid="browser-viewport-shell"]') ||
        pane?.querySelector?.('[data-testid="browser-viewport-shell"]');
      const rect = shell?.getBoundingClientRect?.();
      if (!rect || rect.width < 48 || rect.height < 24) return applied;

      const panelIdFromDom = pane?.getAttribute?.('data-native-panel-id');
      const wsId = activeWorkspace?.id || dockWorkspaceId;
      const panelId = panelIdFromDom || `browser-${projectId || 'global'}-${wsId || 'workspace'}`;
      const bounds = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };

      if (dragging) {
        scheduleNativeBrowserResize({ panelId, bounds });
      } else {
        // Non-drag layout settle (panel group commit): flush immediately.
        flushNativeBrowserResize({ panelId, bounds }).catch(() => {});
        setNativeBrowserVisibility({ panelId, visible: true, bounds }).catch(() => {});
      }
    } catch {
      /* ignore mid-drag measure failures */
    }

    return applied;
  }, [activeWorkspace?.id, dockWorkspaceId, projectId, rightDockState]);
  applyLiveRightDockBoundsRef.current = applyLiveRightDockBounds;

  // Keep HWND glued to the dock shell while the browser tab is visible — not only
  // during explicit drag. Catches splitter commits, window resize, and layout
  // settles that never flip isDraggingDock.
  useEffect(() => {
    const dock = rightDockState;
    const browserLive =
      dock?.visible && (dock?.activeTab === 'browser' || dock?.maximizedView === 'browser');
    if (!browserLive) return undefined;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return undefined;
    }

    let raf = null;
    let lastKey = '';
    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      const dockLayer = rightDockLayerRef.current;
      if (!dockLayer) return;
      const shell = dockLayer.querySelector?.('[data-testid="browser-viewport-shell"]');
      const rect = shell?.getBoundingClientRect?.();
      if (!rect || rect.width < 48 || rect.height < 24) return;
      const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
      if (key === lastKey && !isDraggingDockRef.current) return;
      lastKey = key;
      applyLiveRightDockBoundsRef.current?.();
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
    };
  }, [
    rightDockState?.activeTab,
    rightDockState?.maximizedView,
    rightDockState?.visible,
    rightDockState?.size,
  ]);

  const isFullscreenBrowser =
    effectiveRightDockState.visible &&
    effectiveRightDockState.maximized &&
    (effectiveRightDockState.maximizedView === 'browser' ||
      effectiveRightDockState.maximizedView === 'swarm' ||
      effectiveRightDockState.maximizedView === 'pizarra');
  const pizarraOwnsLiveSurfaces =
    effectiveRightDockState.visible &&
    effectiveRightDockState.maximized &&
    effectiveRightDockState.maximizedView === 'pizarra';
  const hideRightDockPanel =
    effectiveRightDockState.maximized && effectiveRightDockState.maximizedView === 'window';
  const dockLayerVisible = effectiveRightDockState.visible && !hideRightDockPanel;
  const rightDockAnimProps = getRightDockAnimProps({
    isVisible: dockLayerVisible,
    isDragging: isDraggingDock,
    isFullscreen: isFullscreenBrowser,
  });

  const rightDockLayerStyle = resolveRightDockLayerStyle({
    isFullscreenBrowser,
    size: effectiveRightDockState.size,
    measuredBounds: rightDockMeasuredBounds,
  });
  // Keep left/width in the React style during drag. Stripping them made every
  // re-render clear the imperative live geometry, so WebView2 only caught up on mouseup.
  const rightDockLayerChromeStyle = rightDockLayerStyle;

  syncRightDockMeasuredBoundsRef.current = syncRightDockMeasuredBounds;

  useEffect(() => {
    if (!heavySurfacesReady) return undefined;
    syncRightDockMeasuredBounds();
    return undefined;
  }, [heavySurfacesReady, syncRightDockMeasuredBounds]);

  // Initial / visibility-change eager measurement for the right dock layer.
  useEffect(() => {
    if (
      isFullscreenBrowser ||
      !effectiveRightDockState.visible ||
      effectiveRightDockState.maximized ||
      hideRightDockPanel
    ) {
      return undefined;
    }

    syncRightDockMeasuredBounds();
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return undefined;
    }
    const t0 = setTimeout(() => syncRightDockMeasuredBounds(), 0);
    const t1 = setTimeout(() => syncRightDockMeasuredBounds(), 16);
    const r1 = requestAnimationFrame(() => syncRightDockMeasuredBounds());
    const r2 = requestAnimationFrame(() =>
      requestAnimationFrame(() => syncRightDockMeasuredBounds())
    );

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [
    effectiveRightDockState.visible,
    effectiveRightDockState.maximized,
    effectiveRightDockState.activeTab,
    hideRightDockPanel,
    isFullscreenBrowser,
    syncRightDockMeasuredBounds,
  ]);

  return {
    activeSwarmLaunchSummary,
    swarmBusSnapshot,
    swarmInboxPendingByRole,
    swarmDelegatedRoleKeys,
    effectiveRightDockState,
    isFullscreenBrowser,
    pizarraOwnsLiveSurfaces,
    hideRightDockPanel,
    dockLayerVisible,
    rightDockAnimProps,
    rightDockLayerStyle,
    rightDockLayerChromeStyle,
  };
}
