'use client';

import { useCallback, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  EDGE_ZONE_WIDTH_PX,
  edgeSwipeProgress,
  resolveEdgeSwipeCommit,
} from '@/lib/pizarra/pizarraEdgeViewSwipe';

function EdgeZone({
  side,
  enabled,
  canvasHeight: _canvasHeight,
  insetTop = 0,
  insetBottom = 0,
  zoneWidth = EDGE_ZONE_WIDTH_PX,
  onDragStart,
  onDragMove,
  onDragEnd,
}) {
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState(0);
  const dragRef = useRef(null);

  const handlePointerDown = useCallback(
    (event) => {
      if (!enabled || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastTime: performance.now(),
        velocityX: 0,
      };
      setActive(true);
      setProgress(0);
      onDragStart?.(side);
    },
    [enabled, onDragStart, side]
  );

  const handlePointerMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const now = performance.now();
      const dt = Math.max(1, now - drag.lastTime);
      const dx = event.clientX - drag.startX;
      drag.velocityX = ((event.clientX - drag.lastX) / dt) * 1000;
      drag.lastX = event.clientX;
      drag.lastTime = now;

      setProgress(edgeSwipeProgress(dx, window.innerWidth, side));
      onDragMove?.(side, dx, { velocityX: drag.velocityX });
    },
    [onDragMove, side]
  );

  const finishDrag = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const dx = event.clientX - drag.startX;
      dragRef.current = null;
      setActive(false);
      setProgress(0);
      onDragEnd?.(side, dx, { velocityX: drag.velocityX });
    },
    [onDragEnd, side]
  );

  const handlePointerUp = useCallback(
    (event) => {
      finishDrag(event);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    },
    [finishDrag]
  );

  const handlePointerCancel = useCallback(
    (event) => {
      finishDrag(event);
    },
    [finishDrag]
  );

  const isLeft = side === 'left';
  const showHint = enabled && (hovered || active);
  const glowOpacity = active ? 0.22 + progress * 0.35 : hovered ? 0.12 : 0;
  const Icon = isLeft ? ChevronLeft : ChevronRight;

  return (
    <div
      data-testid={`pizarra-edge-swipe-${side}`}
      data-active={active ? 'true' : 'false'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        if (!active) setHovered(false);
      }}
      title={
        enabled
          ? isLeft
            ? 'Arrastra hacia la derecha para la ventana anterior'
            : 'Arrastra hacia la izquierda para la siguiente ventana'
          : undefined
      }
      style={{
        position: 'absolute',
        top: insetTop,
        bottom: insetBottom,
        [isLeft ? 'left' : 'right']: 0,
        width: zoneWidth,
        zIndex: isLeft ? 10006 : 10005,
        pointerEvents: enabled ? 'auto' : 'none',
        touchAction: 'none',
        cursor: enabled ? (active ? 'grabbing' : 'grab') : 'default',
        background: isLeft
          ? `linear-gradient(90deg, rgba(56, 128, 255, ${glowOpacity}) 0%, transparent 100%)`
          : `linear-gradient(270deg, rgba(56, 128, 255, ${glowOpacity}) 0%, transparent 100%)`,
        transition: active ? 'none' : 'background 0.2s ease-out',
      }}
      aria-hidden={!enabled}
    >
      {showHint ? (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            [isLeft ? 'left' : 'right']: 10,
            transform: `translateY(-50%) translateX(${isLeft ? '' : '-'}${active ? progress * 6 : 0}px)`,
            opacity: active ? 0.5 + progress * 0.5 : 0.35,
            color: '#93c5fd',
            transition: active ? 'none' : 'opacity 0.2s ease-out, transform 0.2s ease-out',
            pointerEvents: 'none',
          }}
        >
          <Icon size={18} strokeWidth={2.5} />
        </div>
      ) : null}
    </div>
  );
}

export default function PizarraEdgeSwipeZones({
  enabled = false,
  canvasHeight = 600,
  canGoPrev = false,
  canGoNext = false,
  leftInsetBottom = 0,
  leftZoneWidth = EDGE_ZONE_WIDTH_PX,
  onDragStart,
  onDragMove,
  onDragEnd,
}) {
  const handleDragEnd = useCallback(
    (side, deltaX, meta) => {
      const outcome = resolveEdgeSwipeCommit({
        side,
        deltaX,
        viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1200,
        velocityX: meta?.velocityX ?? 0,
        canGoPrev,
        canGoNext,
      });
      onDragEnd?.(outcome, { side, deltaX, ...meta });
    },
    [canGoPrev, canGoNext, onDragEnd]
  );

  if (!enabled) return null;

  return (
    <>
      <EdgeZone
        side="left"
        enabled={canGoPrev}
        canvasHeight={canvasHeight}
        insetBottom={leftInsetBottom}
        zoneWidth={leftZoneWidth}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={handleDragEnd}
      />
      <EdgeZone
        side="right"
        enabled={canGoNext}
        canvasHeight={canvasHeight}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={handleDragEnd}
      />
    </>
  );
}
