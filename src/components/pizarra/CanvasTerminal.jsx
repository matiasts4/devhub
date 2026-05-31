'use client';

import { useCallback, useEffect, useRef } from 'react';
import TerminalTTY from '@/components/TerminalTTY';
import { resizeNativeVtePanel } from '@/lib/terminal/nativeVteBridge';

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
  const dragCleanupRef = useRef(null);
  const dragRafRef = useRef(null);
  const placeholderRef = useRef(null);
  const boundsRef = useRef(resolvedBounds);
  useEffect(() => { boundsRef.current = resolvedBounds; }, [resolvedBounds]);
  const resolvedShape = shape || { id: terminalId, label: 'Terminal' };
  const resolvedBounds = bounds || {
    x: position?.x ?? 0,
    y: position?.y ?? 0,
    width: size?.width ?? 800,
    height: size?.height ?? 600,
  };

  const handleFrameMouseDown = useCallback(
    (event) => {
      event.stopPropagation();
      onSelect?.(resolvedShape.id);
      onActivatePanel?.(terminalId);
    },
    [onActivatePanel, onSelect, resolvedShape.id, terminalId]
  );

  const handleHeaderMouseDown = useCallback(
    (event) => {
      if (event.button !== 0) return;

      handleFrameMouseDown(event);
      event.preventDefault();

      const lastPointer = {
        x: event.clientX,
        y: event.clientY,
      };
      const startPointer = {
        x: event.clientX,
        y: event.clientY,
      };

      const stopDragSync = () => {
        if (dragRafRef.current !== null) {
          cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = null;
        }
      };

      const handleMouseMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - lastPointer.x;
        const deltaY = moveEvent.clientY - lastPointer.y;
        const totalDeltaX = moveEvent.clientX - startPointer.x;
        const totalDeltaY = moveEvent.clientY - startPointer.y;

        if (deltaX === 0 && deltaY === 0) return;

        lastPointer.x = moveEvent.clientX;
        lastPointer.y = moveEvent.clientY;
        onMove?.({
          id: resolvedShape.id,
          terminalId,
          deltaX,
          deltaY,
          totalDeltaX,
          totalDeltaY,
        });

        // SYNC NATIVE SURFACE POSITION DIRECTLY
        const b = boundsRef.current;
        const inset = 10;
        const headerH = 28;
        resizeNativeVtePanel({
          panelId: terminalId,
          bounds: {
            x: b.x + totalDeltaX + inset,
            y: b.y + totalDeltaY + inset + headerH,
            width: Math.max(b.width - inset * 2, 1),
            height: Math.max(b.height - inset * 2 - headerH, 1),
          },
        }).catch(() => {});
      };

      const handleMouseUp = () => {
        stopDragSync();
        cleanupDrag();
      };

      const cleanupDrag = () => {
        stopDragSync();
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        if (dragCleanupRef.current === cleanupDrag) {
          dragCleanupRef.current = null;
        }
      };

      dragCleanupRef.current?.();
      dragCleanupRef.current = cleanupDrag;
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [handleFrameMouseDown, onMove, resolvedShape.id, terminalId]
  );

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      onClose?.();
    };
  }, [onClose]);

  return (
    <div
      data-testid="canvas-terminal-container"
      ref={placeholderRef}
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
