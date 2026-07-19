// useRightDockController — manages right dock state, persistence, measured bounds, and drag.
// Extracted from TerminalWorkspacesManager.jsx.

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import {
  DEFAULT_RIGHT_DOCK_STATE,
  readRightDockState,
  rightDockStatesEqual,
  sanitizeRightDockState,
  writeRightDockState,
} from '../../workspace/rightDockState';
import { applyRightDockLayerBounds } from '@/components/terminal/rightDockLayerSync';

export function resolveRightDockLayerStyle({ isFullscreenBrowser, size, measuredBounds }) {
  if (isFullscreenBrowser) {
    return { top: 0, right: 'auto', bottom: 0, left: 0, width: '100%' };
  }

  if (measuredBounds) {
    return {
      top: 0,
      right: 'auto',
      bottom: 0,
      left: `${measuredBounds.left}px`,
      width: `${measuredBounds.width}px`,
    };
  }

  return { top: 0, right: 'auto', bottom: 0, left: `${100 - size}%`, width: `${size}%` };
}

export function resolveMeasuredRightDockBounds(containerRect, placeholderRect) {
  if (!containerRect || !placeholderRect) return null;

  const containerWidth = Number(containerRect.width || 0);
  const placeholderWidth = Number(placeholderRect.width || 0);
  if (containerWidth <= 0 || placeholderWidth <= 0) return null;

  return {
    left: Math.max(0, placeholderRect.left - containerRect.left),
    right: Math.max(0, containerRect.right - placeholderRect.right),
    width: placeholderWidth,
  };
}

