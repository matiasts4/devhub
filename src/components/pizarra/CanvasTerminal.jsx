'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import TerminalTTY from '@/components/TerminalTTY';
import {
  SharedTerminalSurfacePortal,
  hasSharedTerminalSurfaceProps,
  mergeSharedTerminalSurfaceProps,
  setSharedTerminalSurfaceProps,
  useSharedTerminalSurfacesEnabled,
} from '@/components/terminal/SharedTerminalSurface';
import usePizarraSurfaceDrag from './usePizarraSurfaceDrag';
import SurfaceDragRing from './SurfaceDragRing';
import {
  ensureSurfaceMotionKeyframes,
  resolveFrameVisual,
  resolveHandleSizing,
  FRAME_TRANSITION,
  SURFACE_ENTER_OPACITY_ONLY,
  PIZARRA_SURFACE_FRAME_INSET,
  PIZARRA_SURFACE_HEADER_HEIGHT,
  PIZARRA_SURFACE_BORDER_RADIUS,
  PIZARRA_SURFACE_HEADER_STYLE,
  PIZARRA_SURFACE_FRAME_BG,
} from '@/lib/pizarra/surfaceMotion';
import {
  useSurfaceEnterAnimation,
  SURFACE_ENTER_STATE_ATTRIBUTE,
} from '@/lib/pizarra/useSurfaceEnterAnimation';
// Note: we DO NOT route the requested renderer through
// resolveRendererSelection here. That resolver consults a STATIC
// capability map (no live WebGL probe is wired in this code path), so
// it always reports xterm-webgl as `not-ready` and demotes the
// requested mode to 'xterm' — which would defeat the per-shape
// renderer switcher (user picks xterm-webgl, terminal renders plain
// xterm). We pass the requested mode through to TerminalTTY as-is and
// let IT run the live WebGL probe in its own mount; TerminalTTY
// already surfaces a visible demotion warning if the probe fails.
import PanelRendererSelect from '@/components/terminal/components/PanelRendererSelect';
import { SHOW_RENDERER_SWITCH } from '@/components/terminal/terminalRendererPreferences';

// pizarra-shared-view-state (Phase 1 — flicker fix): the minimum
// pointer travel that separates a click from a drag. Below this
// threshold the web chrome drag state is NOT promoted on mousedown,
// so a pure selection click no longer triggers a suspend/reattach
// round-trip that causes visible flicker.
//
// Hypotenuse of (rawDeltaX, rawDeltaY) — the browser-reported
// pre-zoom screen pixels of the pointer since drag start — is
// compared against DRAG_THRESHOLD_PX. The first move that crosses
// it promotes "pointerDown" to "isLiveDragging". See design §6.1.
const DRAG_THRESHOLD_PX = 3;

