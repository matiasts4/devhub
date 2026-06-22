'use client';

import { useEffect, useRef } from 'react';

const PAN_THRESHOLD_PX = 3;

function isEditableTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

/**
 * Canvas pan at the container boundary so navigation works over native
 * terminal/browser overlays (Space/Alt + drag, middle mouse).
 */
export default function usePizarraCanvasPan({
  containerRef,
  panRef,
  setPan,
  cancelPanAnimation,
  enabled = true,
  onPanStart,
  onPanEnd,
}) {
  const spacePressedRef = useRef(false);
  const panSessionRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    let attachRaf = null;
    let teardown = null;

    const endPan = (container) => {
      const session = panSessionRef.current;
      if (!session) return;
      panSessionRef.current = null;
      container?.removeAttribute('data-pizarra-canvas-panning');
      onPanEnd?.();
      window.removeEventListener('mousemove', session.onMove);
      window.removeEventListener('mouseup', session.onUp);
    };

    const attach = () => {
      const container = containerRef?.current;
      if (!container || disposed) return false;

      const onKeyDown = (event) => {
        if (event.code !== 'Space' || event.repeat || isEditableTarget(event.target)) return;
        spacePressedRef.current = true;
        container.setAttribute('data-pizarra-space-pan', 'true');
        event.preventDefault();
      };

      const onKeyUp = (event) => {
        if (event.code !== 'Space') return;
        spacePressedRef.current = false;
        container.removeAttribute('data-pizarra-space-pan');
        if (panSessionRef.current?.mode === 'space') {
          endPan(container);
        }
      };

      const shouldStartPan = (event) => {
        if (event.button === 1) return 'middle';
        if (event.button !== 0) return null;
        if (spacePressedRef.current) return 'space';
        if (event.altKey) return 'alt';
        return null;
      };

      const onMouseDown = (event) => {
        const mode = shouldStartPan(event);
        if (!mode) return;
        if (isEditableTarget(event.target)) return;

        event.preventDefault();
        event.stopPropagation();

        cancelPanAnimation?.();

        panSessionRef.current = {
          mode,
          startClientX: event.clientX,
          startClientY: event.clientY,
          originPanX: null,
          originPanY: null,
          moved: false,
          onMove: null,
          onUp: null,
        };

        const onMove = (moveEvent) => {
          const session = panSessionRef.current;
          if (!session) return;

          const dx = moveEvent.clientX - session.startClientX;
          const dy = moveEvent.clientY - session.startClientY;

          if (!session.moved) {
            if (Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
            session.moved = true;
            const currentPan = panRef?.current ?? { x: 0, y: 0 };
            session.originPanX = currentPan.x ?? 0;
            session.originPanY = currentPan.y ?? 0;
            container.setAttribute('data-pizarra-canvas-panning', 'true');
            onPanStart?.();
          }

          setPan({
            x: session.originPanX + dx,
            y: session.originPanY + dy,
          });
        };

        const onUp = () => {
          const session = panSessionRef.current;
          if (!session?.moved) {
            panSessionRef.current = null;
            return;
          }
          endPan(container);
        };

        panSessionRef.current.onMove = onMove;
        panSessionRef.current.onUp = onUp;
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      container.addEventListener('mousedown', onMouseDown, true);

      teardown = () => {
        endPan(container);
        spacePressedRef.current = false;
        container.removeAttribute('data-pizarra-space-pan');
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        container.removeEventListener('mousedown', onMouseDown, true);
      };
      return true;
    };

    if (!attach()) {
      attachRaf = window.requestAnimationFrame(() => {
        attachRaf = null;
        attach();
      });
    }

    return () => {
      disposed = true;
      if (attachRaf != null) {
        window.cancelAnimationFrame(attachRaf);
      }
      teardown?.();
    };
  }, [containerRef, panRef, enabled, setPan, cancelPanAnimation, onPanStart, onPanEnd]);
}
