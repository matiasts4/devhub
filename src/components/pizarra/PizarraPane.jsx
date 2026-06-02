/**
 * PizarraPane — whiteboard canvas container.
 *
 * Combines PizarraCanvas (dynamic, SSR:false) + PizarraToolPalette overlay.
 * Uses usePizarraState for state management.
 *
 * Architecture note: PizarraInner is a child of CanvasViewportProvider so that
 * spawn (handleAddElement) and magnetic snap (handleMoveElement) are viewport-aware
 * — they account for current pan and zoom when computing canvas coordinates.
 */

'use client';

import React, { useRef, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import PizarraToolPalette from './PizarraToolPalette';
import PizarraLiveSurfaceLayer from './PizarraLiveSurfaceLayer';
import PizarraMinimap from './PizarraMinimap';
import CommandBar from '@/components/commandBar/CommandBar';
import { PIZARRA_ACTIONS, usePizarraState } from '@/lib/pizarra/pizarraReducer';
import { CanvasViewportProvider, useCanvasViewport } from '@/lib/pizarra/canvasViewport';
import { SHAPE_TYPES } from '@/lib/pizarra/shapeModel';
import { createShape } from '@/lib/pizarra/shapeModel';
import { createPizarraSurfaceController } from '@/lib/commandBar/surface/pizarraSurfaceController';
import { LiveSurfaceRegistryContext } from '@/lib/pizarra/useLiveSurfaceRegistry';

// SSR-safe canvas import
const PizarraCanvas = dynamic(() => import('./PizarraCanvas'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#94a3b8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        letterSpacing: '0.1em',
        background: '#1a1f2e',
      }}
    >
      LOADING CANVAS...
    </div>
  ),
});