export default function CanvasTerminal({
  terminalId,
  shape,
  bounds,
  position,
  size,
  selected = false,
  zoom = 1,
  onSelect,
  onClose,
  onResize,
  onActivatePanel,
  onMove,
  onDragEnd,
  cwd,
  initialCommand,
  autoFocus = false,
  isActivePanel = false,
  // pizarra: default renderer matches the terminals page (xterm-webgl).
  requestedRendererMode = 'xterm-webgl',
  onUpdateRendererMode,
  visibleTerminalPanelCount = 1,
  pizarraOwnsLiveSurfaces = false,
  suspendDuringViewTransition = false,
  suspendDuringCanvasPan = false,
  skipEnterAnimation = false,
  isShown = true,
  // pizarra-editing-ux Phase 4: locked surfaces skip drag (the hook bails)
  // and resize (the layer guards onResize). Selection still works.
  locked = false,
}) {
  // Canvas terminal surfaces now use the web xterm renderer only.
  // The native VTE path has been removed; requestedRendererMode is
  // passed through to TerminalTTY, which performs the live WebGL probe.
  const sharedSurfacesEnabled = useSharedTerminalSurfacesEnabled();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: fallback shape object is stable in practice
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

  // pizarra-motion: inject shared enter keyframes once.
  useEffect(() => {
    ensureSurfaceMotionKeyframes();
  }, []);

  // pizarra-motion: hover state drives the idle border/shadow highlight.
  const [isHovered, setIsHovered] = useState(false);
  const handleFrameMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleFrameMouseLeave = useCallback(() => setIsHovered(false), []);

  const handleFrameMouseDown = useCallback(
    (event) => {
      event.stopPropagation();
      handleSurfaceSelect(resolvedShape.id);
    },
    [handleSurfaceSelect, resolvedShape.id]
  );

  // pizarra-shared-view-state (Phase 1 — flicker fix): decouple
  // suspendNativeSurface from mousedown. Two booleans instead of one:
  //
  //   - pointerDown  — set on mousedown of the header or any resize
  //                    handle. Cleared on mouseup. Visual state only
  //                    (cursor / border / drag-frame visual).
  //   - isLiveDragging — set on the FIRST mousemove after pointerDown
  //                    (header/card drag path only). Drives suspendNativeSurface
  //                    so the native VTE is hidden only during actual card moves
  //                    (to avoid desync with absolute native positioning).
  //   - isResizing — set during border resize (after threshold). Does NOT
  //                  drive suspend, so content stays visible and live-updates
  //                  during resize (matching normal workspace panel behavior).
  //
  // The 3px threshold is the smallest movement that reliably
  // distinguishes a click from a drag at typical pointer precision.
  // See design §6.1.
  const [pointerDown, setPointerDown] = useState(false);
  const [isLiveDragging, setIsLiveDragging] = useState(false);
  const [_isResizing, setIsResizing] = useState(false);
  const hasMovedRef = useRef(false);
  // pizarra-resize-fluidity: ref for direct style mutation on the container root
  // during resize (unifies with browser + drag pattern).
  const surfaceRootRef = useRef(null);

  // Derived value for VISUAL state only (frame border, cursor, drag
  // transform). NEVER drives suspendNativeSurface — that is the whole
  // point of the flicker fix.
  const isDragging = pointerDown || isLiveDragging;
  const suspendNative = isLiveDragging || suspendDuringViewTransition || suspendDuringCanvasPan;

  useLayoutEffect(() => {
    if (!sharedSurfacesEnabled || !terminalId || !pizarraOwnsLiveSurfaces) return;
    const patch = {
      surfaceHost: 'pizarra',
      pizarraOwnsLiveSurfaces: true,
      isVisibleInLayout: isShown,
      suspendNativeSurface: suspendNative,
      autoFocus: autoFocus || isActivePanel,
      isActivePanel,
      onClose,
      onResize,
      onActivatePanel,
      cwd,
      initialCommand,
      requestedRendererMode,
      visibleTerminalPanelCount,
    };
    if (!hasSharedTerminalSurfaceProps(terminalId)) {
      setSharedTerminalSurfaceProps(terminalId, { id: terminalId, ...patch });
      return;
    }
    mergeSharedTerminalSurfaceProps(terminalId, patch);
  }, [
    sharedSurfacesEnabled,
    terminalId,
    pizarraOwnsLiveSurfaces,
    suspendNative,
    autoFocus,
    isActivePanel,
    onClose,
    onResize,
    onActivatePanel,
    cwd,
    initialCommand,
    requestedRendererMode,
    visibleTerminalPanelCount,
    isShown,
  ]);

  // pizarra-drag-resize-polish: border-based resize. The Konva
  // Transformer is excluded for TERMINAL shapes (composite type), so
  // the user grabs any of the 8 edge/corner handles and drags to
  // resize. The resize is live (calls onResize every mousemove) so
  // the visual feedback stays in sync with the cursor.
  //
  // pizarra-shared-view-state (Phase 1): the same 3px threshold gate
  // applies to the resize path. pointerDown is set on mousedown; the
  // mousemove handler flips isLiveDragging once the threshold is
  // crossed. Mouseup clears both. setIsDragging (legacy alias) is no
  // longer used here — the resize handler is wired through the new
  // pointerDown/isLiveDragging state machine.
  const handleResizeStart = useCallback(
    (event, dir) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      handleSurfaceSelect(resolvedShape.id);

      // pizarra-resize-canvas-coords: resize in CANVAS space using the
      // real shape geometry (shape.x/y/width/height), NOT the zeroed
      // localBounds the parent passes for positioning. Screen deltas are
      // divided by zoom so the surface tracks the cursor 1:1 and the
      // OPPOSITE edge stays anchored — this fixes the teleport-to-origin
      // bug where grabbing the n/w edge jumped the panel to canvas (0,0).
      const z = zoom > 0 ? zoom : 1;
      const startBounds = {
        x: resolvedShape.x ?? resolvedBounds.x,
        y: resolvedShape.y ?? resolvedBounds.y,
        width: resolvedShape.width ?? resolvedBounds.width,
        height: resolvedShape.height ?? resolvedBounds.height,
      };
      const startX = event.clientX;
      const startY = event.clientY;
      let _lastBounds = startBounds;
      const minW = 160;
      const minH = 120;

      // pizarra-shared-view-state (Phase 1): reset the threshold gate
      // for the resize path. hasMovedRef is shared with the header
      // path, but is cleared on every new pointerDown so the gate
      // always starts fresh.
      hasMovedRef.current = false;
      setPointerDown(true);

      const handleMouseMove = (moveEvent) => {
        // Threshold gate: first move that crosses DRAG_THRESHOLD_PX
        // promotes pointerDown → isLiveDragging, which suspends the
        // native VTE panel. Before that, the panel stays visible (no
        // flicker on selection click). We use raw screen deltas
        // (clientX/Y differences, NOT post-zoom) because the 3px
        // threshold is about real pointer movement.
        if (!hasMovedRef.current) {
          const rawTravel = Math.hypot(
            moveEvent.clientX - startX || 0,
            moveEvent.clientY - startY || 0
          );
          if (rawTravel > DRAG_THRESHOLD_PX) {
            hasMovedRef.current = true;
            setIsResizing(true);
            // Note: we deliberately do NOT setIsLiveDragging here.
            // isLiveDragging is only for full card drags (header), so that
            // during border resize the native VTE content stays visible and
            // keeps painting, matching the behavior of the normal dock/workspace
            // resizable panels.
          }
        }

        const dx = (moveEvent.clientX - startX) / z;
        const dy = (moveEvent.clientY - startY) / z;
        const next = { ...startBounds };
        if (dir.includes('e')) {
          next.width = Math.max(minW, startBounds.width + dx);
        }
        if (dir.includes('s')) {
          next.height = Math.max(minH, startBounds.height + dy);
        }
        if (dir.includes('w')) {
          const w = Math.max(minW, startBounds.width - dx);
          next.width = w;
          next.x = startBounds.x + (startBounds.width - w);
        }
        if (dir.includes('n')) {
          const h = Math.max(minH, startBounds.height - dy);
          next.height = h;
          next.y = startBounds.y + (startBounds.height - h);
        }
        _lastBounds = next;

        // pizarra-resize-fluidity: direct mutate the root (and Live wrapper ancestor)
        // so the chrome frame resizes at pointer speed without waiting for React commit
        // from the onResize state update. Complements the live onResize (kept for TTY
        // internal reflow + existing test contract).
        const surfaceRoot = surfaceRootRef.current;
        const liveWrapper = surfaceRoot ? surfaceRoot.parentElement : null;
        const screenW = Math.max(
          minW * z,
          (startBounds.width + (dir.includes('e') ? dx : dir.includes('w') ? -dx : 0)) * z
        );
        const screenH = Math.max(
          minH * z,
          (startBounds.height + (dir.includes('s') ? dy : dir.includes('n') ? -dy : 0)) * z
        );
        if (liveWrapper) {
          liveWrapper.style.width = `${screenW}px`;
          liveWrapper.style.height = `${screenH}px`;
          if (dir.includes('w'))
            liveWrapper.style.left = `${(startBounds.x + (startBounds.width - next.width)) * z}px`;
          if (dir.includes('n'))
            liveWrapper.style.top = `${(startBounds.y + (startBounds.height - next.height)) * z}px`;
        }
        if (surfaceRoot) {
          surfaceRoot.style.width = `${screenW}px`;
          surfaceRoot.style.height = `${screenH}px`;
        }

        onResize?.(next);
      };

      const handleMouseUp = () => {
        hasMovedRef.current = false;
        setPointerDown(false);
        setIsLiveDragging(false);
        setIsResizing(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [handleSurfaceSelect, onResize, resolvedBounds, resolvedShape, zoom]
  );

  const handleHeaderMouseDown = usePizarraSurfaceDrag({
    surfaceId: resolvedShape.id,
    bounds: resolvedBounds,
    onSelect: handleSurfaceSelect,
    onMove,
    locked,
    // pizarra-shared-view-state (Phase 1 — flicker fix): the hook
    // exposes onDragStart / onDragMove / onDragEnd so the consumer
    // (CanvasTerminal) can run the 3px threshold gate before flipping
    // suspendNativeSurface. The legacy isDragging boolean is kept as a
    // derived value (`pointerDown || isLiveDragging`) for visual
    // state only and does NOT drive suspendNativeSurface.
    onDragStart: () => {
      hasMovedRef.current = false;
      setPointerDown(true);
    },
    onDragMove: (moveEvent, rawDeltas) => {
      if (!hasMovedRef.current) {
        // Threshold check on raw pre-zoom screen deltas (the
        // 3px gate is about real pointer movement, not post-zoom
        // logical deltas). The hook computes rawTotalDeltaX/Y from
        // clientX/clientY differences and passes them here. JSDOM
        // does not populate moveEvent.movementX/Y, so the raw deltas
        // from the hook are the test-friendly source of truth.
        const dx = (rawDeltas && rawDeltas.rawTotalDeltaX) || 0;
        const dy = (rawDeltas && rawDeltas.rawTotalDeltaY) || 0;
        const travel = Math.hypot(dx, dy);
        if (travel > DRAG_THRESHOLD_PX) {
          hasMovedRef.current = true;
          setIsLiveDragging(true);
        }
      }
    },
    onDragEnd: (args) => {
      setPointerDown(false);
      setIsLiveDragging(false);
      onDragEnd?.(args);
    },
    moveMeta: { terminalId },
    // pizarra-motion: NO per-tick native IPC during drag. The web
    // surface stays visible during a real drag (suspendNativeSurface
    // is driven by isLiveDragging, NOT pointerDown), so a selection
    // click never triggers a hide/show round-trip. The surface is
    // repositioned by the resolvedBounds effect after the new x/y are
    // committed to the reducer.
  });

  // pizarra-fix-strictmode-unmount-2026-06-01: REMOVED the
  // close-on-unmount useEffect entirely. The previous version
  // (pizarra-add-terminal-bugfix) used useEffect(..., []) with a
  // cleanup that called onClose, intending to fire only on real
  // unmount. But React.StrictMode in development (src/index.js)
  // intentionally double-mounts components to surface side effects,
  // which fires the cleanup on the FIRST mount/unmount cycle —
  // dispatching DELETE_ELEMENT for the just-added terminal. The
  // symptom: clicking "Add Terminal" creates the shape
  // (state.elements.length goes 0 → 1), then immediately deletes
  // it (1 → 0) because the cleanup runs.
  //
  // The onClose prop is now ONLY called from the explicit X-button
  // click handler below. Unmount cleanup is a no-op. TTY session
  // teardown is handled by the PizarraPane via a separate
  // 'devhub:terminal-session-closing' custom event (see
  // PizarraPane.jsx).
  void onClose; // keep the prop in the signature for the X button below

  const frameVisual = resolveFrameVisual({
    selected,
    hovered: isHovered,
    dragging: isDragging,
  });
  const handleSizing = resolveHandleSizing(zoom);
  const frameInset = PIZARRA_SURFACE_FRAME_INSET;
  const headerHeight = PIZARRA_SURFACE_HEADER_HEIGHT;
  // pizarra-motion-polish (P-MP-6): apply the opacity-only enter
  // animation to the inner frame (not the positioned wrapper, which
  // is IPC-locked to the native VTE rect). The animation runs once
  // on mount and the data-surface-state="entering" attribute is
  // dropped after DUR.enter ms so the chrome settles.
  const enterAnim = useSurfaceEnterAnimation(!skipEnterAnimation);

  return (
    <div
      ref={surfaceRootRef}
      data-testid="canvas-terminal-container"
      style={{
        position: 'absolute',
        left: resolvedBounds.x,
        top: resolvedBounds.y,
        width: resolvedBounds.width,
        height: resolvedBounds.height,
        pointerEvents: 'none',
        // NOTE: NO animation / willChange:transform here (see PizarraBrowserSurface for rationale).
        // Native VTE + browser overlays must never see wrapper transforms from enter or resize.
      }}
    >
      <div
        onMouseDown={handleFrameMouseDown}
        onMouseEnter={handleFrameMouseEnter}
        onMouseLeave={handleFrameMouseLeave}
        data-pizarra-surface-dragging={isDragging ? 'true' : 'false'}
        data-pizarra-surface-selected={selected ? 'true' : 'false'}
        // pizarra-motion-polish (P-MP-6): opacity-only enter animation
        // on the inner chrome frame. The positioned wrapper above stays
        // unanimated to keep the IPC-locked native VTE rect in sync.
        // The "entering" state attribute is held for DUR.enter ms and
        // then dropped by useSurfaceEnterAnimation().
        {...(enterAnim.surfaceState
          ? { [SURFACE_ENTER_STATE_ATTRIBUTE]: enterAnim.surfaceState }
          : {})}
        style={{
          position: 'absolute',
          inset: frameInset,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: PIZARRA_SURFACE_BORDER_RADIUS,
          border: frameVisual.border,
          boxShadow: frameVisual.boxShadow,
          transform: frameVisual.transform,
          background: PIZARRA_SURFACE_FRAME_BG,
          animation: enterAnim.animation,
          transition: isDragging ? 'none' : FRAME_TRANSITION,
          pointerEvents: 'auto',
        }}
      >
        <div
          data-testid="canvas-terminal-header"
          data-pizarra-surface-drag-handle="true"
          onMouseDown={handleHeaderMouseDown}
          style={{
            height: headerHeight,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            cursor: 'move',
            userSelect: 'none',
            ...PIZARRA_SURFACE_HEADER_STYLE,
          }}
        >
          <span>{resolvedShape.label || 'Terminal'}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {SHOW_RENDERER_SWITCH ? (
              <PanelRendererSelect
                panelId={terminalId}
                currentMode={requestedRendererMode}
                availableModes={['xterm-webgl', 'xterm']}
                onChange={onUpdateRendererMode}
              />
            ) : null}
            {onClose ? (
              <button
                type="button"
                data-testid="canvas-terminal-close"
                data-pizarra-close-button="true"
                title="Cerrar terminal"
                aria-label="Cerrar terminal"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.(resolvedShape.id);
                }}
                style={{
                  width: 18,
                  height: 18,
                  padding: 2,
                  background: 'transparent',
                  border: 'none',
                  color: '#9fb5d1',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                }}
              >
                <X size={12} />
              </button>
            ) : null}
          </span>
        </div>

        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
          {sharedSurfacesEnabled ? (
            <SharedTerminalSurfacePortal
              surfaceId={terminalId}
              hostId="pizarra-canvas"
              isActiveHost={pizarraOwnsLiveSurfaces}
              style={{ height: '100%', width: '100%' }}
            />
          ) : (
            <TerminalTTY
              id={terminalId}
              requestedRendererMode={requestedRendererMode}
              hideTitleBar
              onClose={onClose}
              onResize={onResize}
              onActivatePanel={onActivatePanel}
              cwd={cwd}
              initialCommand={initialCommand}
              autoFocus={autoFocus || isActivePanel}
              isVisibleInLayout={isShown}
              isActivePanel={isActivePanel}
              visibleTerminalPanelCount={visibleTerminalPanelCount}
              showQuickCopyButton={false}
              surfaceHost="pizarra"
              // pizarra-shared-view-state (Phase 1 — flicker fix):
              // suspendNativeSurface is driven by isLiveDragging, not
              // isDragging. A pure selection click leaves isLiveDragging
              // false (pointerDown is true but the threshold was never
              // crossed), so the native VTE panel stays visible — no
              // IPC round-trip, no flicker. See design §6.1.
              // En pizarra con native VTE: suspendemos solo durante el drag real de la card
              // para que el widget nativo no pelee con la transformación web del contenedor.
              // El threshold + isResizing ya evita flicker en clicks puros.
              suspendNativeSurface={suspendNative}
            />
          )}
        </div>
      </div>

      {/* pizarra-drag-fluidity-2: border drag ring — the entire perimeter of
          the surface is now a move target (cursor: move on hover). Solves the
          "es muy delicado / no puedo mover" feedback: previously only the 26px
          header initiated drags; now any border edge works. */}
      <SurfaceDragRing
        onMouseDown={handleHeaderMouseDown}
        locked={locked}
        testIdPrefix="canvas-terminal"
      />

      {/* pizarra-resize-affordance: zoom-aware resize handles.
          Hit areas (edge ~28px base, corner ~38px base, inverse-scaled with zoom)
          are kept large so the resize is easy to grab (cursor changes when the
          pointer is over them). Visuals are minimal to preserve aesthetics:
          - No permanent edge rails or "líneas".
          - No corner cuadritos / grip dots.
          Selection indication comes from the frame chrome (resolveFrameVisual
          selected border + shadow). The large hit areas + cursor provide the
          easy targeting the user liked ("puedo seleccionarla mucho mas facil").
          pizarra-drag-fluidity-2: handles are now centered on the ROOT outer
          edge (not the frame inset), so ~half the hit area sits OUTSIDE the
          surface. This reduces overlap with terminal content (was ~8px of
          blocked edge text) and lets the user reach the handle from outside
          the card. data-testids preserved. */}
      {selected &&
        (() => {
          const e = handleSizing.edge;
          const c = handleSizing.corner;
          const ins = handleSizing.inset;
          const edgeStyle = (extra) => ({
            position: 'absolute',
            pointerEvents: 'auto',
            zIndex: 5,
            ...extra,
          });
          const cornerStyle = (extra) => ({
            position: 'absolute',
            width: c,
            height: c,
            pointerEvents: 'auto',
            zIndex: 6,
            ...extra,
          });
          return (
            <>
              <div
                data-testid="canvas-terminal-resize-n"
                onMouseDown={(ev) => handleResizeStart(ev, 'n')}
                style={edgeStyle({
                  top: -e / 2,
                  left: ins,
                  right: ins,
                  height: e,
                  cursor: 'ns-resize',
                })}
              />
              <div
                data-testid="canvas-terminal-resize-s"
                onMouseDown={(ev) => handleResizeStart(ev, 's')}
                style={edgeStyle({
                  bottom: -e / 2,
                  left: ins,
                  right: ins,
                  height: e,
                  cursor: 'ns-resize',
                })}
              />
              <div
                data-testid="canvas-terminal-resize-w"
                onMouseDown={(ev) => handleResizeStart(ev, 'w')}
                style={edgeStyle({
                  left: -e / 2,
                  top: ins,
                  bottom: ins,
                  width: e,
                  cursor: 'ew-resize',
                })}
              />
              <div
                data-testid="canvas-terminal-resize-e"
                onMouseDown={(ev) => handleResizeStart(ev, 'e')}
                style={edgeStyle({
                  right: -e / 2,
                  top: ins,
                  bottom: ins,
                  width: e,
                  cursor: 'ew-resize',
                })}
              />
              <div
                data-testid="canvas-terminal-resize-nw"
                onMouseDown={(ev) => handleResizeStart(ev, 'nw')}
                style={cornerStyle({ top: -c / 2, left: -c / 2, cursor: 'nwse-resize' })}
              />
              <div
                data-testid="canvas-terminal-resize-ne"
                onMouseDown={(ev) => handleResizeStart(ev, 'ne')}
                style={cornerStyle({ top: -c / 2, right: -c / 2, cursor: 'nesw-resize' })}
              />
              <div
                data-testid="canvas-terminal-resize-sw"
                onMouseDown={(ev) => handleResizeStart(ev, 'sw')}
                style={cornerStyle({ bottom: -c / 2, left: -c / 2, cursor: 'nesw-resize' })}
              />
              <div
                data-testid="canvas-terminal-resize-se"
                onMouseDown={(ev) => handleResizeStart(ev, 'se')}
                style={cornerStyle({
                  bottom: -c / 2,
                  right: -c / 2,
                  cursor: 'nwse-resize',
                })}
              />
            </>
          );
        })()}
    </div>
  );
}
