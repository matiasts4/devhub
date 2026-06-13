/**
 * PizarraMinimap — bottom-right minimap HUD for the pizarra canvas.
 *
 * pizarra-minimap: shows a 180x120 mini-overview of the world coordinate
 * space. Hidden by default; fades in when the user pans/zooms and
 * auto-hides 1500ms after the last interaction. Clicking the minimap
 * pans the canvas so the click point lands at the viewport center.
 * Clicking an element marker pans AND selects that element. The
 * viewport indicator can be dragged to continuously pan the canvas.
 *
 * Coordinates: see hooks/usePizarraMinimap.js — the hook owns the
 * world↔minimap mapping and the visibility timer.
 */

'use client';

import React, { useCallback, useRef, useState } from 'react';
import usePizarraMinimap from './hooks/usePizarraMinimap';

// Minimap pixel dimensions (matches the CSS below). The label is 12px
// tall; padding 6px on each side; the content inner area gets whatever
// remains.
const MINIMAP_W = 180;
const MINIMAP_H = 120;
const MINIMAP_PADDING = 6;
const LABEL_H = 12;
const MINIMAP_BG = 'var(--surface-card, #1f2937)';
const MINIMAP_BORDER = '1px solid var(--border-subtle, #2c3340)';
const MINIMAP_PANEL_RADIUS = 'var(--chrome-radius-panel, 6px)';
const MINIMAP_CONTROL_RADIUS = 'var(--chrome-radius-control, 4px)';
const MINIMAP_SHADOW = 'var(--shadow-soft, 0 1px 4px rgba(0,0,0,0.3))';
const MINIMAP_TEXT = 'var(--text-muted, #94a3b8)';
const MINIMAP_ACCENT = 'var(--accent-primary, #3b82f6)';

// Type → muted color (rgba, low alpha so the bg shows through).
const ELEMENT_COLORS = {
  rect: 'rgba(148, 163, 184, 0.6)',
  circle: 'rgba(148, 163, 184, 0.6)',
  line: 'rgba(245, 158, 11, 0.5)',
  arrow: 'rgba(245, 158, 11, 0.5)',
  textbox: 'rgba(139, 92, 246, 0.5)',
  terminal: 'rgba(34, 197, 94, 0.55)',
  browser: 'rgba(59, 130, 246, 0.55)',
};

function elementColor(type) {
  return ELEMENT_COLORS[type] || 'rgba(148, 163, 184, 0.6)';
}

/**
 * Compute the bbox of a single element in world coordinates.
 * Mirrors the hook's elementBbox() — duplicated here to avoid coupling
 * the render to the hook's internal helper. If the hook changes its
 * bbox rules, this needs to change too.
 */
