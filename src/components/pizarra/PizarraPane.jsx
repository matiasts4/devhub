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

import React, { useRef, useState, useCallback, useMemo, useEffect, useLayoutEffect } from 'react';
import dynamic from 'next/dynamic';
import PizarraToolPalette from './PizarraToolPalette';
import PizarraLiveSurfaceLayer from './PizarraLiveSurfaceLayer';
import PizarraMinimap from './PizarraMinimap';
import PizarraZoneGuides from './PizarraZoneGuides';
import PizarraEdgeSwipeZones from './PizarraEdgeSwipeZones';
import PizarraZoomControls from './PizarraZoomControls';
import usePizarraCanvasPan from './hooks/usePizarraCanvasPan';
import CommandBar from '@/components/commandBar/CommandBar';
import { PIZARRA_ACTIONS, usePizarraState } from '@/lib/pizarra/pizarraReducer';
import { CanvasViewportProvider, useCanvasViewport } from '@/lib/pizarra/canvasViewport';
import { SHAPE_TYPES } from '@/lib/pizarra/shapeModel';
import { createShape } from '@/lib/pizarra/shapeModel';
import { createPizarraSurfaceController } from '@/lib/commandBar/surface/pizarraSurfaceController';
import {
  LiveSurfaceRegistryContext,
  useSharedSurfaceRegistry,
} from '@/lib/pizarra/useLiveSurfaceRegistry';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';
import { runCircleMigration } from '@/lib/pizarra/circleMigration';
import { closeNativeBrowser } from '@/lib/browser/nativeBrowserBridge';
import {
  computeElementsBounds,
  computeViewportFitToBounds,
  resolveFitBoundsForView,
  resolveZoneSnap,
} from '@/lib/pizarra/canvasBounds';
import {
  computeAdaptiveSnapZones,
  computeAdaptiveViewLayout,
  computeAdaptiveVisibleLayout,
  computeViewZones,
  computeViewDevSplitSlots,
  getCameraPanForView,
  getViewIndex,
  getViewWorldOrigin,
  surfaceBelongsToView,
  getSurfaceViewId,
  VIEW_WORLD_WIDTH,
  VIEW_WORLD_HEIGHT,
  isSwipeNavigationEnabled,
  shouldHorizontalWheelSwitchView,
  accumulateHorizontalWheelNav,
  normalizeWheelDelta,
  HORIZONTAL_WHEEL_ACCUM_RESET_MS,
} from '@/lib/pizarra/pizarraViewLayout';
import {
  animatePanTransition,
  easeInOutQuint,
  prefersReducedMotion,
  resolvePanTransitionDuration,
  VIEW_SWITCH_BASE_DURATION,
} from '@/lib/pizarra/pizarraViewTransition';
import { computeQuantizedEdgePan, edgeDragToProgress } from '@/lib/pizarra/pizarraEdgeViewSwipe';
import { dispatchTerminalLayoutSettled } from '@/components/terminal/nativeLayoutSync';
import {
  computeDevSplitSlots,
  computeDevTrioSlots,
  computeDualBrowserSlots,
  computeAutoFitSlotMap,
  isSurfacePositioned,
  isLiveElementPositioned,
  resolveSurfaceRenderBounds,
} from '@/lib/pizarra/pizarraInitialLayout';
import {
  readPizarraViewport,
  writePizarraViewport,
} from '@/lib/pizarra/pizarraViewportPersistence';

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

const PIZARRA_LAYOUT_KEYS = ['x', 'y', 'width', 'height', 'visible'];

