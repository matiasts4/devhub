'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import TerminalTTY from '@/components/TerminalTTY';
import {
  openNativeVtePanel,
  raiseNativeVtePanel,
  resizeNativeVtePanel,
  setNativeVtePanelVisibility,
} from '@/lib/terminal/nativeVteBridge';
import usePizarraSurfaceDrag from './usePizarraSurfaceDrag';
import {
  ensureSurfaceMotionKeyframes,
  resolveFrameVisual,
  resolveHandleSizing,
  FRAME_TRANSITION,
  SURFACE_ENTER_ANIMATION,
  ACCENT,
} from '@/lib/pizarra/surfaceMotion';
import { resolveRendererSelection } from '@/components/terminal/terminalRendererCapabilities';
import PanelRendererSelect from '@/components/terminal/components/PanelRendererSelect';

// pizarra-shared-view-state (Phase 1 — flicker fix): the minimum
// pointer travel that separates a click from a drag. Below this
// threshold, the native VTE panel is NOT suspended on mousedown, so
// a pure selection click no longer triggers the IPC hide/show
// round-trip that causes the visible flicker.
//
// Hypotenuse of (rawDeltaX, rawDeltaY) — the browser-reported
// pre-zoom screen pixels of the pointer since drag start — is
// compared against DRAG_THRESHOLD_PX. The first move that crosses
// it promotes "pointerDown" to "isLiveDragging" and only then is
// the native VTE panel suspended. See design §6.1.
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
  // pizarra: default renderer matches the terminals page (xterm-webgl). The
  // native VTE path remains selectable per-shape via requestedRendererMode,
  // but the out-of-the-box experience on the pizarra canvas is now the same
  // xterm + WebGL renderer that TerminalWorkspacesManager exposes.
  requestedRendererMode = 'xterm-webgl',
  onUpdateRendererMode,
}) {
  // Siempre usamos la terminal nativa (VTE widget) para superficies de tipo terminal
  // dentro de la pizarra. Posicionamos el widget exactamente sobre el rect de
  // contenido de la card (inset por el header web). Fidelidad completa para TUIs,
  // sin xterm, sin "canvas externo" para el contenido.
  //
  // Layering: los raises en select/drag/reorder de la surface llaman raiseNativeVtePanel
  // (o raiseNativeBrowser para browsers). Cuando una browser card queda "arriba" en
  // el z de pizarra, su raise debe dejar su webkit por encima del VTE de la terminal.
  // Si hace falta, podemos sincronizar el orden global de todos los natives de pizarra
  // surfaces según el stacking actual de las cards.
  //
  // Resolver parity (C3 of terminal-renderer-xterm-webgl): we honor the
  // requested renderer selection. In practice pizarra only carries VTE
  // (the legacy 'vte-experimental' value), but going through the resolver
  // keeps the chrome label honest if a future shape requests xterm-webgl.
  const effectiveRendererMode = requestedRendererMode
    ? resolveRendererSelection({ requestedMode: requestedRendererMode })?.effectiveMode
    : 'vte-experimental';
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
      // Raise the native VTE so this pizarra terminal card's content is above other
      // native surfaces (e.g. browsers) when the card is top in pizarra stacking.
      if (effectiveRendererMode === 'vte-experimental') {
        raiseNativeVtePanel({ panelId: terminalId }).catch(() => {});
      }
    },
    [onActivatePanel, onSelect, terminalId, requestedRendererMode]
  );

  // pizarra-motion: inject shared enter keyframes once.
  useEffect(() => {
    ensureSurfaceMotionKeyframes();
  }, []);

  // New surfaces should appear on top of existing ones (including different native types).
  // For pizarra terminal cards we use the real native VTE widget (positioned over the
  // content rect of the card). Raise it so this terminal is above other natives when
  // its pizarra surface is top in the stacking order.
  useEffect(() => {
    if (effectiveRendererMode === 'vte-experimental') {
      raiseNativeVtePanel({ panelId: terminalId }).catch(() => {});
    }
  }, []); // run once on mount

  // Ensure native VTE is open for this pizarra terminal card (newly added in pizarra,
  // not only carried from workspace). Uses normal (non-offscreen) open so the real
  // widget is created and can be positioned/raised over the card content rect.
  const nativeOpenedRef = useRef(false);
  useEffect(() => {
    if (effectiveRendererMode !== 'vte-experimental' || !terminalId || nativeOpenedRef.current)
      return;
    const b = resolvedBounds;
    const contentW = Math.max(10, (b.width || 800) - 20);
    const contentH = Math.max(10, (b.height || 600) - 20 - 28);
    nativeOpenedRef.current = true;
    openNativeVtePanel({
      panelId: terminalId,
      cwd,
      initialCommand,
      bounds: {
        x: (b.screenX ?? b.x ?? 0) + 10,
        y: (b.screenY ?? b.y ?? 0) + 10 + 28,
        width: contentW,
        height: contentH,
      },
      // no offscreen: we want the real widget for this card (user wants to utilize native)
    }).catch(() => {
      nativeOpenedRef.current = false; // allow retry
    });
  }, [effectiveRendererMode, terminalId, resolvedBounds, cwd, initialCommand]);

  // pizarra-motion: hover state drives the idle border/shadow highlight.
  const [isHovered, setIsHovered] = useState(false);
  const handleFrameMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleFrameMouseLeave = useCallback(() => setIsHovered(false), []);

  useEffect(() => {
    // Para pizarra terminales: siempre native VTE. Posicionamos el widget exactamente
    // sobre el área de contenido de la card (inset por el header web del frame).
    if (effectiveRendererMode === 'vte-experimental' && resolvedBounds) {
      const inset = 10;
      const headerH = 28;
      resizeNativeVtePanel({
        panelId: terminalId,
        bounds: {
          x: (resolvedBounds.screenX ?? resolvedBounds.x) + inset,
          y: (resolvedBounds.screenY ?? resolvedBounds.y) + inset + headerH,
          width: Math.max(resolvedBounds.width - inset * 2, 1),
          height: Math.max(resolvedBounds.height - inset * 2 - headerH, 1),
        },
      }).catch(() => {});
    }
  }, [resolvedBounds, terminalId, effectiveRendererMode]);

  // Usamos la terminal nativa VTE widget también para las cards de terminal en pizarra.
  // No parqueamos ni usamos canvas "externo" para el contenido (el usuario pidió utilizar
  // la nativa). El widget se posiciona vía los efectos de resize/raise/visibility abajo,
  // que cubren el área de contenido de la card (debajo del header web).
  // El chrome (header, bordes, handles) sigue siendo web para integrarse con el resto
  // de la pizarra. El contenido real de la TUI viene del VTE nativo (fidelidad completa).
  //
  // Si al arrastrar un browser surface "por encima" de una terminal card sigue habiendo
  // superposición visual, el fix es mejorar el orden de raises o agregar un sync global
  // de z de pizarra → orden de widgets nativos en el overlay.

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
  const [isResizing, setIsResizing] = useState(false);
  const hasMovedRef = useRef(false);
  // pizarra-resize-fluidity: ref for direct style mutation on the container root
  // during resize (unifies with browser + drag pattern).
  const surfaceRootRef = useRef(null);

  // Derived value for VISUAL state only (frame border, cursor, drag
  // transform). NEVER drives suspendNativeSurface — that is the whole
  // point of the flicker fix.
  const isDragging = pointerDown || isLiveDragging;

  // pizarra-shared-view-state (Phase 1 — flicker fix): synchronous
  // reattach. When isLiveDragging flips back to false, the next
  // resolvedBounds effect run calls setNativeVtePanelVisibility with
  // visible:true in the SAME effect tick (no setTimeout, no RAF). This
  // closes the one-frame gap between wrapper repaint and native panel
  // repaint that caused the post-drag flicker. See design §6.2.
  const wasLiveDraggingRef = useRef(false);
  useEffect(() => {
    if (
      wasLiveDraggingRef.current &&
      !isLiveDragging &&
      effectiveRendererMode === 'vte-experimental'
    ) {
      // Just exited a real drag. Reattach the native panel right now,
      // synchronously. The effect runs in the same React commit tick
      // that processed the state flip.
      setNativeVtePanelVisibility({
        panelId: terminalId,
        visible: true,
        reason: 'reattach-after-drag',
      }).catch(() => {});
    }
    wasLiveDraggingRef.current = isLiveDragging;
  }, [isLiveDragging, terminalId]);

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
      let lastBounds = startBounds;
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
        lastBounds = next;

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

        // pizarra-resize-live-native: during the resize gesture, directly tell the native VTE the exact content area rect
        // (full surface screen size minus chrome insets/header) using the current mutated position.
        // This keeps the terminal content area perfectly matched to the header chrome at all times, even mid-drag.
        // Prevents the prompt/path text from "leaking" or duplicating into the header area after repeated resizes,
        // wrong section colors (bg leaking), or cut-off text. The React effect will reconcile on commit.
        if (effectiveRendererMode === 'vte-experimental' && terminalId) {
          const inset = 10;
          const headerH = 28;
          const contentW = Math.max(1, screenW - inset * 2);
          const contentH = Math.max(1, screenH - inset * 2 - headerH);
          // use the just-mutated liveWrapper position if available, else fall back to current resolved
          const surfScreenX = liveWrapper
            ? parseFloat(liveWrapper.style.left) || 0
            : (resolvedBounds.screenX ?? resolvedBounds.x ?? 0);
          const surfScreenY = liveWrapper
            ? parseFloat(liveWrapper.style.top) || 0
            : (resolvedBounds.screenY ?? resolvedBounds.y ?? 0);
          resizeNativeVtePanel({
            panelId: terminalId,
            bounds: {
              x: surfScreenX + inset,
              y: surfScreenY + inset + headerH,
              width: contentW,
              height: contentH,
            },
          }).catch(() => {});
        }
      };

      const handleMouseUp = () => {
        // Clear both refs and the isLiveDragging state. The
        // synchronous reattach effect above will pick up the
        // isLiveDragging flip and call setNativeVtePanelVisibility
        // with visible:true in the same tick.
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
    // pizarra-shared-view-state (Phase 1 — flicker fix): the hook
    // exposes onDragStart / onDragMove / onDragEnd so the consumer
    // (CanvasTerminal) can run the 3px threshold gate before flipping
    // suspendNativeSurface. The legacy isDragging boolean is kept as a
    // derived value (`pointerDown || isLiveDragging`) for visual
    // state only and does NOT drive suspendNativeSurface.
    onDragStart: () => {
      hasMovedRef.current = false;
      setPointerDown(true);
      // Ensure raised at drag start (select may have done it, but for
      // direct header drags we guarantee the native is topmost so its
      // content wins over other natives while moving).
      if (effectiveRendererMode === 'vte-experimental') {
        raiseNativeVtePanel({ panelId: terminalId }).catch(() => {});
      }
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
      // Clear both. The synchronous reattach effect above will pick
      // up the isLiveDragging flip and call setNativeVtePanelVisibility
      // with visible:true in the same React commit tick.
      setPointerDown(false);
      setIsLiveDragging(false);
      // Re-raise on drop so the final position respects the surface being topmost.
      if (effectiveRendererMode === 'vte-experimental') {
        raiseNativeVtePanel({ panelId: terminalId }).catch(() => {});
      }
      onDragEnd?.(args);
    },
    moveMeta: { terminalId },
    // pizarra-motion: NO per-tick native IPC during drag. The native VTE
    // surface is suspended while a real drag is in progress
    // (suspendNativeSurface={isLiveDragging}, NOT pointerDown), so a
    // selection click never triggers the IPC hide/show round-trip. The
    // surface is repositioned exactly ONCE on drop, by the
    // resolvedBounds effect above, after the new x/y are committed to
    // the reducer. The synchronous reattach effect restores
    // visibility on the same tick the drag ends.
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

  const frameVisual = resolveFrameVisual({ selected, hovered: isHovered, dragging: isDragging });
  const handleSizing = resolveHandleSizing(zoom);

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
        style={{
          position: 'absolute',
          inset: 10,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 18,
          border: frameVisual.border,
          boxShadow: frameVisual.boxShadow,
          transform: frameVisual.transform,
          // Kill transitions on the chrome frame (header bar + body container) while
          // actively manipulating (drag or resize). Removes the visual delay/lag
          // between the header and the resizable content (VTE body follows the
          // container size change instantly via our direct mutations + onResize).
          transition: isDragging ? 'none' : FRAME_TRANSITION,
          pointerEvents: 'auto',
        }}
      >
        <div
          data-testid="canvas-terminal-header"
          data-pizarra-surface-drag-handle="true"
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <PanelRendererSelect
              panelId={terminalId}
              currentMode={requestedRendererMode}
              availableModes={['xterm-webgl', 'vte-experimental']}
              onChange={onUpdateRendererMode}
            />
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
          </span>
        </div>

        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
          <TerminalTTY
            id={terminalId}
            requestedRendererMode={effectiveRendererMode}
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
            // pizarra-shared-view-state (Phase 1 — flicker fix):
            // suspendNativeSurface is driven by isLiveDragging, not
            // isDragging. A pure selection click leaves isLiveDragging
            // false (pointerDown is true but the threshold was never
            // crossed), so the native VTE panel stays visible — no
            // IPC round-trip, no flicker. See design §6.1.
            // En pizarra con native VTE: suspendemos solo durante el drag real de la card
            // para que el widget nativo no pelee con la transformación web del contenedor.
            // El threshold + isResizing ya evita flicker en clicks puros.
            suspendNativeSurface={isLiveDragging}
          />
        </div>
      </div>

      {/* pizarra-resize-affordance: zoom-aware resize handles.
          Hit areas (edge ~28px base, corner ~38px base, inverse-scaled with zoom)
          are kept large so the resize is easy to grab (cursor changes when the
          pointer is over them). Visuals are minimal to preserve aesthetics:
          - No permanent edge rails or "líneas".
          - No corner cuadritos / grip dots.
          Selection indication comes from the frame chrome (resolveFrameVisual
          selected border + shadow). The large hit areas + cursor provide the
          easy targeting the user liked ("puedo seleccionarla mucho mas facil").
          data-testids preserved. */}
      {selected &&
        (() => {
          const e = handleSizing.edge;
          const c = handleSizing.corner;
          const ins = handleSizing.inset;
          const FI = 10;
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
                  top: FI - e / 2,
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
                  bottom: FI - e / 2,
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
                  left: FI - e / 2,
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
                  right: FI - e / 2,
                  top: ins,
                  bottom: ins,
                  width: e,
                  cursor: 'ew-resize',
                })}
              />
              <div
                data-testid="canvas-terminal-resize-nw"
                onMouseDown={(ev) => handleResizeStart(ev, 'nw')}
                style={cornerStyle({ top: FI - c / 2, left: FI - c / 2, cursor: 'nwse-resize' })}
              />
              <div
                data-testid="canvas-terminal-resize-ne"
                onMouseDown={(ev) => handleResizeStart(ev, 'ne')}
                style={cornerStyle({ top: FI - c / 2, right: FI - c / 2, cursor: 'nesw-resize' })}
              />
              <div
                data-testid="canvas-terminal-resize-sw"
                onMouseDown={(ev) => handleResizeStart(ev, 'sw')}
                style={cornerStyle({ bottom: FI - c / 2, left: FI - c / 2, cursor: 'nesw-resize' })}
              />
              <div
                data-testid="canvas-terminal-resize-se"
                onMouseDown={(ev) => handleResizeStart(ev, 'se')}
                style={cornerStyle({
                  bottom: FI - c / 2,
                  right: FI - c / 2,
                  cursor: 'nwse-resize',
                })}
              />
            </>
          );
        })()}
    </div>
  );
}