export default function useRightDockController({
  projectId,
  isVisible,
  dockWorkspaceId,
  setDockWorkspaceId,
  activeWsId,
  storage,
  isClientLoaded,
  workspaceGridAreaRef,
  rightDockPlaceholderRef,
  rightDockLayerRef = null,
  isDraggingDockRef = null,
  applyLiveRightDockBoundsRef = null,
  heavySurfacesReady = true,
}) {
  const [rightDockState, setRightDockState] = useState(() => ({ ...DEFAULT_RIGHT_DOCK_STATE }));
  const [rightDockMeasuredBounds, setRightDockMeasuredBounds] = useState(null);
  const [hasMountedRightDock, setHasMountedRightDock] = useState(false);
  const [isDraggingDock, setIsDraggingDock] = useState(false);
  const prevActiveWsForBrowserHideRef = useRef(activeWsId);

  // Workspace switch: ONE event → showWorkspace filter (no hideAll thrash).
  useEffect(() => {
    if (!isClientLoaded || !projectId) return undefined;
    const prevWsId = prevActiveWsForBrowserHideRef.current;
    if (prevWsId && activeWsId && prevWsId !== activeWsId) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('devhub:browser-workspace', { detail: { workspaceId: activeWsId } })
        );
      }
    }
    prevActiveWsForBrowserHideRef.current = activeWsId;
    return undefined;
  }, [activeWsId, isClientLoaded, projectId]);

  // Persist dock state for the workspace this state belongs to.
  useEffect(() => {
    if (!isClientLoaded || !dockWorkspaceId) return;
    writeRightDockState(storage, projectId, dockWorkspaceId, rightDockState);
  }, [dockWorkspaceId, isClientLoaded, projectId, rightDockState, storage]);

  // When active workspace changes, load that workspace's dock state.
  useEffect(() => {
    if (!isClientLoaded || !activeWsId || activeWsId === dockWorkspaceId) return;
    setDockWorkspaceId(activeWsId);
    setRightDockState(readRightDockState(storage, projectId, activeWsId));
  }, [activeWsId, dockWorkspaceId, isClientLoaded, projectId, storage, setDockWorkspaceId]);

  // Detect when right dock has mounted.
  useEffect(() => {
    if (rightDockState.visible) {
      setHasMountedRightDock(true);
    }
  }, [rightDockState.visible]);

  const updateRightDockState = useCallback((nextValue) => {
    setRightDockState((prev) => {
      const currentState = prev ?? { ...DEFAULT_RIGHT_DOCK_STATE };
      const resolvedState =
        typeof nextValue === 'function'
          ? nextValue(currentState)
          : { ...currentState, ...nextValue };
      const nextState = sanitizeRightDockState(resolvedState);
      return rightDockStatesEqual(currentState, nextState) ? prev : nextState;
    });
  }, []);

  const resolveDockLayoutFlags = useCallback(() => {
    // Browser is a space component — overlay fullscreen is swarm/pizarra only.
    const isFullscreenBrowser =
      rightDockState.maximized &&
      (rightDockState.maximizedView === 'swarm' || rightDockState.maximizedView === 'pizarra');
    const hideRightDockPanel =
      rightDockState.maximized && rightDockState.maximizedView === 'window';
    return { isFullscreenBrowser, hideRightDockPanel };
  }, [rightDockState.maximized, rightDockState.maximizedView]);

  const syncRightDockMeasuredBounds = useCallback(() => {
    const { isFullscreenBrowser, hideRightDockPanel } = resolveDockLayoutFlags();

    if (isFullscreenBrowser || rightDockState.maximized || hideRightDockPanel) {
      setRightDockMeasuredBounds(null);
      return;
    }

    const containerElement = workspaceGridAreaRef?.current;
    const placeholderElement = rightDockPlaceholderRef?.current;
    if (!containerElement || !placeholderElement) {
      setRightDockMeasuredBounds(null);
      return;
    }

    const containerRect = containerElement.getBoundingClientRect?.();
    const placeholderRect = placeholderElement.getBoundingClientRect?.();

    const nextBounds = resolveMeasuredRightDockBounds(containerRect, placeholderRect);
    if (!nextBounds) {
      setRightDockMeasuredBounds(null);
      return;
    }

    if (isDraggingDockRef?.current) {
      if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
        applyLiveRightDockBoundsRef?.current?.();
      }
      return;
    }

    setRightDockMeasuredBounds((prev) => {
      if (
        prev &&
        prev.left === nextBounds.left &&
        prev.right === nextBounds.right &&
        prev.width === nextBounds.width
      ) {
        return prev;
      }
      return nextBounds;
    });

    if (!isDraggingDockRef?.current && rightDockLayerRef?.current) {
      applyRightDockLayerBounds(rightDockLayerRef.current, nextBounds);
    }
  }, [
    resolveDockLayoutFlags,
    rightDockState.visible,
    rightDockState.maximized,
    rightDockState.maximizedView,
    workspaceGridAreaRef,
    rightDockPlaceholderRef,
    rightDockLayerRef,
    isDraggingDockRef,
    applyLiveRightDockBoundsRef,
  ]);

  useLayoutEffect(() => {
    syncRightDockMeasuredBounds();
  }, [syncRightDockMeasuredBounds, rightDockState.size, activeWsId, isVisible]);

  useLayoutEffect(() => {
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') return undefined;
    syncRightDockMeasuredBounds();
    return undefined;
  }, [
    syncRightDockMeasuredBounds,
    rightDockState.visible,
    rightDockState.maximized,
    rightDockState.activeTab,
    heavySurfacesReady,
  ]);

  useEffect(() => {
    const { isFullscreenBrowser, hideRightDockPanel } = resolveDockLayoutFlags();

    if (isFullscreenBrowser || rightDockState.maximized || hideRightDockPanel) {
      return undefined;
    }

    const containerElement = workspaceGridAreaRef?.current;
    const placeholderElement = rightDockPlaceholderRef?.current;
    if (!containerElement || !placeholderElement) {
      return undefined;
    }

    window.addEventListener('resize', syncRightDockMeasuredBounds);

    if (typeof ResizeObserver !== 'function') {
      return () => window.removeEventListener('resize', syncRightDockMeasuredBounds);
    }

    const observer = new ResizeObserver(() => {
      syncRightDockMeasuredBounds();
    });

    observer.observe(containerElement);
    observer.observe(placeholderElement);
    return () => {
      window.removeEventListener('resize', syncRightDockMeasuredBounds);
      observer.disconnect();
    };
  }, [
    resolveDockLayoutFlags,
    syncRightDockMeasuredBounds,
    workspaceGridAreaRef,
    rightDockPlaceholderRef,
    heavySurfacesReady,
    rightDockState.visible,
    rightDockState.maximized,
    rightDockState.maximizedView,
    rightDockState.activeTab,
  ]);

  // Eager measurement on visibility/tab changes so the dock layer gets pixel bounds early.
  useEffect(() => {
    const { isFullscreenBrowser, hideRightDockPanel } = resolveDockLayoutFlags();

    if (isFullscreenBrowser || rightDockState.maximized || hideRightDockPanel) {
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
    resolveDockLayoutFlags,
    rightDockState.visible,
    rightDockState.maximized,
    rightDockState.activeTab,
    syncRightDockMeasuredBounds,
  ]);

  return {
    rightDockState,
    setRightDockState,
    rightDockMeasuredBounds,
    hasMountedRightDock,
    isDraggingDock,
    setIsDraggingDock,
    updateRightDockState,
    syncRightDockMeasuredBounds,
  };
}
