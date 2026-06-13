/**
 * PizarraCanvas — react-konva canvas component.
 *
 * SSR-safe: this component is imported via next/dynamic({ ssr: false })
 * from PizarraPane. react-konva is loaded lazily inside useEffect to
 * avoid React initialization order issues with Turbopack.
 *
 * IMPORTANT: All hooks declared before the early return to maintain
 * consistent hook order regardless of konva loading state.
 *
 * pizarra-ux-overhaul (task 3.1):
 * - The Konva line/dot grid (formerly lines 294-319) is REMOVED. The
 *   canvas wrapper renders a solid #1a1f2e background instead.
 * - An opt-in radial-gradient texture is gated by
 *   NEXT_PUBLIC_PIZARRA_GRID_TEXTURE, read once at module scope.
 * - The wrapper carries data-testid="pizarra-canvas-wrapper" so
 *   integration tests can observe the bg and the (optional) texture.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import { SHAPE_RENDERERS } from '@/lib/pizarra/shapeRenderers';
import { useCanvasViewport, zoomAtPoint } from '@/lib/pizarra/canvasViewport';
import { createShape, SHAPE_TYPES } from '@/lib/pizarra/shapeModel';
import { shouldCanvasConsumeWheel } from '@/lib/pizarra/pizarraWheel';
import ShapePreviewOverlay from './ShapePreviewOverlay';

// pizarra-ux-overhaul: module-scope env read for the texture.
// Default ON (subtle dots) so the pizarra never looks like a pure "submarino"
// flat dark void when empty. Set NEXT_PUBLIC_PIZARRA_GRID_TEXTURE=0 to disable.
const PIZARRA_GRID_TEXTURE_ENABLED =
  typeof process !== 'undefined' &&
  process.env &&
  process.env.NEXT_PUBLIC_PIZARRA_GRID_TEXTURE !== '0';

// pizarra-multi-select: AABB overlap test used by the marquee to decide
// which shapes fall inside the selection rectangle.
function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export default function PizarraCanvas({
  elements,
  selectedElementIds,
  activeTool,
  toolSettings,
  onShapeCreate,
  onSelect,
  onDeselect,
  onMarqueeSelect,
  onUpdateElement,
  width = 800,
  height = 600,
}) {
  // ── Refs ────────────────────────────────────────────────────────────────
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  // pizarra-wheel-passive-fix: wrapper ref for the non-passive native
  // wheel listener. Both the loading-state wrapper and the loaded-state
  // wrapper carry this ref; the useEffect below attaches the listener
  // to whichever element the ref points to after each render.
  const wrapperRef = useRef(null);

  // ── State ───────────────────────────────────────────────────────────────
  const [konva, setKonva] = useState(null);
  const [konvaLoadError, setKonvaLoadError] = useState(null);
  const [drawing, setDrawing] = useState(null);
  // pizarra-motion-polish (P-MP-7): in-flight shape geometry during
  // a drag. `previewShape` is the geometry-only projection of
  // `drawing` (start + current pointer) and is recomputed on every
  // mousemove. The persisted `elements` list is NOT touched until
  // mouseup (where onShapeCreate fires). The render path reads
  // `previewShape` to show a live outline as the user drags.
  const [previewShape, setPreviewShape] = useState(null);
  // pizarra-multi-select: marquee rectangle drawn while area-selecting on
  // empty canvas. null when inactive. `moved` flips true once the drag
  // exceeds a small threshold so a plain click still deselects.
  const [marquee, setMarquee] = useState(null);
  const [isPanDragging, setIsPanDragging] = useState(false);
  const panDragRef = useRef(null);
  const { zoom, setZoom, pan, setPan } = useCanvasViewport();

  // ── Effects ─────────────────────────────────────────────────────────────
  // Lazily load react-konva on the client only
  useEffect(() => {
    let cancelled = false;
    import('react-konva')
      .then((mod) => {
        if (cancelled) return;

        const resolvedKonva = {
          Stage: mod.Stage,
          Layer: mod.Layer,
          Rect: mod.Rect,
          Circle: mod.Circle,
          Line: mod.Line,
          Arrow: mod.Arrow,
          Text: mod.Text,
          Transformer: mod.Transformer,
        };
        const missingExports = Object.entries(resolvedKonva)
          .filter(([, value]) => !value)
          .map(([key]) => key);

        if (missingExports.length > 0) {
          const error = new Error(
            `[PizarraCanvas] Invalid react-konva module, missing exports: ${missingExports.join(', ')}`
          );
          console.error(error.message);
          setKonva(null);
          setKonvaLoadError(error);
          return;
        }

        setKonva(resolvedKonva);
        setKonvaLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[PizarraCanvas] Failed to load react-konva:', err);
        setKonva(null);
        setKonvaLoadError(err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Attach transformer to selected nodes
  // pizarra-drag-resize-polish: composite elements (TERMINAL, BROWSER)
  // render their content via React (PizarraLiveSurfaceLayer), not as
  // Konva primitives. The Konva Transformer cannot draw its dashed
  // border + anchor handles around a React subtree, so we exclude those
  // types and let the composite element expose its own border-based
  // resize handles (see CanvasTerminal.jsx + PizarraBrowserSurface.jsx).
  useEffect(() => {
    if (!konva || !transformerRef.current || !stageRef.current) return;
    const stage = stageRef.current;
    const COMPOSITE_TYPES = new Set([SHAPE_TYPES.TERMINAL, SHAPE_TYPES.BROWSER]);
    const selectedNodes = selectedElementIds
      .map((id) => {
        const el = elements.find((e) => e.id === id);
        if (el && COMPOSITE_TYPES.has(el.type)) return null;
        return stage.findOne(`#${id}`);
      })
      .filter(Boolean);
    transformerRef.current.nodes(selectedNodes);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedElementIds, konva, elements]);

  // pizarra-wheel-passive-fix + pizarra-motion-polish (P-MP-4):
  // attach a native non-passive wheel event listener on the wrapper
  // ref. The handler routes through `shouldCanvasConsumeWheel`:
  //   - false → return early, allow inner surface (terminal/browser) to scroll.
  //   - true  → call `zoomAtPoint` with focal coords (clientX/Y minus
  //             wrapper rect), then `setZoom` + `setPan` with the result.
  //             `preventDefault()` blocks the browser-level page zoom.
  // The two wheel handlers in the repo (here + canvasViewport provider)
  // both consult the same selector helper so the routing can't drift.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleWheel = (event) => {
      if (!shouldCanvasConsumeWheel(event)) return; // inner surface scrolls
      event.preventDefault();
      // pizarra-fluidity: stop the event here so the CanvasViewportProvider's
      // container-level wheel listener (an ancestor) does NOT also handle the
      // same wheel — that double-handling doubled the zoom/pan speed.
      event.stopPropagation();

      const dx = event.deltaX || 0;
      const dy = event.deltaY || 0;

      // pizarra-fluidity: a wheel/trackpad gesture without a zoom modifier is a
      // PAN (two-finger drag → navigate the board), matching modern canvas apps
      // (Figma/Miro). Pinch-zoom and ctrl/⌘+wheel still ZOOM toward the cursor.
      if (event.ctrlKey || event.metaKey) {
        const rect = wrapper.getBoundingClientRect();
        const next = zoomAtPoint({
          currentZoom: zoom,
          currentPan: pan,
          deltaY: dy,
          focalX: event.clientX - rect.left,
          focalY: event.clientY - rect.top,
        });
        setZoom(next.zoom);
        setPan(next.pan);
        return;
      }

      setPan((current) => ({ x: (current?.x ?? 0) - dx, y: (current?.y ?? 0) - dy }));
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      wrapper.removeEventListener('wheel', handleWheel);
    };
  }, [setZoom, setPan, zoom, pan, konva]);

  const bind = useGesture(
    {
      onDrag: ({ delta: [dx, dy], buttons }) => {
        if (buttons === 1) {
          setPan((currentPan) => ({ x: currentPan.x + dx, y: currentPan.y + dy }));
        }
      },
    },
    { drag: { eventOptions: { passive: false } } }
  );

  // ── Handlers (useCallback — declared before early return) ───────────────

  const handleMouseDown = useCallback(
    (e) => {
      const clickedOnEmpty = e.target === e.target.getStage();
      if (!clickedOnEmpty) return;

      if (activeTool === 'select') {
        // Shift+drag draws a marquee; plain drag on empty canvas pans the board.
        if (e.evt?.shiftKey) {
          const pos = e.target.getStage().getPointerPosition();
          setMarquee({
            startX: pos.x,
            startY: pos.y,
            x: pos.x,
            y: pos.y,
            width: 0,
            height: 0,
            shift: true,
            moved: false,
          });
          return;
        }
        const pos = e.target.getStage().getPointerPosition();
        panDragRef.current = {
          startX: pos.x,
          startY: pos.y,
          originPanX: pan.x,
          originPanY: pan.y,
          moved: false,
        };
        return;
      }

      const toolToShapeType = {
        rect: SHAPE_TYPES.RECT,
        circle: SHAPE_TYPES.CIRCLE,
        line: SHAPE_TYPES.LINE,
        arrow: SHAPE_TYPES.ARROW,
        text: SHAPE_TYPES.TEXTBOX,
      };
      const shapeType = toolToShapeType[activeTool];
      if (!shapeType) return;

      const pos = e.target.getStage().getPointerPosition();
      setDrawing({ startX: pos.x, startY: pos.y, type: shapeType });
      onDeselect();
    },
    [activeTool, onDeselect, pan.x, pan.y]
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (panDragRef.current) {
        const pos = e.target.getStage().getPointerPosition();
        const dx = pos.x - panDragRef.current.startX;
        const dy = pos.y - panDragRef.current.startY;
        if (
          !panDragRef.current.moved &&
          (Math.abs(dx) > 3 || Math.abs(dy) > 3)
        ) {
          panDragRef.current.moved = true;
          setIsPanDragging(true);
        }
        if (panDragRef.current.moved) {
          setPan({
            x: panDragRef.current.originPanX + dx,
            y: panDragRef.current.originPanY + dy,
          });
        }
        return;
      }

      if (marquee) {
        const pos = e.target.getStage().getPointerPosition();
        const x = Math.min(marquee.startX, pos.x);
        const y = Math.min(marquee.startY, pos.y);
        const mWidth = Math.abs(pos.x - marquee.startX);
        const mHeight = Math.abs(pos.y - marquee.startY);
        const moved = marquee.moved || mWidth > 3 || mHeight > 3;
        setMarquee({ ...marquee, x, y, width: mWidth, height: mHeight, moved });
        return;
      }
      // pizarra-motion-polish (P-MP-7): live preview during a shape
      // drag. The pre-fix handler early-returned on `!drawing` so
      // the user saw nothing until mouseup. We now project the
      // start + current pointer into the in-flight geometry and
      // stash it in `previewShape`. The render path reads that
      // state to draw a live outline. `onShapeCreate` is still
      // mouseup-only — the persisted `elements` list is not
      // touched on mousemove.
      if (!drawing) return;
      const pos = e.target.getStage().getPointerPosition();
      const { startX, startY, type } = drawing;
      const dxRaw = pos.x - startX;
      const dyRaw = pos.y - startY;
      const absDx = Math.abs(dxRaw);
      const absDy = Math.abs(dyRaw);
      // The preview carries the same geometry the final shape will
      // have on mouseup, computed identically. This keeps the
      // outline and the eventual shape pixel-aligned (no "snap"
      // on release).
      let preview;
      if (type === SHAPE_TYPES.CIRCLE) {
        const radius = Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw) / 2;
        preview = {
          type,
          x: (startX + pos.x) / 2,
          y: (startY + pos.y) / 2,
          radius,
        };
      } else if (type === SHAPE_TYPES.LINE || type === SHAPE_TYPES.ARROW) {
        preview = {
          type,
          x: Math.min(startX, pos.x),
          y: Math.min(startY, pos.y),
          points: [
            Math.max(0, startX - Math.min(startX, pos.x)),
            Math.max(0, startY - Math.min(startY, pos.y)),
            Math.abs(dxRaw),
            Math.abs(dyRaw),
          ],
        };
      } else {
        // rect, textbox, etc. — same as the rect fallback.
        preview = {
          type,
          x: Math.min(startX, pos.x),
          y: Math.min(startY, pos.y),
          width: absDx,
          height: absDy,
        };
      }
      setPreviewShape(preview);
    },
    [marquee, drawing, setPan, onDeselect]
  );

  const handleMouseUp = useCallback(
    (e) => {
      if (panDragRef.current) {
        const wasPan = panDragRef.current.moved;
        panDragRef.current = null;
        setIsPanDragging(false);
        if (!wasPan) {
          onDeselect();
        }
        return;
      }

      if (marquee) {
        if (marquee.moved) {
          const rect = {
            x: marquee.x,
            y: marquee.y,
            width: marquee.width,
            height: marquee.height,
          };
          const ids = elements
            .filter((shape) => {
              const sw = shape.width ?? (shape.radius ? shape.radius * 2 : 0);
              const sh = shape.height ?? (shape.radius ? shape.radius * 2 : 0);
              return rectsIntersect(rect, {
                x: shape.x,
                y: shape.y,
                width: sw,
                height: sh,
              });
            })
            .map((shape) => shape.id);
          onMarqueeSelect?.(ids, marquee.shift);
        } else if (!marquee.shift) {
          onDeselect();
        }
        setMarquee(null);
        return;
      }

      if (!drawing) return;

      const pos = e.target.getStage().getPointerPosition();
      const { startX, startY, type } = drawing;

      let shape;
      if (type === SHAPE_TYPES.LINE || type === SHAPE_TYPES.ARROW) {
        shape = createShape(type, {
          x: Math.min(startX, pos.x),
          y: Math.min(startY, pos.y),
          points: [
            Math.max(0, startX - Math.min(startX, pos.x)),
            Math.max(0, startY - Math.min(startY, pos.y)),
            Math.abs(pos.x - startX),
            Math.abs(pos.y - startY),
          ],
          ...toolSettings,
        });
      } else if (type === SHAPE_TYPES.TEXTBOX) {
        shape = createShape(type, {
          x: pos.x,
          y: pos.y,
          text: 'Text',
          fill: '#f0ece4',
          stroke: 'transparent',
          strokeWidth: 0,
          ...toolSettings,
        });
      } else if (type === SHAPE_TYPES.CIRCLE) {
        // pizarra-motion-polish (P-MP-7): circles are stored with
        // x/y at the bounding-box MIDPOINT and radius = half the
        // diagonal. The renderer (and every consumer) treats x/y
        // as the circle's center, so this matches the spec for
        // rects/lines/arrows (which also use x/y as the corner
        // OR the center depending on shape type — for circle the
        // convention is center).
        //
        // Pre-fix the math was:
        //   x: startX, y: startY, radius: Math.min(dx, dy) / 2
        // which made circles render at the bounding-box corner
        // with half the shorter axis (visually broken and offset
        // from the drag).
        const dx = pos.x - startX;
        const dy = pos.y - startY;
        const cx = (startX + pos.x) / 2;
        const cy = (startY + pos.y) / 2;
        const radius = Math.sqrt(dx * dx + dy * dy) / 2;
        shape = createShape(type, {
          x: cx,
          y: cy,
          radius,
          ...toolSettings,
        });
      } else {
        shape = createShape(type, {
          x: Math.min(startX, pos.x),
          y: Math.min(startY, pos.y),
          width: Math.abs(pos.x - startX),
          height: Math.abs(pos.y - startY),
          ...toolSettings,
        });
      }

      onShapeCreate(shape);
      setDrawing(null);
      // pizarra-motion-polish (P-MP-7): clear the live preview at
      // the same commit point as drawing. The preview is geometry-
      // only; the persisted shape was just committed via
      // onShapeCreate.
      setPreviewShape(null);
    },
    [marquee, elements, onMarqueeSelect, onDeselect, drawing, toolSettings, onShapeCreate]
  );

  const handleShapeSelect = useCallback(
    (e, id) => {
      e.cancelBubble = true;
      onSelect(id);
    },
    [onSelect]
  );

  const handleTransformEnd = useCallback(
    (node) => {
      const id = node.id();
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);

      const shape = elements.find((el) => el.id === id);
      if (!shape) return;

      if (shape.type === SHAPE_TYPES.RECT) {
        onUpdateElement(id, {
          x: node.x(),
          y: node.y(),
          width: Math.max(5, node.width() * scaleX),
          height: Math.max(5, node.height() * scaleY),
          rotation: node.rotation(),
        });
      } else if (shape.type === SHAPE_TYPES.CIRCLE) {
        onUpdateElement(id, {
          x: node.x(),
          y: node.y(),
          radius: shape.radius * Math.max(scaleX, scaleY),
          rotation: node.rotation(),
        });
      } else if (shape.type === SHAPE_TYPES.LINE || shape.type === SHAPE_TYPES.ARROW) {
        onUpdateElement(id, {
          x: node.x(),
          y: node.y(),
          points: node.points(),
          rotation: node.rotation(),
        });
      } else {
        onUpdateElement(id, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
        });
      }
    },
    [elements, onUpdateElement]
  );

  // ── Render ─────────────────────────────────────────────────────────────

  // pizarra-ux-overhaul: solid background + texture (default on).
  // The old Konva grid lines are gone. A very subtle CSS radial dot pattern
  // is applied (unless explicitly disabled via env=0) so even an empty pizarra
  // doesn't look like pure flat "submarino" darkness. Low opacity so it doesn't
  // fight content.
  const wrapperBackgroundImage = PIZARRA_GRID_TEXTURE_ENABLED
    ? 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)'
    : 'none';

  // ── Early return: loading state ─────────────────────────────────────────
  // All hooks MUST be declared before this point to maintain consistent
  // hook order between loading and loaded states.
  //
  // pizarra-ux-overhaul: per board-canvas Req 2, the LOADING CANVAS
  // placeholder must ONLY render when konvaLoadError is true. On a
  // healthy mount (konva is null but konvaLoadError is false), the
  // user sees the wrapper with the solid background and NO placeholder
  // text, so the surrounding container geometry is stable.
  if (konvaLoadError) {
    return (
      <div
        data-testid="pizarra-canvas-wrapper"
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          backgroundColor: '#1a1f2e',
          backgroundImage: wrapperBackgroundImage,
          backgroundSize: PIZARRA_GRID_TEXTURE_ENABLED ? '32px 32px' : undefined,
          flexDirection: 'column',
          gap: 8,
        }}
      >
        CANVAS UNAVAILABLE
        <div
          style={{
            color: '#64748b',
            fontSize: 10,
            letterSpacing: '0.04em',
          }}
        >
          react-konva failed to initialize.
        </div>
      </div>
    );
  }

  // pizarra-ux-overhaul: pre-load empty wrapper. No placeholder text,
  // just the background + (optional) texture so the canvas container
  // has a stable geometry while react-konva is still resolving.
  // pizarra-wheel-passive-fix: ref={wrapperRef} wires the non-passive
  // native wheel listener attached by the useEffect above.
  if (!konva) {
    return (
      <div
        ref={wrapperRef}
        data-testid="pizarra-canvas-wrapper"
        style={{
          width,
          height,
          overflow: 'hidden',
          backgroundColor: '#1a1f2e',
          backgroundImage: wrapperBackgroundImage,
          backgroundSize: PIZARRA_GRID_TEXTURE_ENABLED ? '32px 32px' : undefined,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          touchAction: 'none',
        }}
      />
    );
  }

  const { Stage, Layer, Rect, Line, Transformer } = konva;

  const stageCursor =
    activeTool === 'select' ? (isPanDragging ? 'grabbing' : 'grab') : 'crosshair';

  return (
    <div
      {...bind()}
      ref={wrapperRef}
      data-testid="pizarra-canvas-wrapper"
      style={{
        width,
        height,
        overflow: 'hidden',
        backgroundColor: '#1a1f2e',
        backgroundImage: wrapperBackgroundImage,
        backgroundSize: PIZARRA_GRID_TEXTURE_ENABLED ? '32px 32px' : undefined,
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
        touchAction: 'none',
      }}
    >
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          background: 'transparent',
          cursor: stageCursor,
        }}
      >
        {/* Shapes layer */}
        <Layer>
          {elements.map((shape) => {
            const Renderer = SHAPE_RENDERERS[shape.type];
            if (!Renderer) return null;
            return (
              <Renderer
                key={shape.id}
                shape={shape}
                konva={konva}
                isSelected={selectedElementIds.includes(shape.id)}
                onSelect={handleShapeSelect}
                onTransformEnd={(e) => handleTransformEnd(e.target)}
              />
            );
          })}

          {/* Transformer for selected shapes */}
          <Transformer
            ref={transformerRef}
            anchorSize={8}
            anchorCornerRadius={4}
            anchorFill="#3b82f6"
            anchorStroke="#1d4ed8"
            borderStroke="#3b82f6"
            borderDash={[4, 4]}
            rotateAnchorOffset={20}
            padding={4}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) return oldBox;
              return newBox;
            }}
          />

          {/* pizarra-multi-select: marquee selection rectangle */}
          {marquee && marquee.moved && (
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.width}
              height={marquee.height}
              fill="rgba(59,130,246,0.12)"
              stroke="#3b82f6"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
            />
          )}

          {/* pizarra-motion-polish (P-MP-7): live shape preview during
              a drag. Renders the in-flight geometry as a dashed
              outline so the user sees what they are about to commit
              before mouseup. Persisted elements list is NOT touched
              here — onShapeCreate is mouseup-only. The preview is
              cleared in handleMouseUp at the same commit point. */}
          {previewShape && <ShapePreviewOverlay konva={konva} preview={previewShape} />}
        </Layer>
      </Stage>
    </div>
  );
}
