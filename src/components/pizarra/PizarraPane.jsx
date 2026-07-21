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
import PizarraContextMenu from './PizarraContextMenu';
import PizarraMinimap from './PizarraMinimap';
import PizarraZoneGuides from './PizarraZoneGuides';
import PizarraEdgeSwipeZones from './PizarraEdgeSwipeZones';
import PizarraZoomControls from './PizarraZoomControls';
import usePizarraCanvasPan, { isEditableTarget } from './hooks/usePizarraCanvasPan';
import CommandBar from '@/components/commandBar/CommandBar';
import { PIZARRA_ACTIONS, usePizarraState } from '@/lib/pizarra/pizarraReducer';
import { CanvasViewportProvider, useCanvasViewport } from '@/lib/pizarra/canvasViewport';
import { SHAPE_TYPES } from '@/lib/pizarra/shapeModel';
import { createShape, orderByZIndexWithSelectionBump } from '@/lib/pizarra/shapeModel';
import {
  copyPizarra,
  readPizarra,
  buildPastedShapes,
  buildPastedSurfaces,
  clipboardShapesOrigin,
  hasPizarraClipboard,
} from '@/lib/pizarra/pizarraClipboard';
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
  computeLayoutsBounds,
  computeViewportFitToBounds,
  resolveFitBoundsForView,
  resolveZoneSnap,
} from '@/lib/pizarra/canvasBounds';
import {
  computeAdaptiveSnapZones,
  computeAdaptiveRectLayout,
  computeAdaptiveViewLayout,
  computeAdaptiveVisibleLayout,
  computeViewZones,
  getViewportAnchoredLayoutRegion,
  PIZARRA_AUTOFIT_CAMERA,
  PIZARRA_AUTOFIT_LAYOUT,
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
  PIZARRA_LEFT_HUD_DOCK_WIDTH_PX,
  PIZARRA_LEFT_HUD_STACK_HEIGHT_PX,
  PIZARRA_LEFT_HUD_STACK_WIDTH_PX,
  PIZARRA_LEFT_SWIPE_INSET_BOTTOM_PX,
  PIZARRA_LEFT_SWIPE_WIDTH_PX,
} from '@/lib/pizarra/pizarraLeftChrome';
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
  isSurfacePositioned,
  isLiveElementPositioned,
  resolveRegistrySurfacesBoundsByView,
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
  /** @internal tests — start with left tools HUD expanded */
  initialHudRevealed = false,
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
  // Seed 800×600 for SSR/jsdom; useLayoutEffect overwrites with the real pane
  // size before the first paint whenever the host has layout.
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

  // Measure before paint when possible, then keep ResizeObserver in sync.
  React.useLayoutEffect(() => {
    if (!containerRef.current) return undefined;
    const el = containerRef.current;
    const applySize = (width, height) => {
      const w = Math.round(width);
      const h = Math.round(height);
      // Ignore 0×0 (jsdom / hidden keep-alive) so we keep the last good size.
      if (w < 2 || h < 2) return;
      setCanvasSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h }
      );
    };
    const rect = el.getBoundingClientRect();
    applySize(rect.width, rect.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      applySize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const views = workspaceWindows || [];
  const fallbackViewId = activeWorkspaceWindowId || views[0]?.id || null;

  // ── Unified elements state ──────────────────────────────────────────────

  const mergedElements = useMemo(() => {
    // Filter out any legacy/accidental terminal or browser elements from local state
    const localDrawings = state.elements.filter(
      (el) => el.type !== SHAPE_TYPES.TERMINAL && el.type !== SHAPE_TYPES.BROWSER
    );

    // pizarra-editing-ux: layer order for shapes via zIndex (ascending),
    // with selected shapes bumped to the top of the local group so the
    // active edit floats above its siblings while remaining behind the
    // composite (terminal/browser) overlay layer — preserving the
    // current "composites on top" behavior. Composite z-index is
    // unified into this same space in a later phase.
    const selectedIds = state.selectedElementIds;
    const localWithSelectionBump = orderByZIndexWithSelectionBump(localDrawings, selectedIds);

    // Provisional slots use the measured pane size (viewport-anchored at zoom 1).
    const registryShapes = resolveRegistrySurfacesBoundsByView(
      registry.surfaces || [],
      views,
      fallbackViewId,
      { layoutWidth: canvasSize.width, layoutHeight: canvasSize.height }
    );

    return [...localWithSelectionBump, ...registryShapes];
  }, [
    state.elements,
    state.selectedElementIds,
    registry.surfaces,
    workspaceWindows,
    activeWorkspaceWindowId,
    canvasSize.width,
    canvasSize.height,
  ]);

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

  // ── Editing UX: delete, select-all, layer order, lock ────────────────────
  // pizarra-editing-ux: keyboard + context-menu actions for the editing
  // layer. Phase 1 covers local shapes; composite (terminal/browser)
  // lock / layer-order is wired in a later phase. The delete path
  // reuses handleRemoveElement so it routes correctly between the
  // reducer (shapes) and the registry (surfaces).

  const handleDeleteSelected = useCallback(() => {
    const ids = state.selectedElementIds;
    if (ids.length === 0) return;
    // Locked elements are not deletable from this path — force unlock
    // first. This matches the lock contract: locked = no
    // move/resize/transform/delete.
    const deletable = ids.filter((id) => {
      const el = mergedElements.find((e) => e.id === id);
      return el ? !el.locked : true;
    });
    deletable.forEach((id) => handleRemoveElement(id));
    deselectAll();
  }, [state.selectedElementIds, mergedElements, handleRemoveElement, deselectAll]);

  const handleSelectAll = useCallback(() => {
    const allIds = mergedElements.map((el) => el.id);
    if (allIds.length === 0) return;
    selectElements(allIds);
  }, [mergedElements, selectElements]);

  // Layer ordering operates on the primary (first) selected element.
  // pizarra-editing-ux Phase 4: shapes go through the reducer
  // (REORDER_ELEMENT recomputes the whole zIndex stack); composites set
  // their zIndex directly via the registry, relative to the other
  // composites on the canvas.
  const handleReorderSelected = useCallback(
    (op) => {
      const ids = state.selectedElementIds;
      if (ids.length === 0) return;
      const el = mergedElements.find((e) => e.id === ids[0]);
      if (!el) return;
      const isComposite = el.type === SHAPE_TYPES.TERMINAL || el.type === SHAPE_TYPES.BROWSER;
      if (!isComposite) {
        dispatch({ type: PIZARRA_ACTIONS.REORDER_ELEMENT, payload: { id: el.id, op } });
        return;
      }
      const composites = mergedElements.filter(
        (e) => e.type === SHAPE_TYPES.TERMINAL || e.type === SHAPE_TYPES.BROWSER
      );
      const zIndices = composites.map((e) => e.zIndex ?? 0);
      const maxZ = zIndices.length ? Math.max(...zIndices) : 0;
      const minZ = zIndices.length ? Math.min(...zIndices) : 0;
      const cur = el.zIndex ?? 0;
      let nextZ = cur;
      if (op === 'front') nextZ = maxZ + 1;
      else if (op === 'back') nextZ = minZ - 1;
      else if (op === 'forward') nextZ = cur + 1;
      else if (op === 'backward') nextZ = cur - 1;
      registry.updatePizarraLayout(el.id, { zIndex: nextZ });
    },
    [state.selectedElementIds, mergedElements, dispatch, registry]
  );

  const handleToggleLockSelected = useCallback(() => {
    const ids = state.selectedElementIds;
    if (ids.length === 0) return;
    const selectedEls = ids.map((id) => mergedElements.find((e) => e.id === id)).filter(Boolean);
    if (selectedEls.length === 0) return;
    // pizarra-editing-ux Phase 4: toggle toward the opposite of the
    // "all locked" state across BOTH shapes and composites. Shapes go
    // through the reducer; composites persist locked via the registry
    // (updatePizarraLayout routes it into surface.pizarra.locked).
    const allLocked = selectedEls.every((el) => el.locked);
    const nextLocked = !allLocked;
    selectedEls.forEach((el) => {
      if (el.type === SHAPE_TYPES.TERMINAL || el.type === SHAPE_TYPES.BROWSER) {
        registry.updatePizarraLayout(el.id, { locked: nextLocked });
      } else {
        dispatch({ type: PIZARRA_ACTIONS.SET_LOCKED, payload: { id: el.id, locked: nextLocked } });
      }
    });
  }, [state.selectedElementIds, mergedElements, dispatch, registry]);

  // ── Editing UX: clipboard (copy / paste / duplicate) — shapes ────────────
  // pizarra-editing-ux Phase 2: in-session clipboard for shapes. Copy
  // serializes the selected shapes (metadata only, no id); paste mints
  // fresh ids via buildPastedShapes with a +20px offset and a zIndex
  // stacked above the current top. Duplicate = copy + paste in-place.

  const handleCopySelected = useCallback(() => {
    // pizarra-editing-ux Phase 4: copy both shapes and composites.
    // copyPizarra serializes surfaces as metadata stubs (no runtime), so
    // a mixed selection round-trips through the session clipboard.
    const els = state.selectedElementIds
      .map((id) => mergedElements.find((e) => e.id === id))
      .filter(Boolean);
    if (els.length === 0) return;
    copyPizarra(els);
  }, [state.selectedElementIds, mergedElements]);

  const handlePaste = useCallback(
    (offset) => {
      const items = readPizarra();
      if (items.length === 0) return;
      // pizarra-editing-ux Phase 4: surfaces in the clipboard spawn as
      // new processes via registry.addSurface (no id → provider mints +
      // spawns). Shapes go through the reducer BULK_ADD path.
      // Phase 5: remap surfaces to this workspace's active view so a
      // cross-pizarra paste (clipboard is app-level) lands here, not in
      // a stale viewId from the source workspace.
      const surfaceDescriptors = buildPastedSurfaces(items, offset, {
        destinationViewId: fallbackViewId,
      });
      surfaceDescriptors.forEach((desc) => registry.addSurface(desc));

      const localShapes = mergedElements.filter(
        (el) => el.type !== SHAPE_TYPES.TERMINAL && el.type !== SHAPE_TYPES.BROWSER
      );
      const maxZ = localShapes.reduce((m, el) => Math.max(m, el.zIndex ?? 0), 0);
      const pasted = buildPastedShapes(items, maxZ, offset);
      if (pasted.length > 0) {
        dispatch({ type: PIZARRA_ACTIONS.BULK_ADD, payload: pasted });
        selectElements(pasted.map((s) => s.id));
      }
    },
    [mergedElements, dispatch, selectElements, registry, fallbackViewId]
  );

  // pizarra-editing-ux: paste at a world-space anchor (context-menu
  // "Pegar aquí"). The pasted group's bounding-box origin aligns with
  // the click point; relative layout within the group is preserved.
  // Surfaces shift by the same offset so a mixed group keeps its layout.
  const handlePasteHere = useCallback(
    (worldPoint) => {
      const items = readPizarra();
      if (items.length === 0) return;
      const origin = clipboardShapesOrigin(items);
      const offset = {
        x: (worldPoint?.x ?? 0) - origin.x,
        y: (worldPoint?.y ?? 0) - origin.y,
      };
      // pizarra-editing-ux Phase 4: spawn surfaces at the anchor offset.
      // Phase 5: remap to this workspace's active view (cross-pizarra).
      const surfaceDescriptors = buildPastedSurfaces(items, offset, {
        destinationViewId: fallbackViewId,
      });
      surfaceDescriptors.forEach((desc) => registry.addSurface(desc));

      const localShapes = mergedElements.filter(
        (el) => el.type !== SHAPE_TYPES.TERMINAL && el.type !== SHAPE_TYPES.BROWSER
      );
      const maxZ = localShapes.reduce((m, el) => Math.max(m, el.zIndex ?? 0), 0);
      const pasted = buildPastedShapes(items, maxZ, offset);
      if (pasted.length > 0) {
        dispatch({ type: PIZARRA_ACTIONS.BULK_ADD, payload: pasted });
        selectElements(pasted.map((s) => s.id));
      }
    },
    [mergedElements, dispatch, selectElements, registry, fallbackViewId]
  );

  const handleDuplicateSelected = useCallback(() => {
    // pizarra-editing-ux Phase 4: duplicate both shapes and composites.
    // Copy the full selection, then paste in-place (+20px). handlePaste
    // mints fresh shape ids via the reducer and spawns fresh surface
    // processes via registry.addSurface — no runtime is cloned.
    const els = state.selectedElementIds
      .map((id) => mergedElements.find((e) => e.id === id))
      .filter(Boolean);
    if (els.length === 0) return;
    copyPizarra(els);
    handlePaste();
  }, [state.selectedElementIds, mergedElements, handlePaste]);

  // pizarra-editing-ux: grouped editing actions threaded into PizarraInner
  // so the context menu can dispatch them without duplicating logic. fit
  // and clear are provided locally by PizarraInner (handleFitAllView /
  // resetElements), so they are not included here.
  const editingActions = useMemo(
    () => ({
      duplicate: handleDuplicateSelected,
      copy: handleCopySelected,
      paste: handlePaste,
      pasteHere: handlePasteHere,
      reorder: handleReorderSelected,
      toggleLock: handleToggleLockSelected,
      delete: handleDeleteSelected,
      selectAll: handleSelectAll,
    }),
    [
      handleDuplicateSelected,
      handleCopySelected,
      handlePaste,
      handlePasteHere,
      handleReorderSelected,
      handleToggleLockSelected,
      handleDeleteSelected,
      handleSelectAll,
    ]
  );

  // pizarra-editing-ux: global keyboard shortcuts for the editing layer
  // (delete, select-all, layer order, lock). Copy/paste/duplicate are
  // reserved here and wired in Phase 2. Lives in the outer component so
  // it closes over the handlers + reducer state directly; deps-based so
  // the listener re-binds cheaply when the selection changes.
  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (isEditableTarget(target)) return;
      // Skip when the focus is inside a terminal surface: xterm owns its
      // own clipboard/keyboard context and Delete/Backspace there must
      // act on the terminal, not the pizarra selection.
      if (target && typeof target.closest === 'function') {
        if (target.closest('.xterm, [data-testid="canvas-terminal-container"]')) return;
      }
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key;

      if (key === 'Delete' || key === 'Backspace') {
        if (state.selectedElementIds.length === 0) return;
        event.preventDefault();
        handleDeleteSelected();
        return;
      }

      if (!mod) return;

      if (key === 'a' || key === 'A') {
        event.preventDefault();
        handleSelectAll();
        return;
      }
      if (key === 'c' || key === 'C') {
        if (state.selectedElementIds.length === 0) return;
        event.preventDefault();
        handleCopySelected();
        return;
      }
      if (key === 'v' || key === 'V') {
        event.preventDefault();
        handlePaste();
        return;
      }
      if (key === 'd' || key === 'D') {
        if (state.selectedElementIds.length === 0) return;
        event.preventDefault();
        handleDuplicateSelected();
        return;
      }
      if (key === 'l' || key === 'L') {
        event.preventDefault();
        handleToggleLockSelected();
        return;
      }
      if (key === ']') {
        event.preventDefault();
        handleReorderSelected(event.shiftKey ? 'front' : 'forward');
        return;
      }
      if (key === '[') {
        event.preventDefault();
        handleReorderSelected(event.shiftKey ? 'back' : 'backward');
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    state.selectedElementIds,
    handleDeleteSelected,
    handleSelectAll,
    handleCopySelected,
    handlePaste,
    handleDuplicateSelected,
    handleToggleLockSelected,
    handleReorderSelected,
  ]);

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
          editingActions={editingActions}
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
          initialHudRevealed={initialHudRevealed}
          hasRestoredViewport={Boolean(savedViewport)}
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
  editingActions,
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
  initialHudRevealed = false,
  hasRestoredViewport = false,
}) {
  const { zoom, pan, setZoom, setPan, viewportToCanvas, setWheelViewNavigateHandler } =
    useCanvasViewport();

  // After the user pans/zooms manually, skip automatic camera refits that would
  // snap the board back to the last "Fijar vista" / auto-ajuste framing.
  const userAdjustedViewportRef = useRef(hasRestoredViewport);
  const markUserAdjustedViewport = useCallback(() => {
    userAdjustedViewportRef.current = true;
  }, []);

  // pizarra-editing-ux: context-menu state. contextShapeId is the shape
  // under the right-click (null = empty canvas); it is set synchronously
  // in the Konva contextmenu handler before Radix opens the menu, and
  // reset when the menu closes. pasteHereAnchorRef holds the world-space
  // click point for "Pegar aquí".
  const [contextShapeId, setContextShapeId] = useState(null);
  const pasteHereAnchorRef = useRef(null);
  const handleCanvasContextMenu = useCallback(
    ({ id, clientX, clientY }) => {
      pasteHereAnchorRef.current = viewportToCanvas(clientX, clientY);
      if (id) {
        onSelect(id, false);
        setContextShapeId(id);
      } else {
        setContextShapeId(null);
      }
    },
    [onSelect, viewportToCanvas]
  );

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
  const multiViewChrome = views.length >= 2;

  const [hudRevealed, setHudRevealed] = useState(initialHudRevealed);
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
      // Guard: jsdom may destroy the document between scheduling and firing (test teardown).
      if (typeof window === 'undefined' || !window.document) return;
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
    onUserViewportAdjust: markUserAdjustedViewport,
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
    const primary = pendingViewId || activeWorkspaceWindowId || fallbackViewId;
    // No workspace windows yet: still treat surfaces as visible so entry
    // auto-fit and add-terminal work (tests + brand-new boards).
    if (primary) return [primary];
    return ['__default__'];
  }, [viewTransitionPair, pendingViewId, activeWorkspaceWindowId, fallbackViewId]);

  const isViewTransitioning = Boolean(viewTransitionPair);

  const liveSurfacesForZones = useMemo(() => {
    return (mergedElements || []).filter((el) => {
      if (el.type !== SHAPE_TYPES.TERMINAL && el.type !== SHAPE_TYPES.BROWSER) return false;
      if (el.pizarra?.visible === false) return false;
      // No real views: include every live surface.
      if (views.length === 0) return true;
      // Layout and snap operations are scoped to the active view, even while
      // a transition temporarily renders both views. Terminal ownership is
      // strict; only legacy workspace browsers may use the active fallback.
      const membershipFallback = el.type === SHAPE_TYPES.BROWSER ? fallbackViewId : null;
      return surfaceBelongsToView(el, fallbackViewId, views, membershipFallback);
    });
  }, [mergedElements, views, fallbackViewId]);

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

  const postViewSwitchFitRef = useRef(null);

  const finishViewSwitch = useCallback(
    (viewId) => {
      setViewTransitionPair(null);
      setPendingViewId(null);
      onWorkspaceWindowSelect?.(viewId);
      postViewSwitchFitRef.current = viewId;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('devhub:pizarra-view-switch-complete', {
            detail: { workspaceId, viewId },
          })
        );
      }
    },
    [onWorkspaceWindowSelect, workspaceId]
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

  const fitCameraToBounds = useCallback(
    (fitBounds, options = {}) => {
      if (!fitBounds?.width || !fitBounds?.height) {
        centerActiveView(options.zoom ?? 1);
        return;
      }
      const camera = { ...PIZARRA_AUTOFIT_CAMERA, ...options };
      const { zoom: fitZoom, pan: fitPan } = computeViewportFitToBounds(
        fitBounds,
        canvasSize.width,
        canvasSize.height,
        camera
      );
      setZoom(fitZoom);
      setPan(fitPan);
    },
    [canvasSize.width, canvasSize.height, centerActiveView, setZoom, setPan]
  );

  const fitCameraToActiveView = useCallback(
    (options = {}) => {
      if (liveSurfacesForZones.length === 0) {
        centerActiveView(options.zoom ?? 1);
        return;
      }

      const surfaceBounds = computeElementsBounds(liveSurfacesForZones, { padding: 8 });
      const viewBounds = getViewportAnchoredLayoutRegion(
        viewOrigin,
        canvasSize.width,
        canvasSize.height
      );
      const fitBounds = resolveFitBoundsForView(
        surfaceBounds?.width > 0 && surfaceBounds?.height > 0 ? surfaceBounds : null,
        activeSnapZones?.bounds || viewBounds
      );
      fitCameraToBounds(fitBounds, options);
    },
    [
      liveSurfacesForZones,
      centerActiveView,
      activeSnapZones,
      viewOrigin,
      canvasSize.width,
      canvasSize.height,
      fitCameraToBounds,
    ]
  );

  const handleFitAllView = useCallback(() => {
    if (isViewTransitioning) return;
    userAdjustedViewportRef.current = false;
    if (liveSurfacesForZones.length === 0) {
      centerActiveView(1);
      return;
    }
    const layoutRegion = getViewportAnchoredLayoutRegion(
      viewOrigin,
      canvasSize.width,
      canvasSize.height
    );
    const { layouts, hiddenBrowserIds } = computeAdaptiveRectLayout(
      layoutRegion,
      liveSurfacesForZones,
      PIZARRA_AUTOFIT_LAYOUT
    );
    layouts.forEach(({ id, x, y, width, height }) => {
      onUpdateElement?.(id, { x, y, width, height, visible: true });
    });
    hiddenBrowserIds.forEach((id) => {
      registry.updatePizarraLayout?.(id, { visible: false });
    });
    const fitBounds =
      computeLayoutsBounds(layouts, 4) ||
      getViewportAnchoredLayoutRegion(viewOrigin, canvasSize.width, canvasSize.height);
    fitCameraToBounds(fitBounds);
  }, [
    liveSurfacesForZones,
    centerActiveView,
    viewOrigin,
    canvasSize.width,
    canvasSize.height,
    onUpdateElement,
    registry,
    fitCameraToBounds,
    isViewTransitioning,
  ]);

  // Single entry/settle auto-fit: wait for a real measured pane, then layout
  // cards to that rect + camera at zoom≈1 in one shot. Avoids the old cascade
  // (fake 800×600 → delay 60–350ms → camera-only zoom with maxZoom 4 → second resize).
  const entryFitKeysByViewRef = useRef(new Map());
  const autoFitTimerRef = useRef(null);

  const collectTerminalPanelIds = useCallback((surfaces = []) => {
    return surfaces
      .filter((el) => el.type === SHAPE_TYPES.TERMINAL || el.type === 'terminal')
      .map((el) => el.panelId || String(el.id || '').replace(/^shape-term-/, ''))
      .filter(Boolean);
  }, []);

  const runEntryAutoFit = useCallback(
    ({ reason = 'pizarra-entry-fit', forceLayout = false, cameraOnly = false } = {}) => {
      if (canvasSize.width < 200 || canvasSize.height < 200) return false;
      if (isViewTransitioning) return false;
      const count = liveSurfacesForZones.length;
      if (count === 0) {
        if (!hasRestoredViewport && !userAdjustedViewportRef.current) {
          centerActiveView(1);
        }
        return true;
      }
      // Carried terminals (null coords) or forced entry: full adaptive layout +
      // camera. Spawned cards that already have coords keep them (cascade tests /
      // intentional placement) — only camera framing runs.
      if (cameraOnly && !forceLayout) {
        fitCameraToActiveView();
      } else {
        userAdjustedViewportRef.current = false;
        handleFitAllView();
      }
      const panelIds = collectTerminalPanelIds(liveSurfacesForZones);
      if (panelIds.length > 0) {
        dispatchTerminalLayoutSettled({ reason, panelIds });
      }
      return true;
    },
    [
      canvasSize.width,
      canvasSize.height,
      isViewTransitioning,
      liveSurfacesForZones,
      hasRestoredViewport,
      centerActiveView,
      handleFitAllView,
      fitCameraToActiveView,
      collectTerminalPanelIds,
    ]
  );

  useLayoutEffect(() => {
    if (canvasSize.width < 200 || canvasSize.height < 200) return;
    if (isViewTransitioning) return;
    const idsKey = liveSurfacesForZones
      .map((s) => s.id)
      .sort()
      .join('|');
    const fitKey = `${workspaceId}|${Math.round(canvasSize.width)}x${Math.round(canvasSize.height)}|${idsKey}`;
    const entryViewId = activeWorkspaceWindowId || fallbackViewId || '__default__';
    const previousFitKey = entryFitKeysByViewRef.current.get(entryViewId) || '';
    if (fitKey === previousFitKey) return;

    const prevKey = previousFitKey;
    const prevIds = prevKey.includes('|') ? prevKey.split('|').slice(2).join('|') : '';
    const surfacesChanged = prevKey !== '' && prevIds !== idsKey;
    const canvasChanged = prevKey !== '' && prevIds === idsKey && prevKey !== fitKey;
    const firstSurfaces = (prevIds === '' || prevKey === '') && idsKey !== '';
    const previousSurfaceCount = prevIds ? prevIds.split('|').filter(Boolean).length : 0;
    const currentSurfaceCount = idsKey ? idsKey.split('|').filter(Boolean).length : 0;
    const surfaceRemoved = surfacesChanged && currentSurfaceCount < previousSurfaceCount;

    if (userAdjustedViewportRef.current && !surfacesChanged && !firstSurfaces && prevKey !== '') {
      entryFitKeysByViewRef.current.set(entryViewId, fitKey);
      return;
    }

    entryFitKeysByViewRef.current.set(entryViewId, fitKey);

    const hasUnpositioned = liveSurfacesForZones.some((s) => !isLiveElementPositioned(s));
    // Full layout: unpositioned carried terminals, first appearance of unpositioned
    // set, or canvas resized to a real pane size. Positioned spawns keep coords.
    const forceLayout =
      hasUnpositioned ||
      canvasChanged ||
      (firstSurfaces && hasUnpositioned) ||
      (firstSurfaces && liveSurfacesForZones.some((s) => s._layoutProvisional)) ||
      (surfaceRemoved && !isViewLocked);
    const cameraOnly =
      !forceLayout &&
      (firstSurfaces || surfacesChanged) &&
      liveSurfacesForZones.every(isLiveElementPositioned);

    runEntryAutoFit({
      reason: surfacesChanged
        ? 'pizarra-surfaces-changed'
        : canvasChanged
          ? 'pizarra-canvas-resize'
          : 'pizarra-entry-fit',
      forceLayout:
        forceLayout || (!cameraOnly && (firstSurfaces || canvasChanged || prevKey === '')),
      cameraOnly,
    });
  }, [
    workspaceId,
    canvasSize.width,
    canvasSize.height,
    liveSurfacesForZones,
    isViewTransitioning,
    runEntryAutoFit,
    activeWorkspaceWindowId,
    fallbackViewId,
    isViewLocked,
  ]);

  const scheduleAutoFitView = useCallback(
    (delayMs = 0) => {
      if (userAdjustedViewportRef.current) return;
      if (autoFitTimerRef.current) {
        clearTimeout(autoFitTimerRef.current);
      }
      autoFitTimerRef.current = setTimeout(
        () => {
          autoFitTimerRef.current = null;
          if (userAdjustedViewportRef.current) return;
          handleFitAllView();
          const panelIds = collectTerminalPanelIds(liveSurfacesForZones);
          if (panelIds.length > 0) {
            dispatchTerminalLayoutSettled({ reason: 'pizarra-autofit', panelIds });
          }
        },
        Math.max(0, delayMs)
      );
    },
    [handleFitAllView, collectTerminalPanelIds, liveSurfacesForZones]
  );

  const scheduleCameraFitView = useCallback(
    (delayMs = 0) => {
      if (autoFitTimerRef.current) {
        clearTimeout(autoFitTimerRef.current);
        autoFitTimerRef.current = null;
      }
      autoFitTimerRef.current = setTimeout(
        () => {
          autoFitTimerRef.current = null;
          fitCameraToActiveView();
        },
        Math.max(0, delayMs)
      );
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

  useEffect(() => {
    if (isViewTransitioning || !postViewSwitchFitRef.current) return;
    const switchedTo = postViewSwitchFitRef.current;
    postViewSwitchFitRef.current = null;
    const activeId = activeWorkspaceWindowId || fallbackViewId;
    if (switchedTo !== activeId) return;
    if (skipViewAutoFitRef.current) {
      skipViewAutoFitRef.current = false;
      if (!userAdjustedViewportRef.current) {
        fitCameraToActiveView();
      }
      return;
    }
    if (liveSurfacesForZones.length === 0) {
      if (!userAdjustedViewportRef.current) {
        centerActiveView(1);
      }
      return;
    }
    if (userAdjustedViewportRef.current) return;
    if (!isViewLocked) {
      handleFitAllView();
    } else {
      fitCameraToActiveView();
    }
  }, [
    isViewTransitioning,
    activeWorkspaceWindowId,
    fallbackViewId,
    liveSurfacesForZones.length,
    isViewLocked,
    handleFitAllView,
    fitCameraToActiveView,
    centerActiveView,
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
      // Immediate schedule — entry layout effect also covers first paint.
      scheduleAutoFitView(0);
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

  // Surfaces often arrive after mount (carried from normal view). Entry
  // useLayoutEffect already auto-fits when the surface set changes; keep a
  // light fallback for unlocked boards with unpositioned cards.
  useEffect(() => {
    const count = liveSurfacesForZones.length;
    if (count === 0 || canvasSize.width < 200) {
      prevSurfaceCountRef.current = count;
      return;
    }
    const hadNoSurfaces = prevSurfaceCountRef.current === 0;
    prevSurfaceCountRef.current = count;
    if (!hadNoSurfaces) return;
    if (isViewLocked || isViewTransitioning) return;
    const allPositioned = liveSurfacesForZones.every(isLiveElementPositioned);
    if (allPositioned) return;
    scheduleAutoFitView(0);
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

      const { layouts, hiddenBrowserIds } = computeAdaptiveViewLayout(viewOrigin, group);
      hiddenBrowserIds?.forEach((id) => {
        try {
          registry.updatePizarraLayout(id, { visible: false });
        } catch {
          // best-effort
        }
      });
      const slotById = new Map(layouts.map((l) => [l.id, l]));
      group.forEach((s) => {
        if (laidOutRegistryRef.current.has(s.id)) return;
        const slot = slotById.get(s.id);
        if (!slot) return;
        const { id: _id, ...layout } = slot;
        try {
          registry.updatePizarraLayout(s.id, { ...layout, visible: true });
        } catch {
          // best-effort
        }
        laidOutRegistryRef.current.add(s.id);
      });
      assigned = true;
    }

    if (
      needs.length > 0 &&
      assigned &&
      !isViewLockedRef.current &&
      !userAdjustedViewportRef.current
    ) {
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
          url:
            cleanedExtraProps.url ||
            (type === 'browser' ? 'https://duckduckgo.com/' : undefined),
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
            scheduleAutoFitView(0);
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
        const live = liveSurfacesForZones;
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
          url: 'https://duckduckgo.com/',
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
          url: 'https://duckduckgo.com/',
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
          url: 'https://duckduckgo.com/',
          label: 'Browser 1',
          requestedRendererMode: 'xterm-webgl',
        });
        registry.addSurface({
          type: 'browser',
          pizarra: { ...slots.browsers[1], visible: true },
          url: 'https://duckduckgo.com/',
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
      liveSurfacesForZones,
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
  const liveSurfacesForDividers = liveSurfacesForZones;

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

    const liveSurfaces = liveSurfacesForZones;
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
      // 0ms — entry useLayoutEffect already did the first fit; this only
      // covers unlocked boards when the user adds another card.
      scheduleAutoFitView(0);
    }
  }, [canvasSize, liveSurfacesForZones, scheduleAutoFitView, isViewLocked]);

  // Listen for deferred auto-refit events dispatched by handleAddElement
  // when a new card is added while others already exist.
  React.useEffect(() => {
    const handler = () => handleFitAllView();
    window.addEventListener('pizarra:arrange-fit', handler);
    return () => window.removeEventListener('pizarra:arrange-fit', handler);
  }, [handleFitAllView]);

  // pizarra-editing-ux: context-menu derived state + action wiring.
  const contextMode = contextShapeId ? 'element' : 'canvas';
  const contextLocked = contextShapeId
    ? Boolean(mergedElements.find((el) => el.id === contextShapeId)?.locked)
    : false;
  const contextCanPaste = hasPizarraClipboard();
  const contextMenuActions = useMemo(
    () => ({
      duplicate: editingActions?.duplicate,
      copy: editingActions?.copy,
      bringToFront: () => editingActions?.reorder?.('front'),
      forward: () => editingActions?.reorder?.('forward'),
      backward: () => editingActions?.reorder?.('backward'),
      sendToBack: () => editingActions?.reorder?.('back'),
      toggleLock: editingActions?.toggleLock,
      delete: editingActions?.delete,
      pasteHere: () => editingActions?.pasteHere?.(pasteHereAnchorRef.current),
      selectAll: editingActions?.selectAll,
      fitAll: handleFitAllView,
      clear: resetElements,
    }),
    [editingActions, handleFitAllView, resetElements]
  );

  return (
    <>
      {/* Property inspector removed — user-facing elements (terminal/browser) don't expose it */}

      {/* Konva canvas — dynamically imported, client-only */}
      <PizarraContextMenu
        mode={contextMode}
        locked={contextLocked}
        canPaste={contextCanPaste}
        actions={contextMenuActions}
        onOpenChange={(open) => {
          if (!open) setContextShapeId(null);
        }}
      >
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
            onUserViewportAdjust={markUserAdjustedViewport}
            onContextMenu={handleCanvasContextMenu}
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
            isSurfaceDragging={isSurfaceDragging}
            hudRevealed={hudRevealed}
            // pizarra-editing-ux Phase 4: right-click on a composite surface
            // records the target id + world anchor so the shared Radix menu
            // (wrapping the canvas container) opens over the surface.
            onSurfaceContextMenu={handleCanvasContextMenu}
            // Draggable zonas / dividers
            layoutDividers={layoutDividers}
            onDividerMouseDown={handleDividerMouseDown}
          />
        </div>
      </PizarraContextMenu>

      {!hudRevealed ? (
        <div
          data-testid="pizarra-left-hud-reveal"
          onMouseEnter={revealHud}
          title={
            multiViewChrome
              ? 'Herramientas y zoom. Arriba: arrastra el borde para cambiar de ventana.'
              : 'Mostrar herramientas y zoom'
          }
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: PIZARRA_LEFT_HUD_STACK_WIDTH_PX,
            height: PIZARRA_LEFT_HUD_STACK_HEIGHT_PX,
            pointerEvents: 'auto',
            zIndex: 10007,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 4,
            paddingBottom: 10,
            background:
              'linear-gradient(0deg, rgba(10, 15, 28, 0.82) 0%, rgba(10, 15, 28, 0.35) 55%, transparent 100%)',
            borderTopRightRadius: 10,
            cursor: 'default',
          }}
        >
          {multiViewChrome ? (
            <span
              style={{
                fontSize: 8,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'rgba(147, 197, 253, 0.55)',
                userSelect: 'none',
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                marginBottom: 4,
              }}
            >
              Ventana
            </span>
          ) : null}
          <div
            style={{
              width: 3,
              height: 36,
              borderRadius: 4,
              background:
                'linear-gradient(180deg, transparent, rgba(88,166,255,0.45) 20%, rgba(88,166,255,0.45) 80%, transparent)',
            }}
          />
          <span
            style={{
              fontSize: 8,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(147, 197, 253, 0.75)',
              userSelect: 'none',
            }}
          >
            Tools
          </span>
        </div>
      ) : null}

      <div
        data-testid="pizarra-hud-dock"
        onMouseEnter={revealHud}
        onMouseLeave={scheduleHideHud}
        style={{
          position: 'absolute',
          left: multiViewChrome ? PIZARRA_LEFT_SWIPE_WIDTH_PX : 0,
          top: 0,
          bottom: 0,
          width: PIZARRA_LEFT_HUD_DOCK_WIDTH_PX,
          pointerEvents: hudRevealed ? 'auto' : 'none',
          zIndex: 10005,
        }}
      >
        <PizarraToolPalette
          value={state.activeTool}
          onChange={setTool}
          onAddElement={handleAddElement}
          onApplyLayout={handleApplyLayout}
          isViewLocked={isViewLocked}
          onToggleViewLocked={toggleViewLocked}
          revealed={hudRevealed}
          onRevealRequest={revealHud}
          dockOffsetLeft={0}
        />

        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 96,
            pointerEvents: hudRevealed ? 'auto' : 'none',
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
      </div>

      <PizarraEdgeSwipeZones
        enabled={multiViewChrome && !isSurfaceDragging}
        canvasHeight={canvasSize.height}
        canGoPrev={canGoPrevView}
        canGoNext={canGoNextView}
        leftInsetBottom={PIZARRA_LEFT_SWIPE_INSET_BOTTOM_PX}
        leftZoneWidth={PIZARRA_LEFT_SWIPE_WIDTH_PX}
        onDragStart={handleEdgeSwipeDragStart}
        onDragMove={handleEdgeSwipeDragMove}
        onDragEnd={handleEdgeSwipeDragEnd}
      />

      <div
        data-testid="pizarra-hud-layer"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 10000,
        }}
      >
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
