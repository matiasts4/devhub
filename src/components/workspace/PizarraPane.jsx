import { usePizarraState } from './usePizarraState';

/**
 * PizarraPane — whiteboard canvas area component.
 * Consumes usePizarraState hook for state management and localStorage persistence.
 */
export default function PizarraPane({ projectId }) {
  const { state } = usePizarraState(projectId);

  const elementCount = state.elements.size;

  return (
    <div className="h-full flex flex-col" data-testid="pizarra-pane">
      <div className="flex-1 flex items-center justify-center bg-[var(--background-secondary)]">
        <div className="text-center p-8">
          <div className="text-4xl mb-4 opacity-30">Pizarra</div>
          <p className="text-[var(--text-muted)] text-sm mb-2">
            Whiteboard canvas — {elementCount} element{elementCount !== 1 ? 's' : ''}
          </p>
          <p className="text-[var(--text-muted)] text-xs">
            viewport: ({state.viewport.x}, {state.viewport.y}) zoom: {state.viewport.zoom}x
          </p>
          {state.activeBoardId && (
            <p className="text-[var(--text-muted)] text-xs mt-1">board: {state.activeBoardId}</p>
          )}
          <p className="text-[var(--text-muted)] text-xs mt-1">tool: {state.activeTool}</p>
        </div>
      </div>
    </div>
  );
}
