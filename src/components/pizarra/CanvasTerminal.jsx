'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import TerminalTTY from '@/components/TerminalTTY';
import { resizeNativeVtePanel } from '@/lib/terminal/nativeVteBridge';
import usePizarraSurfaceDrag from './usePizarraSurfaceDrag';
import {
  ensureSurfaceMotionKeyframes,
  resolveFrameVisual,
  resolveHandleSizing,
  FRAME_TRANSITION,
  SURFACE_ENTER_ANIMATION,
} from '@/lib/pizarra/surfaceMotion';

export default function CanvasTerminal({
  terminalId,
  shape,
  bounds,
  position,
  size,
  selected = false,
  zoom = 1,
  onSelect,
  onClose,
  onResize,
  onActivatePanel,
  onMove,
  onDragEnd,
  cwd,
  initialCommand,
  autoFocus = false,
  isActivePanel = false,
  requestedRendererMode = 'vte-experimental',
}) {
  const resolvedShape = shape || { id: terminalId, label: 'Terminal' };
  const resolvedBounds = useMemo(
    () =>
      bounds || {
        x: position?.x ?? 0,
        y: position?.y ?? 0,
        width: size?.width ?? 800,
        height: size?.height ?? 600,
        screenX: position?.x ?? 0,
        screenY: position?.y ?? 0,
      },
    [bounds, position, size]
  );

  const handleSurfaceSelect = useCallback(
    (shapeId) => {
      onSelect?.(shapeId);
      onActivatePanel?.(terminalId);
    },
    [onActivatePanel, onSelect, terminalId]
  );

  // pizarra-motion: inject shared enter keyframes once.
  useEffect(() => {
    ensureSurfaceMotionKeyframes();
  }, []);

  // pizarra-motion: hover state drives the idle border/shadow highlight.
  const [isHovered, setIsHovered] = useState(false);
  const handleFrameMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleFrameMouseLeave = useCallback(() => setIsHovered(false), []);

  useEffect(() => {
    if (requestedRendererMode === 'vte-experimental' && resolvedBounds) {
      const inset = 10;
      const headerH = 28;
      resizeNativeVtePanel({
        panelId: terminalId,
        bounds: {
          x: (resolvedBounds.screenX ?? resolvedBounds.x) + inset,
          y: (resolvedBounds.screenY ?? resolvedBounds.y) + inset + headerH,
          width: Math.max(resolvedBounds.width - inset * 2, 1),
          height: Math.max(resolvedBounds.height - inset * 2 - headerH, 1),
        },
      }).catch(() => {});
    }
  }, [resolvedBounds, terminalId, requestedRendererMode]);

  const handleFrameMouseDown = useCallback(
    (event) => {
      event.stopPropagation();
      handleSurfaceSelect(resolvedShape.id);
    },
    [handleSurfaceSelect, resolvedShape.id]
  );

  // pizarra-drag-resize-polish: border-based resize. The Konva
  const [isDragging, setIsDragging] = useState(false);

  // Transformer is excluded for TERMINAL shapes (composite type), so
  // the user grabs any of the 8 edge/corner handles and drags to
  // resize. The resize is live (calls onResize every mousemove) so
  // the visual feedback stays in sync with the cursor.
  const handleResizeStart = useCallback(
    (event, dir) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      handleSurfaceSelect(resolvedShape.id);

      // pizarra-resize-canvas-coords: resize in CANVAS space using the
      // real shape geometry (shape.x/y/width/height), NOT the zeroed
      // localBounds the parent passes for positioning. Screen deltas are
      // divided by zoom so the surface tracks the cursor 1:1 and the
      // OPPOSITE edge stays anchored — this fixes the teleport-to-origin
      // bug where grabbing the n/w edge jumped the panel to canvas (0,0).
      const z = zoom > 0 ? zoom : 1;
      const startBounds = {
        x: resolvedShape.x ?? resolvedBounds.x,
        y: resolvedShape.y ?? resolvedBounds.y,
        width: resolvedShape.width ?? resolvedBounds.width,
        height: resolvedShape.height ?? resolvedBounds.height,
      };
      const startX = event.clientX;
      const startY = event.clientY;
      let lastBounds = startBounds;
      const minW = 160;
      const minH = 120;

      const handleMouseMove = (moveEvent) => {
        const dx = (moveEvent.clientX - startX) / z;
        const dy = (moveEvent.clientY - startY) / z;
        const next = { ...startBounds };
        if (dir.includes('e')) {
          next.width = Math.max(minW, startBounds.width + dx);
        }
        if (dir.includes('s')) {
          next.height = Math.max(minH, startBounds.height + dy);
        }
        if (dir.includes('w')) {
          const w = Math.max(minW, startBounds.width - dx);
          next.width = w;
          next.x = startBounds.x + (startBounds.width - w);
        }
        if (dir.includes('n')) {
          const h = Math.max(minH, startBounds.height - dy);
          next.height = h;
          next.y = startBounds.y + (startBounds.height - h);
        }
        lastBounds = next;
        onResize?.(next);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      setIsDragging(true);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [handleSurfaceSelect, onResize, resolvedBounds, resolvedShape, zoom]
  );

  const handleHeaderMouseDown = usePizarraSurfaceDrag({
    surfaceId: resolvedShape.id,
    bounds: resolvedBounds,
    onSelect: handleSurfaceSelect,
    onMove,
    onDragEnd: (args) => {
      setIsDragging(false);
      onDragEnd?.(args);
    },
    onDragStart: () => setIsDragging(true),
    moveMeta: { terminalId },
    // pizarra-motion: NO per-tick native IPC during drag. The native VTE
    // surface is suspended while dragging (suspendNativeSurface={isDragging}),
    // so repositioning it every RAF was wasted IPC that also caused the
    // "native window follows at the wrong offset" flicker. The surface is
    // repositioned exactly ONCE on drop, by the resolvedBounds effect above,
    // after the new x/y are committed to the reducer.
  });

  // pizarra-fix-strictmode-unmount-2026-06-01: REMOVED the
  // close-on-unmount useEffect entirely. The previous version
  // (pizarra-add-terminal-bugfix) used useEffect(..., []) with a
  // cleanup that called onClose, intending to fire only on real
  // unmount. But React.StrictMode in development (src/index.js)
  // intentionally double-mounts components to surface side effects,
  // which fires the cleanup on the FIRST mount/unmount cycle —
  // dispatching DELETE_ELEMENT for the just-added terminal. The
  // symptom: clicking "Add Terminal" creates the shape
  // (state.elements.length goes 0 → 1), then immediately deletes
  // it (1 → 0) because the cleanup runs.
  //
  // The onClose prop is now ONLY called from the explicit X-button
  // click handler below. Unmount cleanup is a no-op. TTY session
  // teardown is handled by the PizarraPane via a separate
  // 'devhub:terminal-session-closing' custom event (see
  // PizarraPane.jsx).
  void onClose; // keep the prop in the signature for the X button below

  const frameVisual = resolveFrameVisual({ selected, hovered: isHovered, dragging: isDragging });
  const handleSizing = resolveHandleSizing(zoom);

  return (
    <div
      data-testid="canvas-terminal-container"
      style={{
        position: 'absolute',
        left: resolvedBounds.x,
        top: resolvedBounds.y,
        width: resolvedBounds.width,
        height: resolvedBounds.height,
        pointerEvents: 'none',
        animation: SURFACE_ENTER_ANIMATION,
        transformOrigin: 'center center',
        willChange: 'transform',
      }}
    >
      <div
        onMouseDown={handleFrameMouseDown}
        onMouseEnter={handleFrameMouseEnter}
        onMouseLeave={handleFrameMouseLeave}
        data-pizarra-surface-dragging={isDragging ? 'true' : 'false'}
        data-pizarra-surface-selected={selected ? 'true' : 'false'}
        style={{
          position: 'absolute',
          inset: 10,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 18,
          border: frameVisual.border,
          boxShadow: frameVisual.boxShadow,
          transform: frameVisual.transform,
          transition: FRAME_TRANSITION,
          pointerEvents: 'auto',
        }}
      >
        <div
          data-testid="canvas-terminal-header"
          data-pizarra-surface-drag-handle="true"
          onMouseDown={handleHeaderMouseDown}
          style={{
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(7, 17, 28, 0.96)',
            color: '#d6e2ff',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'move',
            userSelect: 'none',
          }}
        >
          <span>{resolvedShape.label || 'Terminal'}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>
              {requestedRendererMode === 'vte-experimental' ? 'native auto' : requestedRendererMode}
            </span>
            <button
              type="button"
              data-testid="canvas-terminal-close"
              data-pizarra-close-button="true"
              title="Cerrar terminal"
              aria-label="Cerrar terminal"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onClose?.(resolvedShape.id);
              }}
              style={{
                width: 18,
                height: 18,
                padding: 2,
                background: 'transparent',
                border: 'none',
                color: '#9fb5d1',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
              }}
            >
              <X size={12} />
            </button>
          </span>
        </div>

        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
          <TerminalTTY
            id={terminalId}
            requestedRendererMode={requestedRendererMode}
            hideTitleBar
            onClose={onClose}
            onResize={onResize}
            onActivatePanel={onActivatePanel}
            cwd={cwd}
            initialCommand={initialCommand}
            autoFocus={autoFocus}
            isVisibleInLayout
            isActivePanel={isActivePanel}
            showQuickCopyButton={false}
            suspendNativeSurface={isDragging}
          />
        </div>
      </div>

      {/* pizarra-motion: zoom-aware resize handles. Hit areas scale inversely
          with zoom so they stay grabbable when zoomed out. They are fully
          invisible — discoverability comes from the cursor change on hover and
          the bright accent frame on selection. No corner squares/nubs (they
          looked bad and cluttered the surface). data-testids preserved. */}
      {selected &&
        (() => {
          const e = handleSizing.edge;
          const c = handleSizing.corner;
          const ins = handleSizing.inset;
          // FI = visible frame inset (the inner chrome sits 10px inside the
          // positioned container). Center the hit-areas ON the visible border
          // instead of on the container edge, so the grab zone lands exactly
          // where the user sees the frame — not in the empty gap above it.
          const FI = 10;
          const edgeStyle = (extra) => ({
            position: 'absolute',
            pointerEvents: 'auto',
            zIndex: 5,
            ...extra,
          });
          const cornerStyle = (extra) => ({
            position: 'absolute',
            width: c,
            height: c,
            pointerEvents: 'auto',
            zIndex: 6,
            ...extra,
          });
          return (
            <>
              <div
                data-testid="canvas-terminal-resize-n"
                onMouseDown={(ev) => handleResizeStart(ev, 'n')}
                style={edgeStyle({
                  top: FI - e / 2,
                  left: ins,
                  right: ins,
                  height: e,
                  cursor: 'ns-resize',
                })}
              />
              <div
                data-testid="canvas-terminal-resize-s"
                onMouseDown={(ev) => handleResizeStart(ev, 's')}
                style={edgeStyle({
                  bottom: FI - e / 2,
                  left: ins,
                  right: ins,
                  height: e,
                  cursor: 'ns-resize',
                })}
              />
              <div
                data-testid="canvas-terminal-resize-w"
                onMouseDown={(ev) => handleResizeStart(ev, 'w')}
                style={edgeStyle({
                  left: FI - e / 2,
                  top: ins,
                  bottom: ins,
                  width: e,
                  cursor: 'ew-resize',
                })}
              />
              <div
                data-testid="canvas-terminal-resize-e"
                onMouseDown={(ev) => handleResizeStart(ev, 'e')}
                style={edgeStyle({
                  right: FI - e / 2,
                  top: ins,
                  bottom: ins,
                  width: e,
                  cursor: 'ew-resize',
                })}
              />
              <div
                data-testid="canvas-terminal-resize-nw"
                onMouseDown={(ev) => handleResizeStart(ev, 'nw')}
                style={cornerStyle({ top: FI - c / 2, left: FI - c / 2, cursor: 'nwse-resize' })}
              />
              <div
                data-testid="canvas-terminal-resize-ne"
                onMouseDown={(ev) => handleResizeStart(ev, 'ne')}
                style={cornerStyle({ top: FI - c / 2, right: FI - c / 2, cursor: 'nesw-resize' })}
              />
              <div
                data-testid="canvas-terminal-resize-sw"
                onMouseDown={(ev) => handleResizeStart(ev, 'sw')}
                style={cornerStyle({ bottom: FI - c / 2, left: FI - c / 2, cursor: 'nesw-resize' })}
              />
              <div
                data-testid="canvas-terminal-resize-se"
                onMouseDown={(ev) => handleResizeStart(ev, 'se')}
                style={cornerStyle({
                  bottom: FI - c / 2,
                  right: FI - c / 2,
                  cursor: 'nwse-resize',
                })}
              />
            </>
          );
        })()}
    </div>
  );
}
