'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import TerminalTTY from '@/components/TerminalTTY';
import { resizeNativeVtePanel } from '@/lib/terminal/nativeVteBridge';
import usePizarraSurfaceDrag from './usePizarraSurfaceDrag';

export default function CanvasTerminal({
  terminalId,
  shape,
  bounds,
  position,
  size,
  selected = false,
  onSelect,
  onClose,
  onResize,
  onActivatePanel,
  onMove,
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

      const startBounds = { ...resolvedBounds };
      const startX = event.clientX;
      const startY = event.clientY;
      let lastBounds = startBounds;
      const minW = 160;
      const minH = 120;

      const handleMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
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
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [handleSurfaceSelect, onResize, resolvedBounds, resolvedShape.id]
  );

  const handleHeaderMouseDown = usePizarraSurfaceDrag({
    surfaceId: resolvedShape.id,
    bounds: resolvedBounds,
    onSelect: handleSurfaceSelect,
    onMove,
    moveMeta: { terminalId },
    onNativeSync: ({ startBounds, totalDeltaX, totalDeltaY }) => {
      const inset = 10;
      const headerH = 28;
      resizeNativeVtePanel({
        panelId: terminalId,
        bounds: {
          x: (startBounds.screenX ?? startBounds.x) + totalDeltaX + inset,
          y: (startBounds.screenY ?? startBounds.y) + totalDeltaY + inset + headerH,
          width: Math.max(startBounds.width - inset * 2, 1),
          height: Math.max(startBounds.height - inset * 2 - headerH, 1),
        },
      }).catch(() => {});
    },
  });

  useEffect(() => {
    return () => {
      onClose?.();
    };
  }, [onClose]);

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
      }}
    >
      <div
        onMouseDown={handleFrameMouseDown}
        style={{
          position: 'absolute',
          inset: 10,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 14,
          border: selected ? '2px solid rgba(88,166,255,0.72)' : '1px solid rgba(88,166,255,0.28)',
          background: '#0a1019',
          boxShadow: '0 18px 48px rgba(3, 7, 18, 0.3)',
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
          />
        </div>
      </div>

      {/* pizarra-drag-resize-polish: 8 border resize handles.
          Visible only when selected. Edge handles (n/s/e/w) are 8px
          thick strips; corner handles (nw/ne/sw/se) are 14×14 squares.
          All have pointer-events enabled and route the mousedown
          through handleResizeStart. */}
      {selected && (
        <>
          <div
            data-testid="canvas-terminal-resize-n"
            onMouseDown={(e) => handleResizeStart(e, 'n')}
            style={{
              position: 'absolute',
              top: 0,
              left: 14,
              right: 14,
              height: 8,
              cursor: 'ns-resize',
              pointerEvents: 'auto',
              zIndex: 5,
            }}
          />
          <div
            data-testid="canvas-terminal-resize-s"
            onMouseDown={(e) => handleResizeStart(e, 's')}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 14,
              right: 14,
              height: 8,
              cursor: 'ns-resize',
              pointerEvents: 'auto',
              zIndex: 5,
            }}
          />
          <div
            data-testid="canvas-terminal-resize-w"
            onMouseDown={(e) => handleResizeStart(e, 'w')}
            style={{
              position: 'absolute',
              left: 0,
              top: 14,
              bottom: 14,
              width: 8,
              cursor: 'ew-resize',
              pointerEvents: 'auto',
              zIndex: 5,
            }}
          />
          <div
            data-testid="canvas-terminal-resize-e"
            onMouseDown={(e) => handleResizeStart(e, 'e')}
            style={{
              position: 'absolute',
              right: 0,
              top: 14,
              bottom: 14,
              width: 8,
              cursor: 'ew-resize',
              pointerEvents: 'auto',
              zIndex: 5,
            }}
          />
          <div
            data-testid="canvas-terminal-resize-nw"
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 14,
              height: 14,
              cursor: 'nwse-resize',
              pointerEvents: 'auto',
              zIndex: 6,
            }}
          />
          <div
            data-testid="canvas-terminal-resize-ne"
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 14,
              height: 14,
              cursor: 'nesw-resize',
              pointerEvents: 'auto',
              zIndex: 6,
            }}
          />
          <div
            data-testid="canvas-terminal-resize-sw"
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: 14,
              height: 14,
              cursor: 'nesw-resize',
              pointerEvents: 'auto',
              zIndex: 6,
            }}
          />
          <div
            data-testid="canvas-terminal-resize-se"
            onMouseDown={(e) => handleResizeStart(e, 'se')}
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 14,
              height: 14,
              cursor: 'nwse-resize',
              pointerEvents: 'auto',
              zIndex: 6,
            }}
          />
        </>
      )}
    </div>
  );
}
