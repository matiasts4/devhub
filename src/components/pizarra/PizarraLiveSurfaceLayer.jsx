'use client';

import CanvasTerminal from './CanvasTerminal';
import PizarraBrowserSurface from './PizarraBrowserSurface';
import { useCanvasViewport } from '@/lib/pizarra/canvasViewport';
import { SHAPE_TYPES } from '@/lib/pizarra/shapeModel';

export default function PizarraLiveSurfaceLayer({
  elements,
  selectedElementIds,
  activeTerminalId = null,
  onSelect,
  onMoveElement,
  onActivateTerminal,
  onUpdateElement,
  onRemoveElement,
}) {
  const { projectRect, zoom } = useCanvasViewport();

  const surfaceShapes = elements.filter(
    (shape) => shape.type === SHAPE_TYPES.TERMINAL || shape.type === SHAPE_TYPES.BROWSER
  );

  if (surfaceShapes.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="pizarra-live-surface-layer"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {surfaceShapes.map((shape) => {
        const bounds = projectRect({
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        });
        const selected = selectedElementIds.includes(shape.id);
        const resolvedZoom = zoom > 0 ? zoom : 1;
        const handleMove = ({ totalDeltaX = 0, totalDeltaY = 0 }) => {
          onMoveElement?.(shape.id, {
            x: shape.x + totalDeltaX / resolvedZoom,
            y: shape.y + totalDeltaY / resolvedZoom,
          });
        };

        if (shape.type === SHAPE_TYPES.TERMINAL) {
          return (
            <CanvasTerminal
              key={shape.id}
              terminalId={shape.id}
              shape={shape}
              bounds={bounds}
              selected={selected}
              onSelect={onSelect}
              onMove={handleMove}
              onActivatePanel={() => onActivateTerminal?.(shape.id)}
              cwd={shape.cwd}
              initialCommand={shape.initialCommand}
              isActivePanel={activeTerminalId === shape.id}
              requestedRendererMode={shape.requestedRendererMode || 'vte-experimental'}
              onClose={() => onRemoveElement?.(shape.id)}
            />
          );
        }

        return (
          <PizarraBrowserSurface
            key={shape.id}
            shape={shape}
            bounds={bounds}
            selected={selected}
            onSelect={onSelect}
            onMove={handleMove}
            onUpdateElement={onUpdateElement}
            onClose={() => onRemoveElement?.(shape.id)}
          />
        );
      })}
    </div>
  );
}
