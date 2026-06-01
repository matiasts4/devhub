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
      updateElement(id, changes);
    },
    [updateElement]
  );

  const handleMoveElement = useCallback(
    (id, position) => {
      updateElement(id, position);
    },
    [updateElement]
  );

  const handleActivateTerminal = useCallback((terminalId) => {
    setActiveTerminalId(terminalId);
  }, []);

  // pizarra-close-buttons: dispatch DELETE_ELEMENT so the in-pizarra X
  // buttons can close terminal/browser shapes (previously only the
  // property inspector's "Delete Shape" button removed them).
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
      const canvasCenter = {
        x: canvasSize.width / 2 - 320,
        y: canvasSize.height / 2 - 200,
      };

      // pizarra-ux-overhaul: read the cascade counter from the reducer
      // (the single source of truth) and apply the 24px step / modulo-8
      // wrap. Both add calls in a single React batch go through the
      // reducer sequentially so the second add reads the post-first
      // cascadeIndex value.
      const CASCADE_STEP = 24;
      const CASCADE_MODULUS = 8;
      const previousIndex = state.cascadeIndex ?? 0;
      const offsetX = CASCADE_STEP * (previousIndex % CASCADE_MODULUS);
      const offsetY = CASCADE_STEP * (previousIndex % CASCADE_MODULUS);

      // 1. Advance the cascade counter. The reducer's CASCADE_OFFSET
      //    case increments modulo 8.
      dispatch({ type: PIZARRA_ACTIONS.CASCADE_OFFSET });

      if (type === 'terminal') {
        const shape = createShape(SHAPE_TYPES.TERMINAL, {
          x: canvasCenter.x + offsetX,
          y: canvasCenter.y + offsetY,
        });
        addElement(shape);
        selectElement(shape.id);
        setActiveTerminalId(shape.id);
      } else if (type === 'browser') {
        const shape = createShape(SHAPE_TYPES.BROWSER, {
          x: canvasCenter.x + offsetX,
          y: canvasCenter.y + offsetY,
        });
        addElement(shape);
        selectElement(shape.id);
        setActiveTerminalId(null);
      }
    },
    [addElement, dispatch, selectElement, canvasSize, state.cascadeIndex]
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
        />

        {/* Property inspector — HTML overlay */}
        <PizarraPropertyInspector
          selectedElement={selectedElement}
          onUpdate={handlePropertyUpdate}
        />

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
      </CanvasViewportProvider>
    </div>
  );
}
