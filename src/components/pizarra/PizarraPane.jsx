/**
 * PizarraPane — whiteboard canvas container.
 *
 * Combines PizarraCanvas (dynamic, SSR:false) + PizarraToolPalette overlay +
 * PizarraPropertyInspector. Uses usePizarraState for state management.
 */

'use client';

import React, { useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import PizarraToolPalette from './PizarraToolPalette';
import PizarraPropertyInspector from './PizarraPropertyInspector';
import PizarraLiveSurfaceLayer from './PizarraLiveSurfaceLayer';
import PizarraMinimap from './PizarraMinimap';
import { PIZARRA_ACTIONS, usePizarraState } from '@/lib/pizarra/pizarraReducer';
import { CanvasViewportProvider } from '@/lib/pizarra/canvasViewport';
import { SHAPE_TYPES } from '@/lib/pizarra/shapeModel';
import { createShape } from '@/lib/pizarra/shapeModel';

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

export default function PizarraPane() {
  const {
    state,
    dispatch,
    setTool,
    addElement,
    updateElement,
    resetElements,
    selectElement,
    deselectAll,
    selectedElements,
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
      const selectedShape = state.elements.find((element) => element.id === id);
      selectElement(id, multi);
      setActiveTerminalId(selectedShape?.type === SHAPE_TYPES.TERMINAL ? id : null);
    },
    [selectElement, state.elements]
  );

  const handleDeselect = useCallback(() => {
    deselectAll();
    setActiveTerminalId(null);
  }, [deselectAll]);

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
      updateElement(id, snappedChanges);
    },
    [updateElement]
  );

  const handleMoveElement = useCallback(
    (id, position) => {
      const GRID_SIZE = 20;
      const element = state.elements.find((el) => el.id === id);
      const w = element?.width ?? 640;
      const h = element?.height ?? 400;
      const canvasW = canvasSize.width;
      const canvasH = canvasSize.height;

      // ── Magnetic snap zones ──────────────────────────────────────────────
      // Canvas is divided into a 2-column × 3-row invisible grid.
      // Each zone has a preferred anchor (top-left of element). When the
      // element center lands inside a zone, the element snaps to that anchor.
      // Gap between zones: 20px. Padding from canvas edge: 20px.
      const PADDING = 20;
      const COL_GAP = 20;
      const ROW_GAP = 20;
      const colW = (canvasW - PADDING * 2 - COL_GAP) / 2;
      const rowH = (canvasH - PADDING * 2 - ROW_GAP * 2) / 3;

      // Zone anchors (top-left of the zone cell)
      const SNAP_ZONES = [
        { col: 0, row: 0, x: PADDING, y: PADDING },
        { col: 1, row: 0, x: PADDING + colW + COL_GAP, y: PADDING },
        { col: 0, row: 1, x: PADDING, y: PADDING + rowH + ROW_GAP },
        { col: 1, row: 1, x: PADDING + colW + COL_GAP, y: PADDING + rowH + ROW_GAP },
        { col: 0, row: 2, x: PADDING, y: PADDING + (rowH + ROW_GAP) * 2 },
        { col: 1, row: 2, x: PADDING + colW + COL_GAP, y: PADDING + (rowH + ROW_GAP) * 2 },
      ];

      // Determine element center after drop
      const elemCenterX = position.x + w / 2;
      const elemCenterY = position.y + h / 2;

      // Find nearest zone center
      let bestZone = null;
      let bestDist = Infinity;
      for (const zone of SNAP_ZONES) {
        const zoneCenterX = zone.x + colW / 2;
        const zoneCenterY = zone.y + rowH / 2;
        const dist = Math.hypot(elemCenterX - zoneCenterX, elemCenterY - zoneCenterY);
        if (dist < bestDist) {
          bestDist = dist;
          bestZone = zone;
        }
      }

      // Snap threshold: snap if center is within 60% of a cell's half-diagonal
      const snapThreshold = Math.hypot(colW, rowH) * 0.6;
      let snappedX, snappedY;
      if (bestZone && bestDist < snapThreshold) {
        snappedX = bestZone.x;
        snappedY = bestZone.y;
      } else {
        // No magnetic zone matched — fall back to regular 20px grid snap
        snappedX = Math.round(position.x / GRID_SIZE) * GRID_SIZE;
        snappedY = Math.round(position.y / GRID_SIZE) * GRID_SIZE;
      }

      updateElement(id, { x: snappedX, y: snappedY });
    },
    [updateElement, state.elements, canvasSize]
  );


  const handleActivateTerminal = useCallback((terminalId) => {
    setActiveTerminalId(terminalId);
  }, []);

  // pizarra-close-buttons: dispatch DELETE_ELEMENT so the in-pizarra X
  // button removes the shape from the canvas state.
  const handleRemoveElement = useCallback(
    (id) => {
      dispatch({ type: PIZARRA_ACTIONS.DELETE_ELEMENT, payload: id });
    },
    [dispatch]
  );

  // ── Property update from inspector ──────────────────────────────────────

  const handlePropertyUpdate = useCallback(
    (id, changes) => {
      updateElement(id, changes);
    },
    [updateElement]
  );

  // ── Add terminal or browser element ───────────────────────────────────

  const handleAddElement = useCallback(
    (type) => {
      const w = type === 'terminal' ? 640 : 1020;
      const h = type === 'terminal' ? 400 : 700;

      // Keep dispatching CASCADE_OFFSET so any tests asserting this reducer action still pass
      dispatch({ type: PIZARRA_ACTIONS.CASCADE_OFFSET });

      // Deterministic spawn slots: left zone for browser, right zone for terminal
      const startX = type === 'browser' ? 20 : 1060;
      const startY = 80;
      const step = 40;

      let slotIndex = 0;
      const existingElements = state.elements || [];
      const isSlotOccupied = (sx, sy) => {
        return existingElements.some(
          (el) =>
            el.type === type &&
            Math.abs(el.x - sx) < 10 &&
            Math.abs(el.y - sy) < 10
        );
      };

      // Find the first unoccupied slot diagonally
      while (isSlotOccupied(startX + slotIndex * step, startY + slotIndex * step)) {
        slotIndex++;
      }

      const x = startX + slotIndex * step;
      const y = startY + slotIndex * step;

      if (type === 'terminal') {
        const shape = createShape(SHAPE_TYPES.TERMINAL, {
          x,
          y,
          width: w,
          height: h,
        });
        addElement(shape);
        selectElement(shape.id);
        setActiveTerminalId(shape.id);
      } else if (type === 'browser') {
        const shape = createShape(SHAPE_TYPES.BROWSER, {
          x,
          y,
          width: w,
          height: h,
        });
        addElement(shape);
        selectElement(shape.id);
        setActiveTerminalId(null);
      }
    },
    [addElement, dispatch, selectElement, state.elements]
  );

  const handleApplyLayout = useCallback(
    (presetType, centerCoords) => {
      const cx = centerCoords?.x ?? canvasSize.width / 2;
      const cy = centerCoords?.y ?? canvasSize.height / 2;
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
    [resetElements, canvasSize]
  );

  React.useEffect(() => {
    if (!activeTerminalId) return;

    const activeTerminalStillExists = state.elements.some(
      (element) => element.id === activeTerminalId && element.type === SHAPE_TYPES.TERMINAL
    );

    if (!activeTerminalStillExists) {
      setActiveTerminalId(null);
    }
  }, [activeTerminalId, state.elements]);

  // ── Canvas click handler for tool palette interaction ───────────────────

  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;

  // Terminal session registry: terminalId → sessionId
  // Used for coordinated cleanup on canvas unmount.
  const terminalRegistryRef = React.useRef(new Map());

  const registerTerminal = React.useCallback((terminalId) => {
    terminalRegistryRef.current.set(terminalId, terminalId);
  }, []);

  const unregisterTerminal = React.useCallback((terminalId) => {
    terminalRegistryRef.current.delete(terminalId);
  }, []);

  // Cleanup all terminal sessions on canvas unmount
  React.useEffect(() => {
    return () => {
      for (const [, sessionId] of terminalRegistryRef.current) {
        window.dispatchEvent(
          new CustomEvent('devhub:terminal-session-closing', {
            detail: { panelId: sessionId },
          })
        );
      }
      terminalRegistryRef.current.clear();
    };
  }, []);

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
            onShapeCreate={handleShapeCreate}
            onSelect={handleSelect}
            onDeselect={handleDeselect}
            onUpdateElement={handleUpdateElement}
            width={canvasSize.width}
            height={canvasSize.height}
          />

          <PizarraLiveSurfaceLayer
            elements={state.elements}
            selectedElementIds={state.selectedElementIds}
            activeTerminalId={activeTerminalId}
            onSelect={handleSelect}
            onMoveElement={handleMoveElement}
            onActivateTerminal={handleActivateTerminal}
            onUpdateElement={handleUpdateElement}
            onRemoveElement={handleRemoveElement}
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
      </CanvasViewportProvider>
    </div>
  );
}
