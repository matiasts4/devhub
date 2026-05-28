// useRightDockController — manages right dock state, persistence, measured bounds, and drag.
// Extracted from TerminalWorkspacesManager.jsx.
// Args: { projectId, isVisible, dockWorkspaceId, setDockWorkspaceId, activeWsId, storage, isClientLoaded, workspaceGridAreaRef, rightDockPlaceholderRef }
// Returns: { rightDockState, setRightDockState, rightDockMeasuredBounds, hasMountedRightDock, isDraggingDock, updateRightDockState, syncRightDockMeasuredBounds }

import { useState, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  DEFAULT_RIGHT_DOCK_STATE,
  readRightDockState,
  sanitizeRightDockState,
  writeRightDockState,
} from '../../workspace/rightDockState';

export function resolveRightDockLayerStyle({ isFullscreenBrowser, size, measuredBounds }) {
  if (isFullscreenBrowser) {
    return { top: 0, right: 0, bottom: 0, left: 0, width: '100%' };
  }

  if (measuredBounds) {
    return {
      top: 0,
      right: 'auto',
      bottom: 0,
      left: measuredBounds.left,
      width: measuredBounds.width,
    };
  }

  return { top: 0, right: 0, bottom: 0, left: 'auto', width: `${size}%` };
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
}) {
  const [rightDockState, setRightDockState] = useState(() => ({ ...DEFAULT_RIGHT_DOCK_STATE }));
  const [rightDockMeasuredBounds, setRightDockMeasuredBounds] = useState(null);
  const [hasMountedRightDock, setHasMountedRightDock] = useState(false);
  const [isDraggingDock, setIsDraggingDock] = useState(false);

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

  // Detect when right dock has mounted (for editor tab).
  useEffect(() => {
    if (rightDockState.visible && rightDockState.activeTab === 'editor') {
      setHasMountedRightDock(true);
    }
  }, [rightDockState.activeTab, rightDockState.visible]);

  // Drag cleanup for dock resize handle.
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

    return () => {
      window.removeEventListener('mouseup', stopDockDrag);
      window.removeEventListener('pointerup', stopDockDrag);
      window.removeEventListener('dragend', stopDockDrag);
      window.removeEventListener('blur', stopDockDrag);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDraggingDock]);

  const updateRightDockState = useCallback((nextValue) => {
    setRightDockState((prev) => {
      const currentState = prev ?? { ...DEFAULT_RIGHT_DOCK_STATE };
      const resolvedState =
        typeof nextValue === 'function'
          ? nextValue(currentState)
          : { ...currentState, ...nextValue };
      return sanitizeRightDockState(resolvedState);
    });
  }, []);

  const syncRightDockMeasuredBounds = useCallback(() => {
    const isFullscreenBrowser =
      rightDockState.maximized && rightDockState.maximizedView === 'browser';
    const hideRightDockPanel =
      rightDockState.maximized && rightDockState.maximizedView === 'window';

    if (
      isFullscreenBrowser ||
      !rightDockState.visible ||
      rightDockState.maximized ||
      hideRightDockPanel
    ) {
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
  }, [
    rightDockState.maximized,
    rightDockState.visible,
    rightDockState.maximizedView,
    workspaceGridAreaRef,
    rightDockPlaceholderRef,
  ]);

  useLayoutEffect(() => {
    syncRightDockMeasuredBounds();
  }, [syncRightDockMeasuredBounds, rightDockState.size, activeWsId, isVisible]);

  useEffect(() => {
    const isFullscreenBrowser =
      rightDockState.maximized && rightDockState.maximizedView === 'browser';
    const hideRightDockPanel =
      rightDockState.maximized && rightDockState.maximizedView === 'window';

    if (
      isFullscreenBrowser ||
      !rightDockState.visible ||
      rightDockState.maximized ||
      hideRightDockPanel
    ) {
      return undefined;
    }

    const containerElement = workspaceGridAreaRef?.current;
    const placeholderElement = rightDockPlaceholderRef?.current;
    if (!containerElement || !placeholderElement) {
      return undefined;
    }

    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', syncRightDockMeasuredBounds);
      return () => window.removeEventListener('resize', syncRightDockMeasuredBounds);
    }

    const observer = new ResizeObserver(() => {
      syncRightDockMeasuredBounds();
    });

    observer.observe(containerElement);
    observer.observe(placeholderElement);
    return () => observer.disconnect();
  }, [
    rightDockState.maximized,
    rightDockState.visible,
    rightDockState.maximizedView,
    syncRightDockMeasuredBounds,
    workspaceGridAreaRef,
    rightDockPlaceholderRef,
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