function splitPizarraLayoutPatch(layoutChanges) {
  const rootChanges = {};
  const pizarraChanges = {};
  Object.keys(layoutChanges || {}).forEach((key) => {
    if (PIZARRA_LAYOUT_KEYS.includes(key)) {
      pizarraChanges[key] = layoutChanges[key];
    } else {
      rootChanges[key] = layoutChanges[key];
    }
  });
  return { rootChanges, pizarraChanges };
}

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
  const sharedRegistry = useSharedSurfaceRegistry();
  const sharedViewEnabled = isPizarraSharedViewEnabled();
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
      // Mirror of useLiveSurfaceRegistry.updateSurface: partial
      // merge of root-level fields (e.g. `requestedRendererMode`).
      // Used by the per-shape renderer switcher in the pizarra
      // CanvasTerminal header.
      updateSurface: (id, patch) => {
        if (!patch || typeof patch !== 'object') return;
        setLocalSurfaces((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      },
      resetSurfaces: (nextSurfaces) => {
        setLocalSurfaces(nextSurfaces || []);
      },
    }),
    [localSurfaces]
  );

  const registry = useMemo(() => {
    const base = contextValue || fallbackRegistry;
    if (!sharedViewEnabled || !contextValue) return base;

    const updatePizarraLayout = (id, layoutChanges) => {
      const surface = base.surfaces.find((s) => s.id === id);
      if (surface?.source === 'pizarra' && typeof sharedRegistry.update === 'function') {
        const existing = sharedRegistry.get(id) || surface;
        const { rootChanges, pizarraChanges } = splitPizarraLayoutPatch(layoutChanges);
        sharedRegistry.update(
          id,
          { ...rootChanges, pizarra: { ...existing.pizarra, ...pizarraChanges } },
          { writer: 'pizarra' }
        );
        return;
      }
      // Workspace-owned surfaces: context path uses workspace writer (B.2b).
      base.updatePizarraLayout(id, layoutChanges);
    };

    return { ...base, updatePizarraLayout };
  }, [contextValue, fallbackRegistry, sharedViewEnabled, sharedRegistry]);
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

  // P-MP-9: one-shot circle shape migration before persisted shapes hydrate.
  useEffect(() => {
    runCircleMigration();
  }, []);

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

    // pizarra-workspace-switch: surfaces without saved x/y used to fall back to
    // (100,100) here, so every card stacked in the corner for ~200ms until
    // useEffect auto-fit ran. Resolve initial slots synchronously instead.
    const vis = {
      x: 0,
      y: 0,
      width: canvasSize.width || 900,
      height: canvasSize.height || 600,
    };
    const registryShapes = resolveSurfaceRenderBounds(registry.surfaces || [], vis);

    return [...localDrawings, ...registryShapes];
  }, [state.elements, registry.surfaces, canvasSize.width, canvasSize.height]);

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
  // (laidOut ref moved to just before the unpos effect for declaration order)

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
        const surface = registry.surfaces.find((s) => s.id === id);
        if (surface && surface.type === 'browser') {
          const pid = surface.panelId || id;
          // Explicitly close the native webview for this browser surface when the
          // pizarra "ventana"/card is removed. This releases the instance.
          closeNativeBrowser({ panelId: pid, reason: 'pizarra-browser-surface-removed' }).catch(
            () => {}
          );
          // If main ws browser, also close in ws state (so normal view doesn't re-open it by default).
          if (pid && (pid.includes(`browser-${workspaceId}`) || pid.startsWith('browser-'))) {
            onBrowserWindowStateChange?.(workspaceId, {
              open: false,
              label: '',
              url: '',
              updatedAt: Date.now(),
            });
          }
        }
        registry.removeSurface(id);
      } else {
        dispatch({ type: PIZARRA_ACTIONS.DELETE_ELEMENT, payload: id });
      }
    },
    [dispatch, registry.surfaces, registry.removeSurface, onBrowserWindowStateChange, workspaceId]
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

  // The pizarra chrome tree. The mode transition is owned one level up
  // by WorkspaceRightDock so the animation can cover the normal→pizarra
  // handoff before this pane has fully settled.
  const savedViewport = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return readPizarraViewport(window.localStorage, projectId, workspaceId);
  }, [projectId, workspaceId]);

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
      <CanvasViewportProvider
        key={workspaceId}
        canvasContainerRef={canvasContainerRef}
        initialZoom={savedViewport?.zoom ?? 1}
        initialPan={savedViewport?.pan}
      >
        {/* PizarraInner is a child of the provider so it can useCanvasViewport() */}
        <PizarraInner
          key={workspaceId}
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

  return paneBody;
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
  const { zoom, pan, setZoom, setPan, viewportToCanvas, setWheelViewNavigateHandler } =
    useCanvasViewport();

  const views = workspaceWindows || [];
  const fallbackViewId = activeWorkspaceWindowId || views[0]?.id || null;
  const viewIndex = getViewIndex(activeWorkspaceWindowId || views[0]?.id, views);
  const viewOrigin = useMemo(() => getViewWorldOrigin(viewIndex), [viewIndex]);

  const [highlightZone, setHighlightZone] = useState(null);
  const [isSurfaceDragging, setIsSurfaceDragging] = useState(false);
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const surfaceDragCountRef = useRef(0);

  const [viewTransitionPair, setViewTransitionPair] = useState(null);
  const [pendingViewId, setPendingViewId] = useState(null);
  const panAnimCancelRef = useRef(null);
  const edgeSwipeRef = useRef(null);
  const wheelNavAccumRef = useRef({ x: 0, t: 0 });
  const wheelIdleTimerRef = useRef(null);
  const panRef = useRef(pan);
  const skipViewAutoFitRef = useRef(false);
  const viewSwitchGenRef = useRef(0);

  // pizarra-view-lock: default locked so the user freely arranges cards.
  // Persist the choice across sessions.
  const [isViewLocked, setIsViewLocked] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = window.localStorage?.getItem('devhub_pizarra_view_locked');
      return stored !== '0'; // default true when missing
    } catch {
      return true;
    }
  });
  const toggleViewLocked = useCallback(() => {
    setIsViewLocked((prev) => {
      const next = !prev;
      if (!next) {
        // Unlocking preserves the current viewport; auto-fit must not run on toggle.
        skipViewAutoFitRef.current = true;
      }
      try {
        window.localStorage?.setItem('devhub_pizarra_view_locked', next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const HUD_HIDE_DELAY_MS = 900;
  const HUD_EDGE_WIDTH = 28;
  const HUD_DOCK_WIDTH = 280;
  const HUD_CORNER_WIDTH = 150;
  const HUD_CORNER_HEIGHT = 120;

  const [hudRevealed, setHudRevealed] = useState(false);
  const hudHideTimerRef = useRef(null);

  const revealHud = useCallback(() => {
    if (hudHideTimerRef.current) {
      clearTimeout(hudHideTimerRef.current);
      hudHideTimerRef.current = null;
    }
    setHudRevealed(true);
  }, []);

  const scheduleHideHud = useCallback(() => {
    if (hudHideTimerRef.current) clearTimeout(hudHideTimerRef.current);
    hudHideTimerRef.current = setTimeout(() => {
      hudHideTimerRef.current = null;
      setHudRevealed(false);
    }, HUD_HIDE_DELAY_MS);
  }, []);

  useEffect(
    () => () => {
      if (hudHideTimerRef.current) clearTimeout(hudHideTimerRef.current);
    },
    []
  );

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const isViewLockedRef = useRef(isViewLocked);
  useEffect(() => {
    isViewLockedRef.current = isViewLocked;
  }, [isViewLocked]);

  const viewportPersistTimerRef = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (viewportPersistTimerRef.current) clearTimeout(viewportPersistTimerRef.current);
    viewportPersistTimerRef.current = setTimeout(() => {
      viewportPersistTimerRef.current = null;
      writePizarraViewport(window.localStorage, projectId, workspaceId, { pan, zoom });
    }, 400);
    return () => {
      if (viewportPersistTimerRef.current) clearTimeout(viewportPersistTimerRef.current);
    };
  }, [pan, zoom, projectId, workspaceId]);

  const cancelPanAnimation = useCallback(() => {
    if (typeof panAnimCancelRef.current === 'function') {
      panAnimCancelRef.current();
      panAnimCancelRef.current = null;
    }
  }, []);

  usePizarraCanvasPan({
    containerRef: canvasContainerRef,
    panRef,
    setPan,
    cancelPanAnimation,
    enabled: state.activeTool === 'select' && !isSurfaceDragging,
    onPanStart: () => setIsCanvasPanning(true),
    onPanEnd: () => setIsCanvasPanning(false),
  });

  const animateToPan = useCallback(
    (
      toPan,
      {
        fromPan = panRef.current,
        duration,
        easing = easeInOutQuint,
        onComplete,
        lockVertical = false,
      } = {}
    ) => {
      cancelPanAnimation();
      const resolvedToPan = lockVertical ? { x: toPan.x, y: fromPan?.y ?? toPan.y ?? 0 } : toPan;
      if (prefersReducedMotion()) {
        setPan(resolvedToPan);
        onComplete?.();
        return;
      }
      const resolvedDuration =
        duration ??
        resolvePanTransitionDuration({
          fromPan,
          toPan: resolvedToPan,
          baseDuration: VIEW_SWITCH_BASE_DURATION,
        });
      panAnimCancelRef.current = animatePanTransition({
        fromPan,
        toPan: resolvedToPan,
        duration: resolvedDuration,
        easing,
        onFrame: setPan,
        onComplete: () => {
          panAnimCancelRef.current = null;
          onComplete?.();
        },
      });
    },
    [setPan, cancelPanAnimation]
  );

  const visibleViewIds = useMemo(() => {
    if (viewTransitionPair) {
      return [viewTransitionPair.from, viewTransitionPair.to].filter(Boolean);
    }
    return [pendingViewId || activeWorkspaceWindowId || fallbackViewId].filter(Boolean);
  }, [viewTransitionPair, pendingViewId, activeWorkspaceWindowId, fallbackViewId]);

  const isViewTransitioning = Boolean(viewTransitionPair);

  const liveSurfacesForZones = useMemo(() => {
    return (mergedElements || []).filter((el) => {
      if (el.type !== SHAPE_TYPES.TERMINAL && el.type !== SHAPE_TYPES.BROWSER) return false;
      if (el.pizarra?.visible === false) return false;
      if (el._layoutResolved === false) return false;
      return visibleViewIds.some((viewId) => surfaceBelongsToView(el, viewId, views, null));
    });
  }, [mergedElements, views, fallbackViewId, visibleViewIds]);

  const activeSnapZones = useMemo(() => {
    if (liveSurfacesForZones.length === 0) return null;
    return computeAdaptiveSnapZones(viewOrigin, liveSurfacesForZones);
  }, [viewOrigin, liveSurfacesForZones]);

  const centerActiveView = useCallback(
    (nextZoom = 1) => {
      const targetPan = getCameraPanForView(
        viewOrigin,
        canvasSize.width,
        canvasSize.height,
        nextZoom
      );
      setZoom(nextZoom);
      setPan(targetPan);
    },
    [viewOrigin, canvasSize.width, canvasSize.height, setZoom, setPan]
  );

  // Returns the canvas-space bounding box of what is currently visible on screen.
  const getVisibleCanvasRegion = useCallback(() => {
    const w = canvasSize.width;
    const h = canvasSize.height;
    const z = zoom > 0 ? zoom : 1;
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

  /** Viewport-sized world rect at zoom 1, anchored to the current screen center. */
  const getViewportLayoutRegionAtUnitZoom = useCallback(() => {
    const z = zoom > 0 ? zoom : 1;
    const worldCenterX = (canvasSize.width / 2 - pan.x) / z;
    const worldCenterY = (canvasSize.height / 2 - pan.y) / z;
    return {
      x: worldCenterX - canvasSize.width / 2,
      y: worldCenterY - canvasSize.height / 2,
      width: canvasSize.width,
      height: canvasSize.height,
    };
  }, [canvasSize.width, canvasSize.height, zoom, pan.x, pan.y]);

  const finishViewSwitch = useCallback(
    (viewId) => {
      setViewTransitionPair(null);
      setPendingViewId(null);
      onWorkspaceWindowSelect?.(viewId);
      skipViewAutoFitRef.current = true;
      // Window/view parity: dock terminals stay mounted; visibility follows
      // activeWindowIds — no layout-settled burst (same as workspace tab switch).
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('devhub:pizarra-view-switch-complete', {
            detail: { workspaceId, viewId },
          })
        );
      }
    },
    [onWorkspaceWindowSelect, mergedElements, views, fallbackViewId, workspaceId]
  );

  const handleSelectView = useCallback(
    (viewId, options = {}) => {
      if (!viewId) return;
      const effectiveViewId = pendingViewId || activeWorkspaceWindowId || fallbackViewId;
      if (viewId === effectiveViewId && !isViewTransitioning) return;

      const fromViewId = activeWorkspaceWindowId || fallbackViewId;
      const idx = getViewIndex(viewId, views);
      const origin = getViewWorldOrigin(idx);
      const toPan = getCameraPanForView(origin, canvasSize.width, canvasSize.height, zoom);
      const fromPan = options.fromPan ?? panRef.current;

      if (fromViewId && fromViewId !== viewId) {
        setViewTransitionPair({ from: fromViewId, to: viewId });
      }
      setPendingViewId(viewId);

      // When the view is locked we skip the post-switch auto-fit so the user's
      // manual layout is preserved. When unlocked, the switch effect may refit.
      skipViewAutoFitRef.current = isViewLocked || options.skipAutoFit === true;

      const switchGen = viewSwitchGenRef.current + 1;
      viewSwitchGenRef.current = switchGen;

      animateToPan(toPan, {
        fromPan,
        lockVertical: true,
        onComplete: () => {
          if (viewSwitchGenRef.current !== switchGen) return;
          finishViewSwitch(viewId);
        },
      });
    },
    [
      views,
      canvasSize.width,
      canvasSize.height,
      zoom,
      animateToPan,
      activeWorkspaceWindowId,
      fallbackViewId,
      viewTransitionPair,
      pendingViewId,
      isViewTransitioning,
      finishViewSwitch,
      isViewLocked,
    ]
  );

  useEffect(() => {
    const handler = (event) => {
      const windowId = event?.detail?.windowId;
      if (!windowId || event?.detail?.workspaceId !== workspaceId) return;
      handleSelectView(windowId);
    };
    window.addEventListener('devhub:pizarra-select-view', handler);
    return () => window.removeEventListener('devhub:pizarra-select-view', handler);
  }, [handleSelectView, workspaceId]);

  const canGoPrevView = viewIndex > 0;
  const canGoNextView = viewIndex < views.length - 1;

  const handleEdgeSwipeDragStart = useCallback(
    (side) => {
      cancelPanAnimation();
      const restPan = getCameraPanForView(viewOrigin, canvasSize.width, canvasSize.height, zoom);
      const targetIdx =
        side === 'right' ? Math.min(views.length - 1, viewIndex + 1) : Math.max(0, viewIndex - 1);
      const targetOrigin = getViewWorldOrigin(targetIdx);
      const targetPan = getCameraPanForView(
        targetOrigin,
        canvasSize.width,
        canvasSize.height,
        zoom
      );
      const hasTarget = (side === 'right' && canGoNextView) || (side === 'left' && canGoPrevView);

      edgeSwipeRef.current = {
        side,
        fromPan: restPan,
        toPan: hasTarget ? targetPan : restPan,
        hasTarget,
      };
    },
    [
      cancelPanAnimation,
      viewOrigin,
      canvasSize.width,
      canvasSize.height,
      zoom,
      views.length,
      viewIndex,
      canGoNextView,
      canGoPrevView,
    ]
  );

  const handleEdgeSwipeDragMove = useCallback(
    (side, deltaX) => {
      const drag = edgeSwipeRef.current;
      if (!drag || drag.side !== side) return;
      const viewportW = typeof window !== 'undefined' ? window.innerWidth : canvasSize.width;
      const progress = edgeDragToProgress(deltaX, viewportW, side);
      const atBoundary = !drag.hasTarget;
      setPan(
        computeQuantizedEdgePan(drag.fromPan, drag.toPan, progress, {
          rubberBand: atBoundary,
        })
      );
    },
    [canvasSize.width, setPan]
  );

  const handleEdgeSwipeDragEnd = useCallback(
    (outcome) => {
      const drag = edgeSwipeRef.current;
      edgeSwipeRef.current = null;
      if (!drag) return;

      const restPan = getCameraPanForView(viewOrigin, canvasSize.width, canvasSize.height, zoom);

      if (outcome === 'cancel') {
        animateToPan(restPan, { fromPan: pan });
        return;
      }

      const nextIdx =
        outcome === 'next' ? Math.min(views.length - 1, viewIndex + 1) : Math.max(0, viewIndex - 1);
      const nextView = views[nextIdx];
      if (!nextView?.id || nextView.id === (activeWorkspaceWindowId || fallbackViewId)) {
        animateToPan(restPan, { fromPan: pan });
        return;
      }

      handleSelectView(nextView.id, { fromPan: pan });
    },
    [
      viewOrigin,
      canvasSize.width,
      canvasSize.height,
      zoom,
      pan,
      animateToPan,
      views,
      viewIndex,
      activeWorkspaceWindowId,
      fallbackViewId,
      handleSelectView,
    ]
  );

  const clearWheelIdleTimer = useCallback(() => {
    if (wheelIdleTimerRef.current) {
      clearTimeout(wheelIdleTimerRef.current);
      wheelIdleTimerRef.current = null;
    }
  }, []);

  const scheduleWheelSnapBack = useCallback(() => {
    clearWheelIdleTimer();
    wheelIdleTimerRef.current = setTimeout(() => {
      wheelIdleTimerRef.current = null;
      wheelNavAccumRef.current = { x: 0, t: 0 };
      const restPan = getCameraPanForView(viewOrigin, canvasSize.width, canvasSize.height, zoom);
      animateToPan(restPan, { fromPan: panRef.current, duration: 260 });
    }, HORIZONTAL_WHEEL_ACCUM_RESET_MS);
  }, [clearWheelIdleTimer, viewOrigin, canvasSize.width, canvasSize.height, zoom, animateToPan]);

  const handleWheelViewNavigate = useCallback(
    (deltaX, deltaY) => {
      if (!isSwipeNavigationEnabled() || views.length < 2 || isSurfaceDragging) return false;
      if (!shouldHorizontalWheelSwitchView(deltaX, deltaY)) return false;

      clearWheelIdleTimer();
      cancelPanAnimation();

      const restPan = getCameraPanForView(viewOrigin, canvasSize.width, canvasSize.height, zoom);
      const goingNext = deltaX < 0;
      const goingPrev = deltaX > 0;
      const side = goingNext ? 'right' : 'left';
      const canSwitch = (goingNext && canGoNextView) || (goingPrev && canGoPrevView);

      let targetPan = restPan;
      if (canSwitch) {
        const targetIdx = goingNext ? viewIndex + 1 : viewIndex - 1;
        const targetOrigin = getViewWorldOrigin(targetIdx);
        targetPan = getCameraPanForView(targetOrigin, canvasSize.width, canvasSize.height, zoom);
      }

      const direction = accumulateHorizontalWheelNav(wheelNavAccumRef.current, deltaX);
      const progress = edgeDragToProgress(wheelNavAccumRef.current.x, canvasSize.width, side);
      setPan(
        computeQuantizedEdgePan(restPan, targetPan, progress, {
          rubberBand: !canSwitch,
        })
      );

      if (direction === 'next' && canGoNextView) {
        wheelNavAccumRef.current = { x: 0, t: 0 };
        clearWheelIdleTimer();
        const nextView = views[viewIndex + 1];
        if (nextView?.id) handleSelectView(nextView.id, { fromPan: panRef.current });
        return true;
      }
      if (direction === 'prev' && canGoPrevView) {
        wheelNavAccumRef.current = { x: 0, t: 0 };
        clearWheelIdleTimer();
        const prevView = views[viewIndex - 1];
        if (prevView?.id) handleSelectView(prevView.id, { fromPan: panRef.current });
        return true;
      }

      scheduleWheelSnapBack();
      return true;
    },
    [
      views,
      viewIndex,
      viewOrigin,
      canvasSize.width,
      canvasSize.height,
      zoom,
      canGoPrevView,
      canGoNextView,
      isSurfaceDragging,
      handleSelectView,
      setPan,
      cancelPanAnimation,
      clearWheelIdleTimer,
      scheduleWheelSnapBack,
    ]
  );

  useEffect(() => {
    setWheelViewNavigateHandler?.(handleWheelViewNavigate);
    return () => setWheelViewNavigateHandler?.(null);
  }, [handleWheelViewNavigate, setWheelViewNavigateHandler]);

  useEffect(() => () => clearWheelIdleTimer(), [clearWheelIdleTimer]);

  const applyAdaptiveVisibleLayout = useCallback(
    (surfaces = liveSurfacesForZones, region = null) => {
      if (!surfaces.length) return { layouts: [], hiddenBrowserIds: [] };
      const vis = region || getVisibleCanvasRegion();
      const { layouts, hiddenBrowserIds } = computeAdaptiveVisibleLayout(vis, surfaces);
      layouts.forEach(({ id, x, y, width, height }) => {
        onUpdateElement?.(id, { x, y, width, height, visible: true });
      });
      hiddenBrowserIds.forEach((id) => {
        registry.updatePizarraLayout?.(id, { visible: false });
      });
      return { layouts, hiddenBrowserIds, visibleRegion: vis };
    },
    [liveSurfacesForZones, getVisibleCanvasRegion, onUpdateElement, registry]
  );

  const applyAdaptiveViewLayout = useCallback(
    (surfaces = liveSurfacesForZones) => {
      if (!surfaces.length) return { layouts: [], hiddenBrowserIds: [] };
      const { layouts, hiddenBrowserIds } = computeAdaptiveViewLayout(viewOrigin, surfaces);
      layouts.forEach(({ id, x, y, width, height }) => {
        onUpdateElement?.(id, { x, y, width, height, visible: true });
      });
      hiddenBrowserIds.forEach((id) => {
        registry.updatePizarraLayout?.(id, { visible: false });
      });
      return { layouts, hiddenBrowserIds };
    },
    [viewOrigin, liveSurfacesForZones, onUpdateElement, registry]
  );

  const fitCameraToActiveView = useCallback(
    (options = {}) => {
      const fitPadding = options.padding ?? 16;
      const fitMaxZoom = options.maxZoom ?? 2;

      if (liveSurfacesForZones.length === 0) {
        centerActiveView(options.zoom ?? 1);
        return;
      }

      const surfaceBounds = computeElementsBounds(liveSurfacesForZones);
      const viewBounds = computeViewZones(viewOrigin).bounds;
      const fitBounds = resolveFitBoundsForView(
        surfaceBounds?.width > 0 && surfaceBounds?.height > 0 ? surfaceBounds : null,
        activeSnapZones?.bounds || viewBounds
      );
      const { zoom: fitZoom, pan: fitPan } = computeViewportFitToBounds(
        fitBounds,
        canvasSize.width,
        canvasSize.height,
        { padding: fitPadding, maxZoom: fitMaxZoom, minZoom: 0.75 }
      );
      setZoom(fitZoom);
      setPan(fitPan);
    },
    [
      liveSurfacesForZones,
      centerActiveView,
      activeSnapZones,
      viewOrigin,
      canvasSize.width,
      canvasSize.height,
      setZoom,
      setPan,
    ]
  );

  const handleFitAllView = useCallback(() => {
    if (liveSurfacesForZones.length === 0) {
      centerActiveView(1);
      return;
    }
    const layoutRegion = getViewportLayoutRegionAtUnitZoom();
    const { layouts } = applyAdaptiveVisibleLayout(liveSurfacesForZones, layoutRegion);
    const layoutBounds = computeElementsBounds(layouts);
    if (!layoutBounds?.width || !layoutBounds?.height) {
      setZoom(1);
      return;
    }
    const cx = layoutBounds.x + layoutBounds.width / 2;
    const cy = layoutBounds.y + layoutBounds.height / 2;
    setZoom(1);
    setPan({
      x: canvasSize.width / 2 - cx,
      y: canvasSize.height / 2 - cy,
    });
  }, [
    liveSurfacesForZones,
    centerActiveView,
    getViewportLayoutRegionAtUnitZoom,
    applyAdaptiveVisibleLayout,
    canvasSize.width,
    canvasSize.height,
    setZoom,
    setPan,
  ]);

  const autoFitTimerRef = useRef(null);
  const scheduleAutoFitView = useCallback(
    (delayMs = 120) => {
      if (autoFitTimerRef.current) {
        clearTimeout(autoFitTimerRef.current);
      }
      autoFitTimerRef.current = setTimeout(() => {
        autoFitTimerRef.current = null;
        handleFitAllView();
      }, delayMs);
    },
    [handleFitAllView]
  );

  const scheduleCameraFitView = useCallback(
    (delayMs = 120) => {
      if (autoFitTimerRef.current) {
        clearTimeout(autoFitTimerRef.current);
      }
      autoFitTimerRef.current = setTimeout(() => {
        autoFitTimerRef.current = null;
        fitCameraToActiveView();
      }, delayMs);
    },
    [fitCameraToActiveView]
  );

  useEffect(
    () => () => {
      if (autoFitTimerRef.current) {
        clearTimeout(autoFitTimerRef.current);
        autoFitTimerRef.current = null;
      }
      cancelPanAnimation();
    },
    [cancelPanAnimation]
  );

  const collectTerminalPanelIds = useCallback((surfaces = []) => {
    return surfaces
      .filter((el) => el.type === SHAPE_TYPES.TERMINAL || el.type === 'terminal')
      .map((el) => el.panelId || String(el.id || '').replace(/^shape-term-/, ''))
      .filter(Boolean);
  }, []);

  // pizarra-workspace-switch: remounting this inner tree (key=workspaceId) with
  // already-positioned surfaces used to run camera-only fit, leaving cards at
  // stale/provisional sizes and terminals stuck on "Conectando…". After the mode
  // transition settles, run a full adaptive refit + viewport sync once — unless
  // the view is locked, in which case we only notify native layout.
  useEffect(() => {
    if (canvasSize.width < 200 || canvasSize.height < 200) return undefined;

    const settleMs = prefersReducedMotion() ? 24 : 60;
    const timer = setTimeout(() => {
      if (liveSurfacesForZones.length === 0 || isViewTransitioning) return;
      const allPositioned = liveSurfacesForZones.every(isLiveElementPositioned);
      if (!isViewLockedRef.current && !allPositioned) {
        handleFitAllView();
      }
      const panelIds = collectTerminalPanelIds(liveSurfacesForZones);
      if (panelIds.length > 0) {
        dispatchTerminalLayoutSettled({ reason: 'workspace-switch', panelIds });
      }
    }, settleMs);

    return () => clearTimeout(timer);
  }, [
    workspaceId,
    canvasSize.width,
    canvasSize.height,
    liveSurfacesForZones,
    handleFitAllView,
    collectTerminalPanelIds,
    isViewTransitioning,
  ]);

  const prevViewIdRef = useRef(null);
  const prevSurfaceCountRef = useRef(0);
  useEffect(() => {
    if (canvasSize.width < 200 || canvasSize.height < 200) return;
    if (prevViewIdRef.current === activeWorkspaceWindowId && prevViewIdRef.current != null) {
      return;
    }
    prevViewIdRef.current = activeWorkspaceWindowId;
    if (skipViewAutoFitRef.current) {
      skipViewAutoFitRef.current = false;
      return;
    }
    // View locked or mid-transition: never auto-refit on window switch.
    if (isViewLocked || isViewTransitioning) {
      if (liveSurfacesForZones.length === 0) {
        centerActiveView(1);
      }
      return;
    }
    if (liveSurfacesForZones.length > 0) {
      scheduleAutoFitView(260);
    } else {
      centerActiveView(1);
    }
  }, [
    activeWorkspaceWindowId,
    canvasSize.width,
    canvasSize.height,
    centerActiveView,
    liveSurfacesForZones.length,
    scheduleAutoFitView,
    isViewLocked,
    isViewTransitioning,
  ]);

  // Surfaces often arrive after mount (carried from normal view or workspace return).
  // Full layout+camera when unpositioned; camera-only when positions are already saved.
  useEffect(() => {
    const count = liveSurfacesForZones.length;
    if (count === 0 || canvasSize.width < 200) {
      prevSurfaceCountRef.current = count;
      return;
    }
    const hadNoSurfaces = prevSurfaceCountRef.current === 0;
    prevSurfaceCountRef.current = count;
    if (!hadNoSurfaces) return;

    // When locked or mid-transition we preserve the user's layout; the
    // unpositioned effect already placed carried surfaces once. Only auto-fit on
    // first appearance if unlocked, settled, and something still lacks coords.
    if (isViewLocked || isViewTransitioning) return;
    const allPositioned = liveSurfacesForZones.every(isLiveElementPositioned);
    if (allPositioned) return;

    scheduleAutoFitView(100);
  }, [
    liveSurfacesForZones,
    canvasSize.width,
    scheduleAutoFitView,
    isViewLocked,
    isViewTransitioning,
  ]);

  useEffect(() => {
    const handler = (event) => {
      if (!event.altKey || views.length < 2) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const idx = getViewIndex(activeWorkspaceWindowId || views[0]?.id, views);
      const nextIdx =
        event.key === 'ArrowLeft' ? Math.max(0, idx - 1) : Math.min(views.length - 1, idx + 1);
      const nextView = views[nextIdx];
      if (nextView?.id) handleSelectView(nextView.id);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [views, activeWorkspaceWindowId, handleSelectView]);

  // Track if we applied default structure (preset-based pos) to carried surfaces on first pizarra entry.
  const didAutoStructureRef = useRef(false);

  // pizarra-divider-fluid: last committed values captured during rAF-batched
  // divider drag so that on mouseup we can force a final model update even
  // if the last rAF was cancelled.
  const lastDividerVRef = useRef(null);
  const lastDividerHRef = useRef(null);

  const laidOutRegistryRef = useRef(new Set());

  useEffect(() => {
    if (!registry?.isLoaded) return;
    for (const s of registry.surfaces || []) {
      if (isSurfacePositioned(s.pizarra || {})) {
        laidOutRegistryRef.current.add(s.id);
      }
    }
  }, [registry?.isLoaded, registry?.surfaces]);

  // pizarra-renderer-switcher: per-shape terminal renderer update.
  // Routes the user's selection from the CanvasTerminal header's
  // <PanelRendererSelect> into the surface registry as a root-level
  // patch (NOT into `pizarra`, which is reserved for layout fields).
  // Triggers a re-render with the new requestedRendererMode, which
  // re-mounts TerminalTTY with the chosen renderer.
  const handleUpdateSurfaceRenderer = useCallback(
    (surfaceId, mode) => {
      if (!surfaceId || !mode) return;
      if (typeof registry?.updateSurface !== 'function') return;
      registry.updateSurface(surfaceId, { requestedRendererMode: mode });
    },
    [registry]
  );

  // ── Unpositioned registry surfaces layout (smart structure on first pizarra with carried) ──
  // When carried terminals/browsers from normal appear with x:null (first switch), assign
  // positions using matching default preset (dev-split etc) based on counts, so they start
  // in the "split sections" / trio / dual as user expects, instead of spread or default.
  // Fallback to basic spread for other cases. Done once via ref.
  // pizarra-workspace-switch: commit layout to registry BEFORE paint so native
  // overlays and persisted positions match the synchronous render bounds.
  useLayoutEffect(() => {
    if (!registry || typeof registry.updatePizarraLayout !== 'function') return;
    const surfaces = registry.surfaces || [];
    const needs = surfaces.filter((s) => {
      const p = s.pizarra || {};
      return !isSurfacePositioned(p) && !laidOutRegistryRef.current.has(s.id);
    });
    if (needs.length === 0) return;

    const groupsByView = new Map();
    needs.forEach((s) => {
      const viewId = getSurfaceViewId(s, views, fallbackViewId);
      if (!viewId) return;
      if (!groupsByView.has(viewId)) groupsByView.set(viewId, []);
      groupsByView.get(viewId).push(s);
    });
    if (groupsByView.size === 0) return;

    let assigned = false;
    for (const [viewId, group] of groupsByView) {
      const viewOrigin = getViewWorldOrigin(getViewIndex(viewId, views));
      const viewRegion = {
        x: viewOrigin.x,
        y: viewOrigin.y,
        width: VIEW_WORLD_WIDTH,
        height: VIEW_WORLD_HEIGHT,
      };
      const bNeeds = group.filter((s) => s.type === 'browser' || s.type === SHAPE_TYPES.BROWSER);
      const tNeeds = group.filter((s) => s.type === 'terminal' || s.type === SHAPE_TYPES.TERMINAL);

      if (!didAutoStructureRef.current && bNeeds.length === 1 && tNeeds.length === 1) {
        didAutoStructureRef.current = groupsByView.size === 1;
        const slots = computeViewDevSplitSlots(viewOrigin);
        registry.updatePizarraLayout(bNeeds[0].id, { ...slots.browser, visible: true });
        registry.updatePizarraLayout(tNeeds[0].id, { ...slots.terminals[0], visible: true });
        laidOutRegistryRef.current.add(bNeeds[0].id);
        laidOutRegistryRef.current.add(tNeeds[0].id);
        assigned = true;
        continue;
      }

      const slotMap = computeAutoFitSlotMap(viewRegion, group);
      group.forEach((s) => {
        if (laidOutRegistryRef.current.has(s.id)) return;
        const slot = slotMap.get(s.id);
        if (!slot) return;
        try {
          registry.updatePizarraLayout(s.id, { ...slot, visible: true });
        } catch {
          // best-effort
        }
        laidOutRegistryRef.current.add(s.id);
      });
      assigned = true;
    }

    if (needs.length > 0 && assigned && !isViewLockedRef.current) {
      // First-time placement: fit immediately (no 120–200ms dead zone).
      // When locked we already assigned slots above and leave the user in control.
      handleFitAllView();
    }
  }, [
    registry,
    registry.surfaces,
    registry.updatePizarraLayout,
    canvasSize,
    SHAPE_TYPES,
    views,
    fallbackViewId,
    handleFitAllView,
  ]);

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
            viewId: fallbackViewId || undefined,
          },
          url: cleanedExtraProps.url || (type === 'browser' ? 'http://localhost:3000/' : undefined),
          initialCommand: cleanedExtraProps.initialCommand,
          label: cleanedExtraProps.label || (isTerminal ? `Terminal` : `Browser`),
          // terminal-renderer-default-xterm-webgl: defensive pin — even if
          // a future regression in the resolver layer demotes xterm-webgl
          // for new spawn paths, the preset stays the source of truth for
          // the renderer of surfaces it creates.
          requestedRendererMode: 'xterm-webgl',
        };
        const existingLive = (mergedElements || []).filter(
          (el) => el.type === SHAPE_TYPES.TERMINAL || el.type === SHAPE_TYPES.BROWSER
        );
        const hadExistingCards = existingLive.length > 0;
        const addedSurface = registry.addSurface(surfaceData);
        if (addedSurface && addedSurface.id) {
          selectElement(addedSurface.id);
          // Auto-refit: if there were already cards on the canvas and the view is
          // not locked, re-fit all after a short delay so the new card appears
          // first, then everything snaps into a clean layout.
          if (hadExistingCards && !isViewLocked) {
            scheduleAutoFitView(350);
          }
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
      fallbackViewId,
      scheduleAutoFitView,
      isViewLocked,
    ]
  );

  // ── handleMoveElement — zone snap on drop (adaptive layout slots) ────────
  // pizarra-free-placement: the surface lands exactly where the user dropped
  // it. The previous 2×3 magnetic snap-zone grid yanked cards to fixed slots,
  // which felt like the card was being "thrown" away from the drop point and
  // left badly positioned. Free placement is predictable and intuitive: where
  // you release is where it stays. Coordinates are rounded to whole pixels so
  // the native VTE/WebKit surfaces don't land on sub-pixel offsets (which
  // causes blurry text on those real OS windows).
  const handleSurfaceDragStart = useCallback(() => {
    surfaceDragCountRef.current += 1;
    setIsSurfaceDragging(true);
  }, []);

  const handleSurfaceDragMove = useCallback(
    (id, position) => {
      const shape = mergedElements.find((el) => el.id === id);
      if (!shape || !activeSnapZones) {
        setHighlightZone(null);
        return;
      }

      const snapped = resolveZoneSnap(
        {
          x: position.x,
          y: position.y,
          width: shape.width || 640,
          height: shape.height || 400,
        },
        activeSnapZones
      );
      setHighlightZone(snapped?.zone ?? null);
    },
    [mergedElements, activeSnapZones]
  );

  const handleSurfaceDragEnd = useCallback(() => {
    surfaceDragCountRef.current = Math.max(0, surfaceDragCountRef.current - 1);
    if (surfaceDragCountRef.current === 0) {
      setIsSurfaceDragging(false);
      setHighlightZone(null);
    }
  }, []);

  const handleMoveElement = useCallback(
    (id, position) => {
      const shape = mergedElements.find((el) => el.id === id);
      const shapeWidth = shape?.width || 640;
      const shapeHeight = shape?.height || 400;

      let finalX = Math.round(position.x);
      let finalY = Math.round(position.y);
      let finalW = shapeWidth;
      let finalH = shapeHeight;

      const snapped = activeSnapZones
        ? resolveZoneSnap(
            { x: position.x, y: position.y, width: shapeWidth, height: shapeHeight },
            activeSnapZones
          )
        : null;

      if (snapped) {
        finalX = snapped.x;
        finalY = snapped.y;
        finalW = snapped.width;
        finalH = snapped.height;
        setHighlightZone(snapped.zone);
      } else {
        setHighlightZone(null);
      }

      const layoutPatch = {
        x: finalX,
        y: finalY,
        ...(snapped ? { width: finalW, height: finalH } : {}),
        userPlaced: true,
      };

      const isRegistrySurface = registry.surfaces.some((s) => s.id === id);
      if (isRegistrySurface) {
        registry.updatePizarraLayout(id, layoutPatch);
      } else if (shape) {
        updateElement(id, layoutPatch);
      } else {
        registry.updatePizarraLayout(id, layoutPatch);
      }

      requestAnimationFrame(() => setHighlightZone(null));
    },
    [
      updateElement,
      mergedElements,
      activeSnapZones,
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

  // ── Preset layout slot calculators (extracted for clarity and reuse).
  // These define the "estructuras por defecto" (dev-split, trio, dual-browser)
  // that match common workspace setups. Used both for destructive presets (palette)
  // and for smart auto-positioning of carried surfaces on first pizarra entry.
  const computeDevSplitSlots = (vis) => {
    const edgePad = 8;
    const gap = 12;
    const usableW = Math.max(640, vis.width - edgePad * 2);
    const usableH = Math.max(300, vis.height - edgePad * 2);
    const bw = Math.round(usableW * 0.58);
    const tw = usableW - bw - gap;
    const leftX = vis.x + edgePad;
    const rightX = leftX + bw + gap;
    const topY = vis.y + edgePad;
    return {
      browser: { x: leftX, y: topY, width: bw, height: usableH },
      terminals: [{ x: rightX, y: topY, width: tw, height: usableH }],
    };
  };

  const computeDevTrioSlots = (vis) => {
    const edgePad = 8;
    const gap = 12;
    const rowGap = 12;
    const usableW = Math.max(640, vis.width - edgePad * 2);
    const usableH = Math.max(300, vis.height - edgePad * 2);
    const bw = Math.round(usableW * 0.58);
    const tw = usableW - bw - gap;
    const th = Math.max(140, Math.round((usableH - rowGap) / 2));
    const leftX = vis.x + edgePad;
    const rightX = leftX + bw + gap;
    const topY = vis.y + edgePad;
    return {
      browser: { x: leftX, y: topY, width: bw, height: usableH },
      terminals: [
        { x: rightX, y: topY, width: tw, height: th },
        { x: rightX, y: topY + th + rowGap, width: tw, height: th },
      ],
    };
  };

  const computeDualBrowserSlots = (vis) => {
    const edgePad = 8;
    const gap = 12;
    const usableW = Math.max(640, vis.width - edgePad * 2);
    const usableH = Math.max(300, vis.height - edgePad * 2);
    const bw = Math.round((usableW - gap) / 2);
    const leftX = vis.x + edgePad;
    const rightX = leftX + bw + gap;
    const topY = vis.y + edgePad;
    return {
      browsers: [
        { x: leftX, y: topY, width: bw, height: usableH },
        { x: rightX, y: topY, width: bw, height: usableH },
      ],
    };
  };

  // ── computeAutoFitSlots — smart adaptive layout based on surface count/type ──
  // Picks the best layout strategy given the current set of live surfaces and
  // the visible canvas region. This is the heart of "Fit All" / auto-refit.
  // Returns an array of { id, x, y, width, height } updates to apply.
  const computeAutoFitSlots = (vis, surfaces) => {
    const cx = vis.x + vis.width / 2;
    const cy = vis.y + vis.height / 2;
    const PAD = 20;
    const GAP = 16;
    const maxH = Math.max(200, Math.round(vis.height * 0.88));

    const browsers = surfaces.filter((s) => s.type === 'browser' || s.type === SHAPE_TYPES.BROWSER);
    const terminals = surfaces.filter(
      (s) => s.type === 'terminal' || s.type === SHAPE_TYPES.TERMINAL
    );
    const n = surfaces.length;

    // 1 surface: center and fill
    if (n === 1) {
      const s = surfaces[0];
      const isBrowser = s.type === 'browser' || s.type === SHAPE_TYPES.BROWSER;
      const w = Math.max(400, Math.round(vis.width * 0.86));
      const h = Math.max(300, Math.min(Math.round(vis.height * 0.86), isBrowser ? 800 : 600));
      return [
        { id: s.id, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: w, height: h },
      ];
    }

    // 1 browser + 1 terminal → dev-split (~58/42 split)
    if (browsers.length === 1 && terminals.length === 1) {
      const slots = computeDevSplitSlots(vis);
      return [
        { id: browsers[0].id, ...slots.browser },
        { id: terminals[0].id, ...slots.terminals[0] },
      ];
    }

    // 1 browser + 2 terminals → trio
    if (browsers.length === 1 && terminals.length === 2) {
      const slots = computeDevTrioSlots(vis);
      return [
        { id: browsers[0].id, ...slots.browser },
        { id: terminals[0].id, ...slots.terminals[0] },
        { id: terminals[1].id, ...slots.terminals[1] },
      ];
    }

    // 2 browsers + 0 terminals → dual column
    if (browsers.length === 2 && terminals.length === 0) {
      const slots = computeDualBrowserSlots(vis);
      return [
        { id: browsers[0].id, ...slots.browsers[0] },
        { id: browsers[1].id, ...slots.browsers[1] },
      ];
    }

    // 0 browsers + N terminals → stack vertically or horizontal depending on count
    if (browsers.length === 0 && terminals.length > 0) {
      if (terminals.length <= 3) {
        // Side by side
        const tw = Math.max(
          200,
          Math.round((vis.width - PAD * 2 - GAP * (terminals.length - 1)) / terminals.length)
        );
        const th = Math.max(240, Math.min(maxH, Math.round(vis.height * 0.82)));
        const totalW = tw * terminals.length + GAP * (terminals.length - 1);
        const startX = Math.round(cx - totalW / 2);
        const startY = Math.round(cy - th / 2);
        return terminals.map((t, i) => ({
          id: t.id,
          x: startX + i * (tw + GAP),
          y: startY,
          width: tw,
          height: th,
        }));
      }
    }

    // Generic: 2-column responsive grid centered in viewport
    const cols = n <= 2 ? n : Math.min(2, Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    const usableW = vis.width - PAD * 2 - GAP * (cols - 1);
    const usableH = vis.height - PAD * 2 - GAP * (rows - 1);
    const cellW = Math.max(200, Math.round(usableW / cols));
    const cellH = Math.max(160, Math.round(usableH / rows));
    const totalGridW = cols * cellW + GAP * (cols - 1);
    const totalGridH = rows * cellH + GAP * (rows - 1);
    const startX = Math.round(vis.x + (vis.width - totalGridW) / 2);
    const startY = Math.round(vis.y + (vis.height - totalGridH) / 2);

    // Sort: browsers first, then terminals
    const sorted = [...browsers, ...terminals];
    return sorted.map((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        id: s.id,
        x: startX + col * (cellW + GAP),
        y: startY + row * (cellH + GAP),
        width: cellW,
        height: cellH,
      };
    });
  };

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
        const mode = presetType.slice('arrange-'.length); // fit | h | v | equal | grid
        const live = (mergedElements || []).filter(
          (el) => el.type === SHAPE_TYPES.TERMINAL || el.type === SHAPE_TYPES.BROWSER
        );
        if (live.length === 0) return;

        // Targets: prefer current multi-selection if it contains live items
        const selectedLive = live.filter((el) => state.selectedElementIds.includes(el.id));
        const targets = selectedLive.length >= 2 ? selectedLive : live;

        const n = targets.length;
        if (n === 0) return;

        const gap = 16;
        const updates = [];

        // ── arrange-fit: smart adaptive layout centered in current viewport ──
        if (mode === 'fit') {
          handleFitAllView();
          return;
        }

        // Compute a sensible container from current selection bbox
        const minX = Math.min(...targets.map((t) => t.x || 0));
        const minY = Math.min(...targets.map((t) => t.y || 0));
        const maxX = Math.max(...targets.map((t) => (t.x || 0) + (t.width || 400)));
        const maxY = Math.max(...targets.map((t) => (t.y || 0) + (t.height || 300)));
        const bboxW = Math.max(200, maxX - minX);
        const bboxH = Math.max(160, maxY - minY);

        if (mode === 'h' || mode === 'horizontal') {
          // Equal widths, abut left-to-right, then CENTER result in viewport
          const totalGap = gap * (n - 1);
          // Use viewport width to compute the distributed width (fills ~90% of vis)
          const availW = Math.max(bboxW, Math.round(vis.width * 0.9));
          const w = Math.max(160, Math.round((availW - totalGap) / n));
          const avgH = Math.max(
            160,
            Math.round(targets.reduce((s, t) => s + (t.height || 300), 0) / n)
          );
          const totalResultW = w * n + gap * (n - 1);
          // Center the whole row in the viewport
          let x = Math.round(vis.x + (vis.width - totalResultW) / 2);
          const rowY = Math.round(cy - avgH / 2);
          targets
            .slice()
            .sort((a, b) => (a.x || 0) - (b.x || 0))
            .forEach((t) => {
              const h = Math.max(120, t.height || avgH);
              updates.push({ id: t.id, x, y: rowY, width: w, height: h });
              x += w + gap;
            });
        } else if (mode === 'v' || mode === 'vertical') {
          // Equal heights, stack top-to-bottom, CENTER result in viewport
          const totalGap = gap * (n - 1);
          const availH = Math.max(bboxH, Math.round(vis.height * 0.88));
          const h = Math.max(120, Math.round((availH - totalGap) / n));
          const avgW = Math.max(
            200,
            Math.round(targets.reduce((s, t) => s + (t.width || 400), 0) / n)
          );
          const totalResultH = h * n + gap * (n - 1);
          const colX = Math.round(cx - avgW / 2);
          let y = Math.round(vis.y + (vis.height - totalResultH) / 2);
          targets
            .slice()
            .sort((a, b) => (a.y || 0) - (b.y || 0))
            .forEach((t) => {
              const w = Math.max(160, t.width || avgW);
              updates.push({ id: t.id, x: colX, y, width: w, height: h });
              y += h + gap;
            });
        } else if (mode === 'equal') {
          // Same size for all (average), keep positions
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
          // 2-col grid centered in viewport
          const cols = Math.min(2, n);
          const rows = Math.ceil(n / cols);
          const cellW = Math.max(200, Math.round((vis.width * 0.9 - gap * (cols - 1)) / cols));
          const cellH = Math.max(160, Math.round((vis.height * 0.88 - gap * (rows - 1)) / rows));
          const totalGridW = cols * cellW + gap * (cols - 1);
          const totalGridH = rows * cellH + gap * (rows - 1);
          const gridStartX = Math.round(vis.x + (vis.width - totalGridW) / 2);
          const gridStartY = Math.round(vis.y + (vis.height - totalGridH) / 2);
          targets
            .slice()
            .sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0))
            .forEach((t, i) => {
              const col = i % cols;
              const row = Math.floor(i / cols);
              updates.push({
                id: t.id,
                x: gridStartX + col * (cellW + gap),
                y: gridStartY + row * (cellH + gap),
                width: cellW,
                height: cellH,
              });
            });
        }

        // Apply (handleUpdateElement will grid-snap + route to registry/reducer)
        updates.forEach((u) => onUpdateElement?.(u.id, u));
        if (updates.length) onSelect?.(updates[0].id, true);
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
        const slots = computeDevSplitSlots(vis);
        registry.addSurface({
          type: 'browser',
          pizarra: { ...slots.browser, visible: true },
          url: 'http://localhost:3000/',
          label: 'Browser',
          requestedRendererMode: 'xterm-webgl',
        });
        const added = registry.addSurface({
          type: 'terminal',
          pizarra: { ...slots.terminals[0], visible: true },
          label: 'Terminal',
          requestedRendererMode: 'xterm-webgl',
        });
        if (added?.id) setActiveTerminalId(added.id);
        scheduleAutoFitView(80);
      } else if (presetType === 'dev-trio') {
        const slots = computeDevTrioSlots(vis);
        registry.addSurface({
          type: 'browser',
          pizarra: { ...slots.browser, visible: true },
          url: 'http://localhost:3000/',
          label: 'Browser',
          requestedRendererMode: 'xterm-webgl',
        });
        registry.addSurface({
          type: 'terminal',
          pizarra: { ...slots.terminals[0], visible: true },
          label: 'Terminal Top',
          requestedRendererMode: 'xterm-webgl',
        });
        const added = registry.addSurface({
          type: 'terminal',
          pizarra: { ...slots.terminals[1], visible: true },
          label: 'Terminal Bottom',
          requestedRendererMode: 'xterm-webgl',
        });
        if (added?.id) setActiveTerminalId(added.id);
        scheduleAutoFitView(80);
      } else if (presetType === 'dual-browser') {
        const slots = computeDualBrowserSlots(vis);
        registry.addSurface({
          type: 'browser',
          pizarra: { ...slots.browsers[0], visible: true },
          url: 'http://localhost:3000/',
          label: 'Browser 1',
          requestedRendererMode: 'xterm-webgl',
        });
        registry.addSurface({
          type: 'browser',
          pizarra: { ...slots.browsers[1], visible: true },
          url: 'http://localhost:3000/',
          label: 'Browser 2',
          requestedRendererMode: 'xterm-webgl',
        });
        scheduleAutoFitView(80);
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
      scheduleAutoFitView,
      handleFitAllView,
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
          scheduleUpdate(
            () => {
              onUpdateElement?.(divider.leftId, leftUpdate);
              onUpdateElement?.(divider.rightId, rightUpdate);
            },
            { left: leftUpdate, right: rightUpdate }
          );
        } else {
          const newTopH = Math.max(120, leftStart.height + dy);
          const delta = newTopH - leftStart.height;
          const topUpdate = { height: newTopH, y: leftStart.y };
          const bottomUpdate = {
            y: rightStart.y + delta,
            height: Math.max(120, rightStart.height - delta),
          };
          scheduleUpdate(
            () => {
              onUpdateElement?.(divider.topId, topUpdate);
              onUpdateElement?.(divider.bottomId, bottomUpdate);
            },
            { top: topUpdate, bottom: bottomUpdate }
          );
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

  // Auto-fit when surfaces already exist (carried from normal view or user-added).
  // Empty pizarra canvas stays empty until the user adds surfaces explicitly.
  //
  // pizarra-fluidity: this effect previously depended on `mergedElements` and
  // re-fired on EVERY element change — including a user dragging/resizing a
  // surface. 200ms after any move, handleFitAllView() ran applyAdaptiveViewLayout
  // (which snaps every surface back to the adaptive grid) + fitCameraToActiveView
  // (which recenters the camera), so the canvas felt "locked": you could not
  // freely move a window or pan because it reverted. We now only auto-fit when
  // the SET of live surfaces changes (a surface added/removed) or the canvas is
  // resized — never on a plain position/size change of existing surfaces. This
  // preserves the "auto-adapt on add" behavior the user likes while leaving the
  // camera and surface positions under the user's control afterwards.
  const prevAutoFitKeyRef = useRef('');
  const prevAutoFitCountRef = useRef(0);
  React.useEffect(() => {
    if (canvasSize.width < 200 || canvasSize.height < 200) return;

    const liveSurfaces = (mergedElements || []).filter(
      (el) => el.type === SHAPE_TYPES.TERMINAL || el.type === SHAPE_TYPES.BROWSER
    );
    const count = liveSurfaces.length;
    const idsKey = liveSurfaces
      .map((s) => s.id)
      .sort()
      .join('|');
    const fitKey = `${Math.round(canvasSize.width)}x${Math.round(canvasSize.height)}|${idsKey}`;
    if (fitKey === prevAutoFitKeyRef.current) return;

    if (isViewLocked) {
      prevAutoFitKeyRef.current = fitKey;
      prevAutoFitCountRef.current = count;
      return;
    }

    const prevCount = prevAutoFitCountRef.current;
    const countIncreased = count > prevCount && prevCount > 0;
    prevAutoFitKeyRef.current = fitKey;
    prevAutoFitCountRef.current = count;

    const hasUnpositioned = liveSurfaces.some((s) => !isLiveElementPositioned(s));
    if (count > 0 && (hasUnpositioned || countIncreased)) {
      scheduleAutoFitView(countIncreased ? 350 : 260);
    }
  }, [canvasSize, mergedElements, scheduleAutoFitView, isViewLocked]);

  // Listen for deferred auto-refit events dispatched by handleAddElement
  // when a new card is added while others already exist.
  React.useEffect(() => {
    const handler = () => handleFitAllView();
    window.addEventListener('pizarra:arrange-fit', handler);
    return () => window.removeEventListener('pizarra:arrange-fit', handler);
  }, [handleFitAllView]);

  return (
    <>
      {/* Property inspector removed — user-facing elements (terminal/browser) don't expose it */}

      {/* Konva canvas — dynamically imported, client-only */}
      <div
        ref={canvasContainerRef}
        data-testid="pizarra-canvas-container"
        data-view-transitioning={isViewTransitioning ? 'true' : 'false'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          cursor: isCanvasPanning ? 'grabbing' : undefined,
        }}
      >
        <PizarraZoneGuides
          canvasWidth={canvasSize.width}
          canvasHeight={canvasSize.height}
          visible={isSurfaceDragging && liveSurfacesForZones.length > 0}
          highlightZone={highlightZone}
          snapZones={activeSnapZones}
        />

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
          onWheelViewNavigate={handleWheelViewNavigate}
        />

        <PizarraLiveSurfaceLayer
          elements={mergedElements}
          selectedElementIds={state.selectedElementIds}
          activeTerminalId={activeTerminalId}
          onSelect={onSelect}
          onMoveElement={handleMoveElement}
          onSurfaceDragStart={handleSurfaceDragStart}
          onSurfaceDragMove={handleSurfaceDragMove}
          onSurfaceDragEnd={handleSurfaceDragEnd}
          onActivateTerminal={onActivateTerminal}
          onUpdateElement={onUpdateElement}
          onRemoveElement={onRemoveElement}
          onUpdateRendererMode={handleUpdateSurfaceRenderer}
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
          visibleViewIds={visibleViewIds}
          isViewTransitioning={isViewTransitioning}
          transitionFromViewId={viewTransitionPair?.from ?? null}
          suspendDuringCanvasPan={isCanvasPanning}
          // Draggable zonas / dividers
          layoutDividers={layoutDividers}
          onDividerMouseDown={handleDividerMouseDown}
        />
      </div>

      <div
        data-testid="pizarra-hud-layer"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 10000,
        }}
      >
        {hudRevealed ? (
          <div
            data-testid="pizarra-hud-dock-capture"
            onMouseEnter={revealHud}
            onMouseLeave={scheduleHideHud}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: HUD_DOCK_WIDTH,
              pointerEvents: 'auto',
              zIndex: 10001,
            }}
          />
        ) : (
          <>
            <div
              data-testid="pizarra-hud-edge-trigger"
              onMouseEnter={revealHud}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: HUD_EDGE_WIDTH,
                pointerEvents: 'auto',
                zIndex: 10005,
              }}
            />
            <div
              data-testid="pizarra-hud-corner-zone"
              onMouseEnter={revealHud}
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                width: HUD_CORNER_WIDTH,
                height: HUD_CORNER_HEIGHT,
                pointerEvents: 'auto',
                zIndex: 10005,
              }}
            />
          </>
        )}

        <PizarraToolPalette
          value={state.activeTool}
          onChange={setTool}
          onAddElement={handleAddElement}
          onApplyLayout={handleApplyLayout}
          isViewLocked={isViewLocked}
          onToggleViewLocked={toggleViewLocked}
          revealed={hudRevealed}
          onRevealRequest={revealHud}
        />

        <div
          onMouseEnter={revealHud}
          onMouseLeave={scheduleHideHud}
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: HUD_DOCK_WIDTH,
            height: 96,
            pointerEvents: hudRevealed ? 'auto' : 'none',
            zIndex: 10002,
          }}
        >
          <PizarraZoomControls
            visible={hudRevealed}
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
            onFitAll={handleFitAllView}
            onResetView={() => centerActiveView(1)}
          />
        </div>

        <PizarraEdgeSwipeZones
          enabled={views.length >= 2 && !isSurfaceDragging}
          canvasHeight={canvasSize.height}
          canGoPrev={canGoPrevView}
          canGoNext={canGoNextView}
          onDragStart={handleEdgeSwipeDragStart}
          onDragMove={handleEdgeSwipeDragMove}
          onDragEnd={handleEdgeSwipeDragEnd}
        />

        {isViewTransitioning ? (
          <div
            aria-hidden
            data-testid="pizarra-view-transition-vignette"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 10002,
              background:
                'linear-gradient(90deg, rgba(2,6,16,0.42) 0%, transparent 14%, transparent 86%, rgba(2,6,16,0.42) 100%)',
            }}
          />
        ) : null}

        <div
          data-testid="pizarra-element-count"
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
            opacity: hudRevealed ? 1 : 0,
            visibility: hudRevealed ? 'visible' : 'hidden',
            transition: 'opacity 0.18s ease, visibility 0.18s ease',
          }}
        >
          {mergedElements.length} element{mergedElements.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Minimap — bottom-right HUD, hidden until pan/zoom */}
      <PizarraMinimap elements={mergedElements} onSelectElement={selectElement} />

      {/* CommandBar — natural language command palette (Cmd+Shift+K) */}
      <CommandBar surfaceController={surfaceController} />
    </>
  );
}