export default function PizarraPane({
  projectId,
  workspaceId,
  dockState,
  onDockStateChange,
  browserWindowState,
  onBrowserWindowStateChange,
  workspaceWindows,
  activeWorkspaceWindowId,
  onWorkspaceWindowSelect,
  onWorkspaceWindowAdd,
  onWorkspaceWindowRemove,
}) {
  const contextValue = React.useContext(LiveSurfaceRegistryContext);
  const registry = contextValue || {
    surfaces: [],
    isLoaded: true,
    addSurface: () => {},
    removeSurface: () => {},
    updatePizarraLayout: () => {},
    resetSurfaces: () => {},
  };
  const {
    state,
    dispatch,
    setTool,
    addElement,
    updateElement,
    resetElements,
    selectElement,
    selectElements,
    deselectAll,
  } = usePizarraState();

  const [activeTerminalId, setActiveTerminalId] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef(null);
  // canvasContainerRef is passed to CanvasViewportProvider so ResizeObserver
  // tracks the canvas container position for coordinate translation.
  const canvasContainerRef = useRef(null);

  // Resize observer to track container size
  React.useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Unified elements state ──────────────────────────────────────────────

  const mergedElements = useMemo(() => {
    // Filter out any legacy/accidental terminal or browser elements from local state
    const localDrawings = state.elements.filter(
      (el) => el.type !== SHAPE_TYPES.TERMINAL && el.type !== SHAPE_TYPES.BROWSER
    );

    // Map registry surfaces into pizarra-compatible canvas shapes
    const registryShapes = (registry.surfaces || []).map((s) => ({
      ...s,
      x: s.pizarra?.x ?? 100,
      y: s.pizarra?.y ?? 100,
      width: s.pizarra?.width ?? 640,
      height: s.pizarra?.height ?? 400,
    }));

    return [...localDrawings, ...registryShapes];
  }, [state.elements, registry.surfaces]);

  const selectedElements = useMemo(() => {
    return mergedElements.filter((el) => state.selectedElementIds.includes(el.id));
  }, [mergedElements, state.selectedElementIds]);

  // ── Auto-select newly added registry surfaces ────────────────────────────
  const prevSurfacesRef = useRef([]);
  React.useEffect(() => {
    const prevIds = prevSurfacesRef.current.map((s) => s.id);
    const newSurfaces = registry.surfaces.filter((s) => !prevIds.includes(s.id));
    if (newSurfaces.length > 0) {
      const newId = newSurfaces[0].id;
      selectElement(newId);
      if (newSurfaces[0].type === 'terminal') {
        setActiveTerminalId(newId);
      }
    }
    prevSurfacesRef.current = registry.surfaces;
  }, [registry.surfaces, selectElement]);

  // ── Shape creation from canvas ──────────────────────────────────────────

  const handleShapeCreate = useCallback(
    (shape) => {
      addElement(shape);
      selectElement(shape.id);
    },
    [addElement, selectElement]
  );

  // ── Selection ───────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (id, multi = false) => {
      const selectedShape = mergedElements.find((element) => element.id === id);
      selectElement(id, multi);
      setActiveTerminalId(selectedShape?.type === SHAPE_TYPES.TERMINAL ? id : null);
    },
    [selectElement, mergedElements]
  );

  const handleDeselect = useCallback(() => {
    deselectAll();
    setActiveTerminalId(null);
  }, [deselectAll]);

  // ── Marquee selection ─────────────────────────────────────────────────────
  const handleMarqueeSelect = useCallback(
    (ids, additive = false) => {
      const nextIds = additive
        ? Array.from(new Set([...state.selectedElementIds, ...ids]))
        : ids;
      selectElements(nextIds);

      if (nextIds.length === 1) {
        const onlyShape = mergedElements.find((element) => element.id === nextIds[0]);
        setActiveTerminalId(onlyShape?.type === SHAPE_TYPES.TERMINAL ? nextIds[0] : null);
      } else {
        setActiveTerminalId(null);
      }
    },
    [selectElements, state.selectedElementIds, mergedElements]
  );

  // ── Transform end ───────────────────────────────────────────────────────

  const handleUpdateElement = useCallback(
    (id, changes) => {
      const GRID_SIZE = 20;
      const snappedChanges = { ...changes };
      if (typeof snappedChanges.x === 'number') {
        snappedChanges.x = Math.round(snappedChanges.x / GRID_SIZE) * GRID_SIZE;
      }
      if (typeof snappedChanges.y === 'number') {
        snappedChanges.y = Math.round(snappedChanges.y / GRID_SIZE) * GRID_SIZE;
      }
      if (typeof snappedChanges.width === 'number') {
        snappedChanges.width = Math.round(snappedChanges.width / GRID_SIZE) * GRID_SIZE;
      }
      if (typeof snappedChanges.height === 'number') {
        snappedChanges.height = Math.round(snappedChanges.height / GRID_SIZE) * GRID_SIZE;
      }

      const isRegistrySurface = registry.surfaces.some((s) => s.id === id);
      if (isRegistrySurface) {
        registry.updatePizarraLayout(id, snappedChanges);
      } else {
        updateElement(id, snappedChanges);
      }
    },
    [updateElement, registry.surfaces, registry.updatePizarraLayout]
  );

  const handleActivateTerminal = useCallback((terminalId) => {
    setActiveTerminalId(terminalId);
  }, []);

  const handleRemoveElement = useCallback(
    (id) => {
      const isRegistrySurface = registry.surfaces.some((s) => s.id === id);
      if (isRegistrySurface) {
        registry.removeSurface(id);
      } else {
        dispatch({ type: PIZARRA_ACTIONS.DELETE_ELEMENT, payload: id });
      }
    },
    [dispatch, registry.surfaces, registry.removeSurface]
  );

  React.useEffect(() => {
    if (!activeTerminalId) return;

    const activeTerminalStillExists = mergedElements.some(
      (element) => element.id === activeTerminalId && element.type === SHAPE_TYPES.TERMINAL
    );

    if (!activeTerminalStillExists) {
      setActiveTerminalId(null);
    }
  }, [activeTerminalId, mergedElements]);

  return (
    <div
      ref={containerRef}
      data-testid="pizarra-canvas"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#1a1f2e',
      }}
    >
      {/* Canvas viewport context — provides zoom/pan/coordinate translation */}
      <CanvasViewportProvider canvasContainerRef={canvasContainerRef}>
        {/* PizarraInner is a child of the provider so it can useCanvasViewport() */}
        <PizarraInner
          state={state}
          dispatch={dispatch}
          setTool={setTool}
          addElement={addElement}
          updateElement={updateElement}
          resetElements={resetElements}
          selectElement={selectElement}
          selectedElements={selectedElements}
          activeTerminalId={activeTerminalId}
          setActiveTerminalId={setActiveTerminalId}
          canvasSize={canvasSize}
          canvasContainerRef={canvasContainerRef}
          onShapeCreate={handleShapeCreate}
          onSelect={handleSelect}
          onDeselect={handleDeselect}
          onMarqueeSelect={handleMarqueeSelect}
          onUpdateElement={handleUpdateElement}
          onActivateTerminal={handleActivateTerminal}
          onRemoveElement={handleRemoveElement}
          mergedElements={mergedElements}
          projectId={projectId}
          workspaceId={workspaceId}
          dockState={dockState}
          onDockStateChange={onDockStateChange}
          browserWindowState={browserWindowState}
          onBrowserWindowStateChange={onBrowserWindowStateChange}
          workspaceWindows={workspaceWindows}
          activeWorkspaceWindowId={activeWorkspaceWindowId}
          onWorkspaceWindowSelect={onWorkspaceWindowSelect}
          onWorkspaceWindowAdd={onWorkspaceWindowAdd}
          onWorkspaceWindowRemove={onWorkspaceWindowRemove}
        />
      </CanvasViewportProvider>
    </div>
  );
}

