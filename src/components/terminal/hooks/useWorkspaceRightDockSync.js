import { useCallback, useEffect, useMemo } from 'react';
import { useSwarmBusSnapshot } from '@/lib/hooks/useSwarmBusSnapshot';
import { resolveSwarmDelegatedRoleKeys } from '@/lib/operations/swarmDelegatedRoles';
import { readWorkspaceSwarmLaunchSummary } from '@/components/terminal/models/swarmRoleModel';
import {
  applyRightDockLayerBounds,
  resolveMeasuredRightDockBounds,
} from '@/components/terminal/rightDockLayerSync';
import { getRightDockAnimProps } from '@/components/terminal/workspaceAnimProps';
import { resolveRightDockLayerStyle } from '@/components/terminal/hooks/useRightDockController';
import { DEFAULT_RIGHT_DOCK_STATE } from '@/components/workspace/rightDockState';

export default function useWorkspaceRightDockSync({
  activeWorkspace,
  activeWsIdRef,
  applyLiveRightDockBoundsRef,
  dockWorkspaceId,
  heavySurfacesReady,
  isDraggingDock,
  isDraggingDockRef,
  isDraggingInternalSplit,
  nudgeBrowserNativeLiveRef,
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

  // Live direct nudge for the (native gtk) browser surface during dock drag.
  const nudgeBrowserNativeLive = useCallback(() => {
    if (!isDraggingDock) return;
    if (typeof document === 'undefined') return;
    const showingBrowser =
      effectiveRightDockState.visible &&
      !effectiveRightDockState.maximized &&
      (effectiveRightDockState.activeTab === 'browser' || !effectiveRightDockState.activeTab);
    if (!showingBrowser) return;

    try {
      const dockLayer = document.querySelector('[data-testid="workspace-right-dock-layer"]');
      const shell =
        (dockLayer && dockLayer.querySelector('[data-testid="browser-viewport-shell"]')) ||
        document.querySelector('[data-testid="browser-viewport-shell"]');
      if (!shell) return;

      const r = shell.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;

      const wsId = activeWsIdRef.current;
      if (!projectId || !wsId) return;

      const panelId = `browser-${projectId}-${wsId}`;

      import('@/lib/browser/nativeBrowserBridge')
        .then(({ resizeNativeBrowser }) => {
          resizeNativeBrowser({
            panelId,
            bounds: {
              x: Math.round(r.left),
              y: Math.round(r.top),
              width: Math.round(r.width),
              height: Math.round(r.height),
            },
          }).catch(() => {});
        })
        .catch(() => {});
    } catch {
      /* best effort during gesture */
    }
  }, [
    isDraggingDock,
    effectiveRightDockState.visible,
    effectiveRightDockState.maximized,
    effectiveRightDockState.activeTab,
    projectId,
  ]);

  nudgeBrowserNativeLiveRef.current = nudgeBrowserNativeLive;

  const applyLiveRightDockBounds = useCallback(() => {
    if (!isDraggingDockRef.current) return false;

    const containerElement = workspaceGridAreaRef.current;
    const placeholderElement = rightDockPlaceholderRef.current;
    const dockLayer = rightDockLayerRef.current;
    if (!containerElement || !placeholderElement || !dockLayer) return false;

    const nextBounds = resolveMeasuredRightDockBounds(
      containerElement.getBoundingClientRect?.(),
      placeholderElement.getBoundingClientRect?.()
    );
    if (!nextBounds) return false;

    const changed = applyRightDockLayerBounds(dockLayer, nextBounds);
    if (changed) {
      nudgeBrowserNativeLiveRef.current?.();
    }
    return changed;
  }, []);
  applyLiveRightDockBoundsRef.current = applyLiveRightDockBounds;

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
  const rightDockLayerChromeStyle = isDraggingDock
    ? { top: 0, right: 'auto', bottom: 0 }
    : rightDockLayerStyle;

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
