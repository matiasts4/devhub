'use client';

import { useCallback, useEffect, useMemo } from 'react';
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
          <span>
            {requestedRendererMode === 'vte-experimental' ? 'native auto' : requestedRendererMode}
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
    </div>
  );
}
