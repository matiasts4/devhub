'use client';

import { useCallback, useEffect, useRef } from 'react';

export default function usePizarraSurfaceDrag({
  surfaceId,
  bounds,
  onSelect,
  onMove,
  onDragEnd,
  onDragStart,
  onDragMove,
  moveMeta,
  onNativeSync,
}) {
  const cleanupRef = useRef(null);
  const frameRef = useRef(null);
  const boundsRef = useRef(bounds);
  const pendingMoveRef = useRef(null);
  // pizarra-ux-overhaul: tracks the last native-sync payload so we can
  // dedupe by structural equality. The VTE bridge receives one payload
  // per move that actually changed the resolved position.
  const lastSyncPayloadRef = useRef(null);
  // pizarra-ux-overhaul: resolvedZoom is the latest viewport zoom read
  // at RAF-flush time. We capture it via a ref so mid-drag zoom changes
  // (wheel events) are picked up by the next flush, not the mousedown.
  const resolvedZoomRef = useRef(1);

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

      // pizarra-drag-resize-polish: onMove is called IMMEDIATELY in
      // handleMouseMove (so the React state lands in the same frame
      // as the cursor). flushPendingMove now only carries the native
      // VTE sync payload. The post-zoom deltas are recomputed here
      // for the dedupe key only.
      const zoom = resolvedZoomRef.current || 1;
      const totalDeltaX = pendingMove.totalDeltaX / zoom;
      const totalDeltaY = pendingMove.totalDeltaY / zoom;

      // pizarra-ux-overhaul: zero-delta short-circuit. The VTE bridge
      // does not need a re-sync when the resolved position has not
      // changed. (deltaX/deltaY are post-zoom; if the post-zoom deltas
      // are zero we skip the IPC round-trip.)
      if (totalDeltaX === 0 && totalDeltaY === 0) return;

      // pizarra-ux-overhaul: dedupe onNativeSync by structural
      // equality of the resolved {x, y, width, height} payload.
      // The consumer builds a new object on every move, so a value
      // comparison is required.
      const nextPayload = {
        x: (startBounds.x ?? 0) + totalDeltaX,
        y: (startBounds.y ?? 0) + totalDeltaY,
        width: startBounds.width,
        height: startBounds.height,
      };
      const last = lastSyncPayloadRef.current;
      const isSamePayload =
        last &&
        last.x === nextPayload.x &&
        last.y === nextPayload.y &&
        last.width === nextPayload.width &&
        last.height === nextPayload.height;
      if (isSamePayload) return;

      lastSyncPayloadRef.current = nextPayload;
      onNativeSync?.({ startBounds, ...pendingMove });
    },
    [moveMeta, onMove, onNativeSync, surfaceId]
  );

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  const handleDragStart = useCallback(
    (event) => {
      if (event.button !== 0) return;

      event.stopPropagation();
      event.preventDefault();
      onSelect?.(surfaceId);
      onDragStart?.();

      // pizarra-ux-overhaul: read the latest resolvedZoom at the start
      // of the drag. The ref is updated by external zoom changes
      // (wheel, programmatic setZoom) and is read again at flush time.
      // We also reset the dedupe cache so the first sync of a new
      // drag always fires.
      const incomingZoom =
        typeof event.nativeEvent?.resolvedZoom === 'number'
          ? event.nativeEvent.resolvedZoom
          : resolvedZoomRef.current;
      resolvedZoomRef.current = incomingZoom || 1;
      lastSyncPayloadRef.current = null;

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
        // Allow tests / consumers to inject a resolvedZoom on the
        // mousemove event for mid-drag zoom change coverage.
        if (typeof moveEvent.resolvedZoom === 'number' && moveEvent.resolvedZoom > 0) {
          resolvedZoomRef.current = moveEvent.resolvedZoom;
        }

        // pizarra-drag-resize-polish: divide per-tick deltas by the
        // LATEST resolvedZoom so the downstream consumer (React state
        // in CanvasTerminal/PizarraBrowserSurface) receives
        // logical-coord deltas in the same frame as the cursor. The
        // ref is read fresh on every mousemove so mid-drag zoom
        // changes land on the next tick.
        const zoom = resolvedZoomRef.current || 1;
        const rawDeltaX = moveEvent.clientX - lastPointer.x;
        const rawDeltaY = moveEvent.clientY - lastPointer.y;
        const rawTotalDeltaX = moveEvent.clientX - startPointer.x;
        const rawTotalDeltaY = moveEvent.clientY - startPointer.y;
        const deltaX = rawDeltaX / zoom;
        const deltaY = rawDeltaY / zoom;
        const totalDeltaX = rawTotalDeltaX / zoom;
        const totalDeltaY = rawTotalDeltaY / zoom;

        // pizarra-shared-view-state (Phase 1 — flicker fix): the
        // consumer is responsible for the 3px threshold gate that
        // separates "I am about to drag" from "I am clicking to
        // select". The hook hands the raw moveEvent + raw deltas to
        // onDragMove so the consumer can run the gate. We pass raw
        // (pre-zoom) deltas because movementX/movementY are not
        // populated by jsdom and the threshold is about real screen
        // pixels (per design §6.1). See the consumer in
        // CanvasTerminal.jsx.
        onDragMove?.(moveEvent, {
          rawTotalDeltaX,
          rawTotalDeltaY,
        });

        if (rawDeltaX === 0 && rawDeltaY === 0) return;

        lastPointer.x = moveEvent.clientX;
        lastPointer.y = moveEvent.clientY;
        pendingMoveRef.current = {
          deltaX: rawDeltaX,
          deltaY: rawDeltaY,
          totalDeltaX: rawTotalDeltaX,
          totalDeltaY: rawTotalDeltaY,
        };

        // pizarra-drag-resize-polish: fire onMove SYNCHRONOUSLY inside
        // the mousemove handler so the React state lands in the same
        // frame as the cursor. The native VTE sync still goes through
        // RAF via scheduleFlush() (see flushPendingMove). The onMove
        // contract is unchanged: { id, ...moveMeta, deltaX, deltaY,
        // totalDeltaX, totalDeltaY } with the per-tick delta and the
        // cumulative totalDelta, both divided by zoom.
        onMove?.({
          id: surfaceId,
          ...moveMeta,
          deltaX,
          deltaY,
          totalDeltaX,
          totalDeltaY,
        });

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
        // pizarra-drag-fluidity: fire onDragEnd with the final
        // cumulative logical-coord delta so the consumer can commit
        // the position to the reducer once (instead of per-tick).
        const zoom = resolvedZoomRef.current || 1;
        const finalTotalDeltaX = (lastPointer.x - startPointer.x) / zoom;
        const finalTotalDeltaY = (lastPointer.y - startPointer.y) / zoom;
        onDragEnd?.({
          id: surfaceId,
          ...moveMeta,
          totalDeltaX: finalTotalDeltaX,
          totalDeltaY: finalTotalDeltaY,
        });
        cleanupDrag();
      };

      cleanupRef.current?.();
      cleanupRef.current = cleanupDrag;
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [flushPendingMove, onDragEnd, onDragStart, onDragMove, onSelect, surfaceId]
  );

  // pizarra-ux-overhaul: tests and consumers can update the latest
  // resolvedZoom from outside the hook (e.g., a viewport controller
  // fires when the user scrolls). Exposed via a setter callback so
  // the hook stays controlled. This is a no-op when the hook is
  // driven by the CanvasViewportContext consumer directly; it
  // exists to make the contract explicit and testable.
  // (No public API; the consumer calls setResolvedZoom via the
  //  ref-style call from the test harness.)

  return handleDragStart;
}