function elementBbox(element) {
  if (!element || typeof element.x !== 'number' || typeof element.y !== 'number') {
    return null;
  }
  const x = element.x;
  const y = element.y;
  switch (element.type) {
    case 'rect':
      return {
        x,
        y,
        width: typeof element.width === 'number' ? element.width : 0,
        height: typeof element.height === 'number' ? element.height : 0,
      };
    case 'circle': {
      const r = typeof element.radius === 'number' ? element.radius : 0;
      return { x: x - r, y: y - r, width: r * 2, height: r * 2 };
    }
    case 'line':
    case 'arrow': {
      const points = Array.isArray(element.points) ? element.points : [];
      if (points.length < 2) return { x, y, width: 0, height: 0 };
      let minX = x + points[0];
      let minY = y + points[1];
      let maxX = minX;
      let maxY = minY;
      for (let i = 2; i + 1 < points.length; i += 2) {
        const px = x + points[i];
        const py = y + points[i + 1];
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    case 'textbox': {
      const fontSize = typeof element.fontSize === 'number' ? element.fontSize : 16;
      const w = typeof element.width === 'number' && element.width > 0 ? element.width : 120;
      return { x, y, width: w, height: fontSize * 1.4 };
    }
    case 'terminal':
      return {
        x,
        y,
        width: typeof element.width === 'number' && element.width > 0 ? element.width : 640,
        height: typeof element.height === 'number' && element.height > 0 ? element.height : 400,
      };
    case 'browser':
      return {
        x,
        y,
        width: typeof element.width === 'number' && element.width > 0 ? element.width : 1024,
        height: typeof element.height === 'number' && element.height > 0 ? element.height : 700,
      };
    default:
      return null;
  }
}

export default function PizarraMinimap({ elements, onSelectElement, idleMs = 1500 }) {
  const {
    visible,
    worldBounds,
    visibleWorldRect,
    minimapToWorld,
    handlePanTo,
    setPan,
    onMouseEnter,
    onMouseLeave,
  } = usePizarraMinimap({ elements, onSelectElement, idleMs });

  // ── Drag state ──────────────────────────────────────────────────────────
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    downX: 0,
    downY: 0,
    hitElementId: null,
  });
  const [dragging, setDragging] = useState(false);

  const innerWidth = MINIMAP_W - MINIMAP_PADDING * 2;
  const innerHeight = MINIMAP_H - MINIMAP_PADDING * 2 - LABEL_H;

  // ── Pointer handlers ────────────────────────────────────────────────────
  const onPointerDown = useCallback((event) => {
    event.stopPropagation();
    // Capture the pointer so we keep getting move events even if the
    // cursor leaves the minimap content area. Some test environments
    // don't implement setPointerCapture, hence the try/catch.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (e) {
      // ignore
    }
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      downX: event.clientX,
      downY: event.clientY,
      // If the user pressed on an element marker, remember its id so we
      // can fire onSelectElement on a click (no drag).
      hitElementId:
        event.target && event.target.dataset && event.target.dataset.elementId
          ? event.target.dataset.elementId
          : null,
    };
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (event) => {
      if (!dragRef.current.active) return;
      event.stopPropagation();
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;

      // The minimap and the canvas share the same screen-pixel space at
      // the top level — a drag of dx screen pixels on the minimap maps
      // to a dx screen-pixel shift in canvas pan. (The inner content
      // uses worldBounds→innerWidth, but the user's drag is measured in
      // screen pixels via clientX/Y.)
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      // Update the start so the next move computes a delta from here.
      dragRef.current.startX = event.clientX;
      dragRef.current.startY = event.clientY;
      // If we've moved more than the click threshold, clear the element
      // hit so we don't fire onSelectElement on a drag-release.
      if (
        Math.abs(event.clientX - dragRef.current.downX) > 4 ||
        Math.abs(event.clientY - dragRef.current.downY) > 4
      ) {
        dragRef.current.hitElementId = null;
      }
    },
    [setPan]
  );

  const onPointerUp = useCallback(
    (event) => {
      if (!dragRef.current.active) return;
      event.stopPropagation();
      const hitId = dragRef.current.hitElementId;
      const downX = dragRef.current.downX;
      const downY = dragRef.current.downY;
      dragRef.current.active = false;
      setDragging(false);

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (e) {
        // ignore
      }

      // Click = pointer didn't move more than 4px between down and up.
      // Pan to the click point and (if an element marker was hit) also
      // select that element.
      const moved = Math.abs(event.clientX - downX) > 4 || Math.abs(event.clientY - downY) > 4;
      if (moved) return;

      const contentRect = event.currentTarget.getBoundingClientRect
        ? event.currentTarget.getBoundingClientRect()
        : { left: 0, top: 0 };
      const localX = event.clientX - contentRect.left;
      const localY = event.clientY - contentRect.top;
      const world = minimapToWorld(localX, localY);
      handlePanTo(world.x, world.y);
      if (hitId) {
        onSelectElement(hitId);
      }
    },
    [handlePanTo, minimapToWorld, onSelectElement]
  );

  // ── Render ──────────────────────────────────────────────────────────────

  const containerStyle = {
    position: 'absolute',
    bottom: 36, // sits above the "N elements" badge (bottom: 12 + ~22 tall)
    right: 12,
    width: MINIMAP_W,
    height: MINIMAP_H,
    background: MINIMAP_BG,
    border: MINIMAP_BORDER,
    borderRadius: MINIMAP_PANEL_RADIUS,
    boxShadow: MINIMAP_SHADOW,
    padding: MINIMAP_PADDING,
    boxSizing: 'border-box',
    zIndex: 10,
    fontFamily: "'JetBrains Mono', monospace",
    pointerEvents: visible ? 'auto' : 'none',
    opacity: visible ? 1 : 0,
    transition: 'opacity 200ms ease',
    userSelect: 'none',
  };

  const labelStyle = {
    height: LABEL_H,
    fontSize: 8,
    color: MINIMAP_TEXT,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    lineHeight: `${LABEL_H}px`,
    fontWeight: 600,
  };

  const contentStyle = {
    position: 'relative',
    width: innerWidth,
    height: innerHeight,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--border-subtle, #2c3340)',
    borderRadius: MINIMAP_CONTROL_RADIUS,
    overflow: 'hidden',
    cursor: dragging ? 'grabbing' : 'crosshair',
    touchAction: 'none',
  };

  // Compute the viewport indicator's minimap position. The visible
  // world rect lives in world coords; we map its top-left to minimap
  // coords and clamp width/height to the inner area so a very large
  // viewport doesn't overflow.
  const vpMinX = ((visibleWorldRect.x - worldBounds.x) / worldBounds.width) * innerWidth;
  const vpMinY = ((visibleWorldRect.y - worldBounds.y) / worldBounds.height) * innerHeight;
  const vpW = (visibleWorldRect.width / worldBounds.width) * innerWidth;
  const vpH = (visibleWorldRect.height / worldBounds.height) * innerHeight;

  return (
    <div
      data-testid="pizarra-minimap"
      data-visible={visible ? 'true' : 'false'}
      style={containerStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div data-testid="pizarra-minimap-label" style={labelStyle}>
        MINIMAP
      </div>
      <div
        data-testid="pizarra-minimap-content"
        style={contentStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {elements.map((el) => {
          const b = elementBbox(el);
          if (!b) return null;
          const fx = (b.x - worldBounds.x) / worldBounds.width;
          const fy = (b.y - worldBounds.y) / worldBounds.height;
          const fw = b.width / worldBounds.width;
          const fh = b.height / worldBounds.height;
          return (
            <div
              key={el.id}
              data-testid="pizarra-minimap-element"
              data-element-id={el.id}
              data-element-type={el.type}
              style={{
                position: 'absolute',
                left: fx * innerWidth,
                top: fy * innerHeight,
                width: Math.max(1, fw * innerWidth),
                height: Math.max(1, fh * innerHeight),
                background: elementColor(el.type),
                borderRadius: 1,
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
            />
          );
        })}

        <div
          data-testid="pizarra-minimap-viewport"
          style={{
            position: 'absolute',
            left: vpMinX,
            top: vpMinY,
            width: Math.max(2, vpW),
            height: Math.max(2, vpH),
            border: `1.5px solid ${MINIMAP_ACCENT}`,
            background: 'rgba(59, 130, 246, 0.1)',
            borderRadius: 2,
            pointerEvents: 'auto',
            cursor: 'grab',
          }}
        />
      </div>
    </div>
  );
}
