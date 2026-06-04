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
import { ModeTransitionShell } from '@/lib/pizarra/ModeTransitionShell';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';

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
  const [localSurfaces, setLocalSurfaces] = useState([]);
  const fallbackRegistry = useMemo(
    () => ({
      surfaces: localSurfaces,
      isLoaded: true,
      addSurface: (surface) => {
        const id = surface.id || `temp-${surface.type}-${Math.random().toString(36).substr(2, 9)}`;
        const panelId =
          surface.panelId || (surface.type === 'terminal' ? `panel-${id}` : `browser-${id}`);
        const finalSurface = { ...surface, id, panelId };
        setLocalSurfaces((prev) => {
          const exists = prev.find((s) => s.id === id);
          if (exists) {
            return prev.map((s) => (s.id === id ? { ...s, ...surface } : s));
          }
          return [...prev, finalSurface];
        });
        return finalSurface;
      },
      removeSurface: (id) => {
        setLocalSurfaces((prev) => prev.filter((s) => s.id !== id));
      },
      updatePizarraLayout: (id, layoutChanges) => {
        setLocalSurfaces((prev) =>
          prev.map((s) => {
            if (s.id === id) {
              return {
                ...s,
                pizarra: {
                  ...s.pizarra,
                  ...layoutChanges,
                },
              };
            }
            return s;
          })
        );
      },
      resetSurfaces: (nextSurfaces) => {
        setLocalSurfaces(nextSurfaces || []);
      },
    }),
    [localSurfaces]
  );

  const registry = contextValue || fallbackRegistry;
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

  // pizarra-divider-fluid: last committed values captured during rAF-batched
  // divider drag so that on mouseup we can force a final model update even
  // if the last rAF was cancelled. Declared at component level (hooks rule).
  const lastDividerVRef = useRef(null);
  const lastDividerHRef = useRef(null);

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

  // ── Initial layout for imported workspace surfaces (fix superposition) ────
  // When switching to pizarra, TWM registers current terminals (and browser)
  // with pizarra:{x:null,...} so pizarra can decide placement.
  // If they have no position yet, spread them with small offsets from a
  // visible center so they don't all pile at the same default (100,100).
  // We call updatePizarraLayout so the coords are persisted in the shared
  // registry (survives toggle/reload). Only once per surface id.
  const laidOutRegistryRef = useRef(new Set());
  React.useEffect(() => {
    if (!registry || typeof registry.updatePizarraLayout !== 'function') return;
    const surfaces = registry.surfaces || [];
    const needs = surfaces.filter((s) => {
      const p = s.pizarra || {};
      return (p.x == null || typeof p.x !== 'number') && !laidOutRegistryRef.current.has(s.id);
    });
    if (needs.length === 0) return;

    // Basic spread using canvasSize (no full viewport transform needed for initial)
    const w = canvasSize.width || 900;
    const h = canvasSize.height || 600;
    const baseX = Math.max(40, Math.round(w * 0.15));
    const baseY = Math.max(40, Math.round(h * 0.15));
    const step = 32;

    needs.forEach((s, idx) => {
      const isTerm = s.type === 'terminal' || s.type === SHAPE_TYPES.TERMINAL;
      const ww = s.pizarra?.width || (isTerm ? 640 : 1024);
      const hh = s.pizarra?.height || (isTerm ? 400 : 700);
      const layout = {
        x: baseX + idx * step,
        y: baseY + idx * step,
        width: ww,
        height: hh,
        visible: true,
      };
      try {
        registry.updatePizarraLayout(s.id, layout);
      } catch {}
      laidOutRegistryRef.current.add(s.id);
    });
  }, [registry, registry.surfaces, registry.updatePizarraLayout, canvasSize, SHAPE_TYPES]);

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
      const nextIds = additive ? Array.from(new Set([...state.selectedElementIds, ...ids])) : ids;
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

  // ── ModeTransitionShell wiring (pizarra-shared-view-state §7) ──────────────
  // When the pizarra-shared-view-state feature flag is ON, wrap the
  // pizarra root in <ModeTransitionShell> so the workspace↔pizarra
  // mode toggle plays a cross-fade + slide + scale animation
  // (330 ms total: 110 ms leaving + 220 ms entering; <= 50 ms when
  // prefers-reduced-motion: reduce). When the flag is OFF the shell
  // is a no-op and the legacy hard-cut behavior is preserved.
  const view = dockState?.maximizedView;
  const shellMaximizedView = view === 'pizarra' ? 'pizarra' : 'workspace';
  const reducedMotion = detectReducedMotionPref();
  const transitionEnabled = isPizarraSharedViewEnabled();

  // The pizarra chrome tree. Identical with or without the shell so
  // the flag-off path is a true no-op.
  const paneBody = (
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
          registry={registry}
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

  if (!transitionEnabled) {
    return paneBody;
  }

  return (
    <ModeTransitionShell
      maximizedView={shellMaximizedView}
      reducedMotion={reducedMotion}
      testId="mode-transition-shell"
      style={{ width: '100%', height: '100%' }}
    >
      {paneBody}
    </ModeTransitionShell>
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
  mergedElements,
  registry,
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
  const { zoom, pan, viewportToCanvas } = useCanvasViewport();

  // pizarra-empty-state: track if we auto-initialized on first access to avoid
  // showing completely blank dark "submarino" canvas with nothing visible.
  const didAutoInitRef = useRef(false);

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
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
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
        ? vis.x + halfW + SPLIT_GAP // right half
        : vis.x + MARGIN; // left half

      // Vertical: center the element in the visible area
      const baseX = zoneLeft;
      const baseY = visCenterY - h / 2;

      // Step for additional elements of the same type (avoid exact overlap)
      const STEP = 40;
      let slotIndex = 0;
      const existingElements = mergedElements || [];
      const isSlotOccupied = (sx, sy) =>
        existingElements.some(
          (el) =>
            el.type === type &&
            Math.abs((el.pizarra?.x ?? el.x) - sx) < 10 &&
            Math.abs((el.pizarra?.y ?? el.y) - sy) < 10
        );

      while (isSlotOccupied(baseX + slotIndex * STEP, baseY + slotIndex * STEP)) {
        slotIndex++;
      }

      const x = baseX + slotIndex * STEP;
      const y = baseY + slotIndex * STEP;

      // Create shape with position and extra props (label, initialCommand, url).
      // Ignore x/y from extraProps to preserve viewport-aware smart placement zones.
      const { x: ignoredX, y: ignoredY, ...cleanedExtraProps } = extraProps;

      if (isTerminal || type === 'browser') {
        const surfaceData = {
          type,
          pizarra: {
            x,
            y,
            width: w,
            height: h,
            visible: true,
          },
          url: cleanedExtraProps.url || (type === 'browser' ? 'http://localhost:3000/' : undefined),
          initialCommand: cleanedExtraProps.initialCommand,
          label: cleanedExtraProps.label || (isTerminal ? `Terminal` : `Browser`),
        };
        const addedSurface = registry.addSurface(surfaceData);
        if (addedSurface && addedSurface.id) {
          selectElement(addedSurface.id);
        }
        return addedSurface || surfaceData;
      } else {
        const shape = createShape(type, { x, y, width: w, height: h, ...cleanedExtraProps });
        addElement(shape);
        selectElement(shape.id);
        if (isTerminal) setActiveTerminalId(shape.id);
        else setActiveTerminalId(null);
        return shape;
      }
    },
    [
      addElement,
      dispatch,
      selectElement,
      mergedElements,
      getVisibleCanvasRegion,
      setActiveTerminalId,
      registry.addSurface,
    ]
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
      const shape = mergedElements.find((el) => el.id === id);
      if (!shape) {
        const isRegistrySurface = registry.surfaces.some((s) => s.id === id);
        if (isRegistrySurface) {
          registry.updatePizarraLayout(id, {
            x: Math.round(position.x),
            y: Math.round(position.y),
          });
        } else {
          updateElement(id, {
            x: Math.round(position.x),
            y: Math.round(position.y),
          });
        }
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
          x: vis.x + vis.width / 2 - shapeWidth - 10,
          y: vis.y + (vis.height - shapeHeight) / 2,
        },
        // Dev split right
        {
          name: 'dev-right',
          x: vis.x + vis.width / 2 + 10,
          y: vis.y + (vis.height - shapeHeight) / 2,
        },
      ];

      // pizarra-adapt: also consider edges of other live elements for alignment snap
      // (post-drag only; keeps it simple and non-surprising).
      (mergedElements || []).forEach((el) => {
        if (el.id === id) return;
        const ew = el.width || shapeWidth;
        const eh = el.height || shapeHeight;
        targets.push(
          { name: 'align-l', x: el.x || 0, y: position.y },
          { name: 'align-r', x: (el.x || 0) + ew - shapeWidth, y: position.y },
          { name: 'align-t', x: position.x, y: el.y || 0 },
          { name: 'align-b', x: position.x, y: (el.y || 0) + eh - shapeHeight }
        );
      });

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

      const isRegistrySurface = registry.surfaces.some((s) => s.id === id);
      if (isRegistrySurface) {
        registry.updatePizarraLayout(id, {
          x: finalX,
          y: finalY,
        });
      } else {
        updateElement(id, {
          x: finalX,
          y: finalY,
        });
      }
    },
    [
      updateElement,
      mergedElements,
      getVisibleCanvasRegion,
      registry.surfaces,
      registry.updatePizarraLayout,
    ]
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
        shapes: mergedElements,
        activeTerminalId,
      }),
    [handleAddElement, updateElement, setActiveTerminalId, mergedElements, activeTerminalId]
  );

  // ── Apply layout preset (or arrange action) ──────────────────────────────
  // Presets are destructive (reset + load a starting configuration) but now
  // use viewport-relative proportions so they adapt to current zoom/pan/ window size.
  // Arrange-* are non-destructive: they adapt the *current* selection (or all live
  // terminal/browser surfaces) using equal sizing + abut + centering. Directly
  // addresses "no tener que ajustar tan a detalle cada ventanita".
  const handleApplyLayout = useCallback(
    (presetType, centerCoords) => {
      const vis = getVisibleCanvasRegion();
      const cx = centerCoords?.x ?? vis.x + vis.width / 2;
      const cy = centerCoords?.y ?? vis.y + vis.height / 2;

      // Arrange actions (non-destructive, operate on live surfaces)
      if (presetType.startsWith('arrange-')) {
        const mode = presetType.slice('arrange-'.length); // h | v | equal | grid
        const live = (mergedElements || []).filter(
          (el) => el.type === SHAPE_TYPES.TERMINAL || el.type === SHAPE_TYPES.BROWSER
        );
        if (live.length === 0) return;

        // Targets: prefer current multi-selection if it contains live items
        const selectedLive = live.filter((el) => state.selectedElementIds.includes(el.id));
        const targets = selectedLive.length >= 2 ? selectedLive : live;

        const n = targets.length;
        if (n === 0) return;

        // Compute a sensible container from current selection bbox or visible
        const minX = Math.min(...targets.map((t) => t.x || 0));
        const minY = Math.min(...targets.map((t) => t.y || 0));
        const maxX = Math.max(...targets.map((t) => (t.x || 0) + (t.width || 400)));
        const maxY = Math.max(...targets.map((t) => (t.y || 0) + (t.height || 300)));
        const bboxW = Math.max(200, maxX - minX);
        const bboxH = Math.max(160, maxY - minY);

        const gap = 16;
        const updates = [];

        if (mode === 'h' || mode === 'horizontal') {
          // Equal widths, keep individual or average heights, abut left-to-right
          const totalGap = gap * (n - 1);
          const w = Math.max(160, Math.round((bboxW - totalGap) / n));
          let x = minX;
          const avgH = Math.max(
            120,
            Math.round(targets.reduce((s, t) => s + (t.height || 300), 0) / n)
          );
          targets
            .slice()
            .sort((a, b) => (a.x || 0) - (b.x || 0))
            .forEach((t, i) => {
              const h = Math.max(120, t.height || avgH);
              updates.push({ id: t.id, x, y: minY, width: w, height: h });
              x += w + gap;
            });
        } else if (mode === 'v' || mode === 'vertical') {
          const totalGap = gap * (n - 1);
          const h = Math.max(120, Math.round((bboxH - totalGap) / n));
          let y = minY;
          const avgW = Math.max(
            160,
            Math.round(targets.reduce((s, t) => s + (t.width || 400), 0) / n)
          );
          targets
            .slice()
            .sort((a, b) => (a.y || 0) - (b.y || 0))
            .forEach((t, i) => {
              const w = Math.max(160, t.width || avgW);
              updates.push({ id: t.id, x: minX, y, width: w, height: h });
              y += h + gap;
            });
        } else if (mode === 'equal') {
          // Same size for all (use median-ish or first clamped), keep positions
          const refW = Math.max(
            200,
            Math.round(targets.reduce((s, t) => s + (t.width || 400), 0) / n)
          );
          const refH = Math.max(
            160,
            Math.round(targets.reduce((s, t) => s + (t.height || 300), 0) / n)
          );
          targets.forEach((t) => {
            updates.push({ id: t.id, width: refW, height: refH });
          });
        } else if (mode === 'grid' || mode === 'grid-2') {
          // Simple 2-col grid (or 1-col if n<2), equal cell size, fill bbox-ish
          const cols = Math.min(2, n);
          const rows = Math.ceil(n / cols);
          const cellW = Math.max(160, Math.round((bboxW - gap * (cols - 1)) / cols));
          const cellH = Math.max(120, Math.round((bboxH - gap * (rows - 1)) / rows));
          targets
            .slice()
            .sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0))
            .forEach((t, i) => {
              const col = i % cols;
              const row = Math.floor(i / cols);
              const x = minX + col * (cellW + gap);
              const y = minY + row * (cellH + gap);
              updates.push({ id: t.id, x, y, width: cellW, height: cellH });
            });
        }

        // Apply (handleUpdateElement will grid-snap + route to registry/reducer)
        updates.forEach((u) => onUpdateElement?.(u.id, u));
        // Keep selection on the group
        if (updates.length) {
          // re-select to keep handles
          const ids = updates.map((u) => u.id);
          // best-effort: the onSelect in parent may support multi; fall back to first
          onSelect?.(ids[0], true);
        }
        return;
      }

      // Presets for live layouts: add via registry (so they appear as movable/resizable
      // terminal/browser surfaces in the pizarra). Drawings cleared for clean start.
      // This makes auto-init and applying layouts actually populate visible content.
      if (presetType === 'clear') {
        resetElements([]);
        setActiveTerminalId(null);
        return;
      }

      resetElements([]);
      setActiveTerminalId(null);

      if (presetType === 'dev-split') {
        const bw = Math.max(360, Math.round(vis.width * 0.62));
        const tw = Math.max(260, vis.width - bw - 24);
        const h = Math.max(300, Math.min(Math.round(vis.height * 0.82), 680));
        registry.addSurface({
          type: 'browser',
          pizarra: {
            x: cx - bw - 12,
            y: cy - h / 2,
            width: bw,
            height: h,
            visible: true,
          },
          url: 'http://localhost:3000/',
          label: 'Browser',
        });
        const added = registry.addSurface({
          type: 'terminal',
          pizarra: {
            x: cx + 12,
            y: cy - h / 2,
            width: tw,
            height: h,
            visible: true,
          },
          label: 'Terminal',
        });
        if (added?.id) setActiveTerminalId(added.id);
      } else if (presetType === 'dev-trio') {
        const bw = Math.max(340, Math.round(vis.width * 0.5));
        const tw = Math.max(240, vis.width - bw - 24);
        const h = Math.max(280, Math.min(Math.round(vis.height * 0.8), 620));
        const th = Math.max(140, Math.round((h - 14) / 2));
        registry.addSurface({
          type: 'browser',
          pizarra: {
            x: cx - bw - 12,
            y: cy - h / 2,
            width: bw,
            height: h,
            visible: true,
          },
          url: 'http://localhost:3000/',
          label: 'Browser',
        });
        registry.addSurface({
          type: 'terminal',
          pizarra: {
            x: cx + 12,
            y: cy - h / 2,
            width: tw,
            height: th,
            visible: true,
          },
          label: 'Terminal Top',
        });
        const added = registry.addSurface({
          type: 'terminal',
          pizarra: {
            x: cx + 12,
            y: cy - h / 2 + th + 14,
            width: tw,
            height: th,
            visible: true,
          },
          label: 'Terminal Bottom',
        });
        if (added?.id) setActiveTerminalId(added.id);
      } else if (presetType === 'dual-browser') {
        const bw = Math.max(300, Math.round((vis.width - 24) / 2));
        const h = Math.max(300, Math.min(Math.round(vis.height * 0.82), 680));
        registry.addSurface({
          type: 'browser',
          pizarra: {
            x: cx - bw - 12,
            y: cy - h / 2,
            width: bw,
            height: h,
            visible: true,
          },
          url: 'http://localhost:3000/',
          label: 'Browser 1',
        });
        registry.addSurface({
          type: 'browser',
          pizarra: {
            x: cx + 12,
            y: cy - h / 2,
            width: bw,
            height: h,
            visible: true,
          },
          url: 'http://localhost:3000/',
          label: 'Browser 2',
        });
      }
    },
    [
      resetElements,
      getVisibleCanvasRegion,
      setActiveTerminalId,
      registry,
      mergedElements,
      state.selectedElementIds,
      onUpdateElement,
      onSelect,
    ]
  );

  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;

  // --- Draggable layout dividers (zonas arrastrables) ---
  // Pure computation: find pairs of live surfaces whose edges are close and
  // overlapping; these become the thin draggable bars the user can pull to
  // auto-resize the two sides of the "zone".
  const liveSurfacesForDividers = useMemo(() => {
    return (mergedElements || []).filter(
      (el) => el.type === SHAPE_TYPES.TERMINAL || el.type === SHAPE_TYPES.BROWSER
    );
  }, [mergedElements]);

  const layoutDividers = useMemo(() => {
    const live = liveSurfacesForDividers;
    const result = [];
    const tol = 28;

    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];

        // vertical
        const aRight = (a.x || 0) + (a.width || 400);
        const bLeft = b.x || 0;
        if (Math.abs(aRight - bLeft) < tol) {
          const y1 = Math.max(a.y || 0, b.y || 0);
          const y2 = Math.min((a.y || 0) + (a.height || 300), (b.y || 0) + (b.height || 300));
          if (y2 - y1 > 60) {
            result.push({
              id: `v-${a.id}-${b.id}`,
              type: 'v',
              x: (aRight + bLeft) / 2,
              y: y1,
              length: y2 - y1,
              leftId: a.id,
              rightId: b.id,
            });
          }
        }
        const bRight = (b.x || 0) + (b.width || 400);
        const aLeft = a.x || 0;
        if (Math.abs(bRight - aLeft) < tol) {
          const y1 = Math.max(a.y || 0, b.y || 0);
          const y2 = Math.min((a.y || 0) + (a.height || 300), (b.y || 0) + (b.height || 300));
          if (y2 - y1 > 60) {
            result.push({
              id: `v-${b.id}-${a.id}`,
              type: 'v',
              x: (bRight + aLeft) / 2,
              y: y1,
              length: y2 - y1,
              leftId: b.id,
              rightId: a.id,
            });
          }
        }

        // horizontal
        const aBottom = (a.y || 0) + (a.height || 300);
        const bTop = b.y || 0;
        if (Math.abs(aBottom - bTop) < tol) {
          const x1 = Math.max(a.x || 0, b.x || 0);
          const x2 = Math.min((a.x || 0) + (a.width || 400), (b.x || 0) + (b.width || 400));
          if (x2 - x1 > 80) {
            result.push({
              id: `h-${a.id}-${b.id}`,
              type: 'h',
              y: (aBottom + bTop) / 2,
              x: x1,
              length: x2 - x1,
              topId: a.id,
              bottomId: b.id,
            });
          }
        }
        const bBottom = (b.y || 0) + (b.height || 300);
        const aTop = a.y || 0;
        if (Math.abs(bBottom - aTop) < tol) {
          const x1 = Math.max(a.x || 0, b.x || 0);
          const x2 = Math.min((a.x || 0) + (a.width || 400), (b.x || 0) + (b.width || 400));
          if (x2 - x1 > 80) {
            result.push({
              id: `h-${b.id}-${a.id}`,
              type: 'h',
              y: (bBottom + aTop) / 2,
              x: x1,
              length: x2 - x1,
              topId: b.id,
              bottomId: a.id,
            });
          }
        }
      }
    }
    return result;
  }, [liveSurfacesForDividers]);

  // Handler that the layer will call on mousedown of a divider.
  // We capture the pair and start a window-level drag that resizes the two
  // sides (auto-adjust) while the user moves the mouse. This is the "zonas
  // arrastrables" + "las ventanitas se autoajusten" behavior.
  const handleDividerMouseDown = useCallback(
    (e, divider) => {
      e.stopPropagation();
      e.preventDefault();

      const vis = getVisibleCanvasRegion();
      const z = vis && vis.z && vis.z > 0 ? vis.z : 1;

      const startClientX = e.clientX;
      const startClientY = e.clientY;

      const leftOrTop = liveSurfacesForDividers.find(
        (s) => s.id === (divider.leftId || divider.topId)
      );
      const rightOrBottom = liveSurfacesForDividers.find(
        (s) => s.id === (divider.rightId || divider.bottomId)
      );
      if (!leftOrTop || !rightOrBottom) return;

      const leftStart = {
        x: leftOrTop.x || 0,
        y: leftOrTop.y || 0,
        width: leftOrTop.width || 400,
        height: leftOrTop.height || 300,
      };
      const rightStart = {
        x: rightOrBottom.x || 0,
        y: rightOrBottom.y || 0,
        width: rightOrBottom.width || 400,
        height: rightOrBottom.height || 300,
      };

      const isV = divider.type === 'v';

      // pizarra-divider-fluid: batch onUpdateElement via rAF so we don't
      // spam React re-renders (and potential native surface churn) on every
      // mousemove pixel. Visual resize of the live surfaces still happens
      // because the surface components + their wrappers react to the final
      // bounds on the commit, and during the gesture the Konva frames + any
      // direct style from inner resizers keep things responsive. On pure
      // divider resize the per-surface isResizing flags stay false so their
      // suspendNativeSurface stays false (content visible, matching the
      // single-handle resize behavior).
      let raf = null;

      const scheduleUpdate = (updater, lastValue) => {
        if (raf) cancelAnimationFrame(raf);
        if (lastValue) {
          if (isV) lastDividerVRef.current = lastValue;
          else lastDividerHRef.current = lastValue;
        }
        raf = requestAnimationFrame(() => {
          raf = null;
          updater();
        });
      };

      const move = (moveEvent) => {
        const dx = (moveEvent.clientX - startClientX) / z;
        const dy = (moveEvent.clientY - startClientY) / z;

        if (isV) {
          const newLeftW = Math.max(160, leftStart.width + dx);
          const delta = newLeftW - leftStart.width;
          const leftUpdate = { width: newLeftW, x: leftStart.x };
          const rightUpdate = {
            x: rightStart.x + delta,
            width: Math.max(160, rightStart.width - delta),
          };
          scheduleUpdate(() => {
            onUpdateElement?.(divider.leftId, leftUpdate);
            onUpdateElement?.(divider.rightId, rightUpdate);
          }, { left: leftUpdate, right: rightUpdate });
        } else {
          const newTopH = Math.max(120, leftStart.height + dy);
          const delta = newTopH - leftStart.height;
          const topUpdate = { height: newTopH, y: leftStart.y };
          const bottomUpdate = {
            y: rightStart.y + delta,
            height: Math.max(120, rightStart.height - delta),
          };
          scheduleUpdate(() => {
            onUpdateElement?.(divider.topId, topUpdate);
            onUpdateElement?.(divider.bottomId, bottomUpdate);
          }, { top: topUpdate, bottom: bottomUpdate });
        }
      };

      const up = () => {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = null;
        }
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        // Final commit using last captured values (guarantees model matches
        // what user saw at end of gesture even if last rAF was cancelled).
        if (isV && lastDividerVRef.current) {
          const { left, right } = lastDividerVRef.current;
          onUpdateElement?.(divider.leftId, left);
          onUpdateElement?.(divider.rightId, right);
          lastDividerVRef.current = null;
        } else if (!isV && lastDividerHRef.current) {
          const { top, bottom } = lastDividerHRef.current;
          onUpdateElement?.(divider.topId, top);
          onUpdateElement?.(divider.bottomId, bottom);
          lastDividerHRef.current = null;
        }
      };

      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up, { once: true });
    },
    [liveSurfacesForDividers, onUpdateElement]
  );

  // Auto-initialize with a starter layout (dev-split: browser + terminal side-by-side)
  // the very first time the pizarra canvas becomes visible and is empty.
  // This prevents the "empty dark submarine" UX where user accesses pizarra
  // and sees absolutely nothing (solid #1a1f2e bg, no surfaces, palette hard to spot).
  // Once initialized (or user clears/adds manually), we don't auto again in this mount.
  React.useEffect(() => {
    if (didAutoInitRef.current) return;
    if (canvasSize.width < 200 || canvasSize.height < 200) return; // wait for real size

    const liveSurfaces = (mergedElements || []).filter(
      (el) => el.type === SHAPE_TYPES.TERMINAL || el.type === SHAPE_TYPES.BROWSER
    );
    if (liveSurfaces.length === 0) {
      didAutoInitRef.current = true;
      // Spawn a nice default that demonstrates the feature: one browser + one terminal,
      // sized and positioned responsively to current view (from the improved presets).
      handleApplyLayout('dev-split');
    }
  }, [canvasSize, mergedElements, handleApplyLayout]);

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
          elements={mergedElements}
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
          elements={mergedElements}
          selectedElementIds={state.selectedElementIds}
          activeTerminalId={activeTerminalId}
          onSelect={onSelect}
          onMoveElement={handleMoveElement}
          onActivateTerminal={onActivateTerminal}
          onUpdateElement={onUpdateElement}
          onRemoveElement={onRemoveElement}
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
          // Draggable zonas / dividers
          layoutDividers={layoutDividers}
          onDividerMouseDown={handleDividerMouseDown}
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
        {mergedElements.length} element{mergedElements.length !== 1 ? 's' : ''}
      </div>

      {/* Minimap — bottom-right HUD, hidden until pan/zoom */}
      <PizarraMinimap elements={mergedElements} onSelectElement={selectElement} />

      {/* CommandBar — natural language command palette (Cmd+Shift+K) */}
      <CommandBar surfaceController={surfaceController} />
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * detectReducedMotionPref — SSR-safe read of the OS reduced-motion
 * preference. Mirrors the detection used in useModeTransition so
 * the wiring point can pass the same value down to the shell.
 * Returns false in non-DOM environments.
 */
function detectReducedMotionPref() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
