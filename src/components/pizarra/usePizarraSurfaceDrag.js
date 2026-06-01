'use client';

import { useCallback, useEffect, useRef } from 'react';

export default function usePizarraSurfaceDrag({
  surfaceId,
  bounds,
  onSelect,
  onMove,
  moveMeta,
  onNativeSync,
}) {
  const cleanupRef = useRef(null);
  const frameRef = useRef(null);
  const boundsRef = useRef(bounds);
  const pendingMoveRef = useRef(null);

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  const flushPendingMove = useCallback(
    (startBounds) => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      const pendingMove = pendingMoveRef.current;
      pendingMoveRef.current = null;
      if (!pendingMove) return;

      onMove?.({
        id: surfaceId,
        ...moveMeta,
        deltaX: pendingMove.deltaX,
        deltaY: pendingMove.deltaY,
        totalDeltaX: pendingMove.totalDeltaX,
        totalDeltaY: pendingMove.totalDeltaY,
      });
      onNativeSync?.({ startBounds, ...pendingMove });
    },
    [moveMeta, onMove, onNativeSync, surfaceId]
  );

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const handleDragStart = useCallback(
    (event) => {
      if (event.button !== 0) return;

      event.stopPropagation();
      event.preventDefault();
      onSelect?.(surfaceId);

      const startBounds = { ...boundsRef.current };
      const startPointer = {
        x: event.clientX,
        y: event.clientY,
      };
      const lastPointer = {
        x: event.clientX,
        y: event.clientY,
      };

      const scheduleFlush = () => {
        if (frameRef.current !== null) return;
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          flushPendingMove(startBounds);
        });
      };

      const handleMouseMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - lastPointer.x;
        const deltaY = moveEvent.clientY - lastPointer.y;
        const totalDeltaX = moveEvent.clientX - startPointer.x;
        const totalDeltaY = moveEvent.clientY - startPointer.y;

        if (deltaX === 0 && deltaY === 0) return;

        lastPointer.x = moveEvent.clientX;
        lastPointer.y = moveEvent.clientY;
        pendingMoveRef.current = {
          deltaX,
          deltaY,
          totalDeltaX,
          totalDeltaY,
        };
        scheduleFlush();
      };

      const cleanupDrag = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        pendingMoveRef.current = null;
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        if (cleanupRef.current === cleanupDrag) {
          cleanupRef.current = null;
        }
      };

      const handleMouseUp = () => {
        flushPendingMove(startBounds);
        cleanupDrag();
      };

      cleanupRef.current?.();
      cleanupRef.current = cleanupDrag;
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [flushPendingMove, onSelect, surfaceId]
  );

  return handleDragStart;
}