// ── PizarraInner — viewport-aware child ─────────────────────────────────────
// This component lives inside CanvasViewportProvider so it can read
// pan/zoom via useCanvasViewport(). All spawn and snap calculations
// use the current visible canvas region, not raw fixed coordinates.

function PizarraInner({
  state,
  dispatch,
  setTool,
  addElement,
  updateElement,
  resetElements,
  selectElement,
  selectedElements,
  activeTerminalId,
  setActiveTerminalId,
  canvasSize,
  canvasContainerRef,
  onShapeCreate,
  onSelect,
  onDeselect,
  onMarqueeSelect,
  onUpdateElement,
  onActivateTerminal,
  onRemoveElement,
}) {
  const { zoom, pan, viewportToCanvas } = useCanvasViewport();

  // ── Viewport-aware visible region ────────────────────────────────────────
  // Returns the canvas-space bounding box of what is currently visible on screen.
  // Used to spawn elements inside the visible region and to compute snap zones.
  const getVisibleCanvasRegion = useCallback(() => {
    const w = canvasSize.width;
    const h = canvasSize.height;
    const z = zoom > 0 ? zoom : 1;
    // Top-left and bottom-right screen corners → canvas coords
    const topLeft = viewportToCanvas(0, 0);
    const bottomRight = viewportToCanvas(w, h);
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: (bottomRight.x - topLeft.x),
      height: (bottomRight.y - topLeft.y),
      z,
    };
  }, [canvasSize, zoom, viewportToCanvas]);

  // ── handleAddElement — spawns at current visible viewport center ─────────
  const handleAddElement = useCallback(
    (type, extraProps = {}) => {
      const w = type === 'terminal' ? 640 : 1020;
      const h = type === 'terminal' ? 400 : 700;

      dispatch({ type: PIZARRA_ACTIONS.CASCADE_OFFSET });

      // Compute visible region in canvas space
      const vis = getVisibleCanvasRegion();
      const visCenterX = vis.x + vis.width / 2;
      const visCenterY = vis.y + vis.height / 2;

      // Split the visible area into left (browser) and right (terminal) zones.
      // Each zone gets a small margin from the split line and canvas edges.
      const MARGIN = 20;
      const SPLIT_GAP = 20;
      const halfW = (vis.width - SPLIT_GAP) / 2;

      // Left zone anchor (browser): left side of visible area
      // Right zone anchor (terminal): right side of visible area
      const isTerminal = type === 'terminal';
      const zoneLeft = isTerminal
        ? vis.x + halfW + SPLIT_GAP   // right half
        : vis.x + MARGIN;              // left half

      // Vertical: center the element in the visible area
      const baseX = zoneLeft;
      const baseY = visCenterY - h / 2;

      // Step for additional elements of the same type (avoid exact overlap)
      const STEP = 40;
      let slotIndex = 0;
      const existingElements = state.elements || [];
      const isSlotOccupied = (sx, sy) =>
        existingElements.some(
          (el) =>
            el.type === type &&
            Math.abs(el.x - sx) < 10 &&
            Math.abs(el.y - sy) < 10
        );

      while (isSlotOccupied(baseX + slotIndex * STEP, baseY + slotIndex * STEP)) {
        slotIndex++;
      }

      const x = baseX + slotIndex * STEP;
      const y = baseY + slotIndex * STEP;

      // Create shape with position and extra props (label, initialCommand, url).
      // Ignore x/y from extraProps to preserve viewport-aware smart placement zones.
      const { x: ignoredX, y: ignoredY, ...cleanedExtraProps } = extraProps;
      const shape = createShape(
        isTerminal ? SHAPE_TYPES.TERMINAL : SHAPE_TYPES.BROWSER,
        { x, y, width: w, height: h, ...cleanedExtraProps }
      );
      addElement(shape);
      selectElement(shape.id);
      if (isTerminal) setActiveTerminalId(shape.id);
      else setActiveTerminalId(null);
      
      // Return the created shape so surface controller can access its id/label
      return shape;
    },
    [addElement, dispatch, selectElement, state.elements, getVisibleCanvasRegion, setActiveTerminalId]
  );

  // ── handleMoveElement — free placement (WYSIWYG drop) ────────────────────
  // pizarra-free-placement: the surface lands exactly where the user dropped
  // it. The previous 2×3 magnetic snap-zone grid yanked cards to fixed slots,
  // which felt like the card was being "thrown" away from the drop point and
  // left badly positioned. Free placement is predictable and intuitive: where
  // you release is where it stays. Coordinates are rounded to whole pixels so
  // the native VTE/WebKit surfaces don't land on sub-pixel offsets (which
  // causes blurry text on those real OS windows).
  const handleMoveElement = useCallback(
    (id, position) => {
      const shape = state.elements.find((el) => el.id === id);
      if (!shape) {
        updateElement(id, {
          x: Math.round(position.x),
          y: Math.round(position.y),
        });
        return;
      }

      const shapeWidth = shape.width || 640;
      const shapeHeight = shape.height || 400;

      const vis = getVisibleCanvasRegion();
      const zoom = vis.z || 1;
      const threshold = 150 / zoom; // 150px snapping threshold in screen space

      // Define potential viewport-relative snap targets in canvas space:
      const targets = [
        // Left split slot
        {
          name: 'left',
          x: vis.x + 20,
          y: vis.y + (vis.height - shapeHeight) / 2,
        },
        // Right split slot
        {
          name: 'right',
          x: vis.x + vis.width - shapeWidth - 20,
          y: vis.y + (vis.height - shapeHeight) / 2,
        },
        // Center slot
        {
          name: 'center',
          x: vis.x + (vis.width - shapeWidth) / 2,
          y: vis.y + (vis.height - shapeHeight) / 2,
        },
        // Dev split left
        {
          name: 'dev-left',
          x: vis.x + (vis.width / 2) - shapeWidth - 10,
          y: vis.y + (vis.height - shapeHeight) / 2,
        },
        // Dev split right
        {
          name: 'dev-right',
          x: vis.x + (vis.width / 2) + 10,
          y: vis.y + (vis.height - shapeHeight) / 2,
        }
      ];

      // Find the closest target within threshold
      let closestTarget = null;
      let minDistance = Infinity;

      for (const target of targets) {
        const dx = position.x - target.x;
        const dy = position.y - target.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < threshold && distance < minDistance) {
          minDistance = distance;
          closestTarget = target;
        }
      }

      let finalX = Math.round(position.x);
      let finalY = Math.round(position.y);

      if (closestTarget) {
        finalX = Math.round(closestTarget.x);
        finalY = Math.round(closestTarget.y);
      }

      updateElement(id, {
        x: finalX,
        y: finalY,
      });
    },
    [updateElement, state.elements, getVisibleCanvasRegion]
  );

  // ── Surface Controller for CommandBar ─────────────────────────────────────
  // Create a stable surface controller that CommandBar actions can use to spawn
  // and manipulate terminal/browser surfaces. The controller is recreated whenever
  // the underlying state changes, ensuring it always has fresh data.
  const surfaceController = useMemo(
    () =>
      createPizarraSurfaceController({
        addElement: handleAddElement,
        updateElement,
        setActiveTerminalId,
        shapes: state.elements,
        activeTerminalId,
      }),
    [handleAddElement, updateElement, setActiveTerminalId, state.elements, activeTerminalId]
  );

  // ── Apply layout preset ─────────────────────────────────────────────────
  const handleApplyLayout = useCallback(
    (presetType, centerCoords) => {
      // Use visible center if no explicit center provided
      const vis = getVisibleCanvasRegion();
      const cx = centerCoords?.x ?? (vis.x + vis.width / 2);
      const cy = centerCoords?.y ?? (vis.y + vis.height / 2);
      const newElements = [];

      if (presetType === 'dev-split') {
        newElements.push(
          createShape(SHAPE_TYPES.BROWSER, {
            x: cx - 810,
            y: cy - 300,
            width: 800,
            height: 600,
          })
        );
        newElements.push(
          createShape(SHAPE_TYPES.TERMINAL, {
            x: cx + 10,
            y: cy - 300,
            width: 800,
            height: 600,
          })
        );
      } else if (presetType === 'dev-trio') {
        newElements.push(
          createShape(SHAPE_TYPES.BROWSER, {
            x: cx - 810,
            y: cy - 300,
            width: 800,
            height: 600,
          })
        );
        newElements.push(
          createShape(SHAPE_TYPES.TERMINAL, {
            x: cx + 10,
            y: cy - 300,
            width: 800,
            height: 290,
            label: 'Terminal Left',
          })
        );
        newElements.push(
          createShape(SHAPE_TYPES.TERMINAL, {
            x: cx + 10,
            y: cy + 10,
            width: 800,
            height: 290,
            label: 'Terminal Right',
          })
        );
      } else if (presetType === 'dual-browser') {
        newElements.push(
          createShape(SHAPE_TYPES.BROWSER, {
            x: cx - 810,
            y: cy - 300,
            width: 800,
            height: 600,
            label: 'Browser 1',
          })
        );
        newElements.push(
          createShape(SHAPE_TYPES.BROWSER, {
            x: cx + 10,
            y: cy - 300,
            width: 800,
            height: 600,
            label: 'Browser 2',
          })
        );
      }

      resetElements(newElements);
      setActiveTerminalId(null);
    },
    [resetElements, getVisibleCanvasRegion, setActiveTerminalId]
  );

  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;

  return (
    <>
      {/* Tool palette — HTML overlay on top of Konva canvas */}
      <PizarraToolPalette
        value={state.activeTool}
        onChange={setTool}
        onAddElement={handleAddElement}
        onApplyLayout={handleApplyLayout}
      />

      {/* Property inspector removed — user-facing elements (terminal/browser) don't expose it */}

      {/* Konva canvas — dynamically imported, client-only */}
      <div
        ref={canvasContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <PizarraCanvas
          elements={state.elements}
          selectedElementIds={state.selectedElementIds}
          activeTool={state.activeTool}
          toolSettings={state.activeToolSettings}
          onShapeCreate={onShapeCreate}
          onSelect={onSelect}
          onDeselect={onDeselect}
          onMarqueeSelect={onMarqueeSelect}
          onUpdateElement={onUpdateElement}
          width={canvasSize.width}
          height={canvasSize.height}
        />

        <PizarraLiveSurfaceLayer
          elements={state.elements}
          selectedElementIds={state.selectedElementIds}
          activeTerminalId={activeTerminalId}
          onSelect={onSelect}
          onMoveElement={handleMoveElement}
          onActivateTerminal={onActivateTerminal}
          onUpdateElement={onUpdateElement}
          onRemoveElement={onRemoveElement}
        />
      </div>

      {/* Element count badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          background: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--chrome-radius-control)',
          padding: '2px 10px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: 'var(--text-muted)',
          fontWeight: 600,
          letterSpacing: '0.08em',
          boxShadow: 'var(--shadow-soft)',
          pointerEvents: 'none',
        }}
      >
        {state.elements.length} element{state.elements.length !== 1 ? 's' : ''}
      </div>

      {/* Minimap — bottom-right HUD, hidden until pan/zoom */}
      <PizarraMinimap elements={state.elements} onSelectElement={selectElement} />

      {/* CommandBar — natural language command palette (Cmd+Shift+K) */}
      <CommandBar surfaceController={surfaceController} />
    </>
  );
}
