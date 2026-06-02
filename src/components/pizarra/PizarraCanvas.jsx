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
import { useCanvasViewport } from '@/lib/pizarra/canvasViewport';
import { createShape, SHAPE_TYPES } from '@/lib/pizarra/shapeModel';

// pizarra-ux-overhaul: module-scope env read for the opt-in texture.
// Read once at import time; subsequent mounts reuse the cached value.
const PIZARRA_GRID_TEXTURE_ENABLED =
  typeof process !== 'undefined' &&
  process.env &&
  process.env.NEXT_PUBLIC_PIZARRA_GRID_TEXTURE === '1';

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
  // pizarra-multi-select: marquee rectangle drawn while area-selecting on
  // empty canvas. null when inactive. `moved` flips true once the drag
  // exceeds a small threshold so a plain click still deselects.
  const [marquee, setMarquee] = useState(null);
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

  // pizarra-wheel-passive-fix: attach a native non-passive wheel event
  // listener on the wrapper ref. This prevents default browser-wide
  // page zoom and executes the custom canvas zoom calculation instead.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleWheel = (event) => {
      event.preventDefault();
      setZoom((currentZoom) => Math.min(Math.max(currentZoom - event.deltaY * 0.001, 0.1), 5));
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      wrapper.removeEventListener('wheel', handleWheel);
    };
  }, [setZoom, konva]);

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
        // pizarra-multi-select: begin a marquee instead of deselecting
        // immediately. Deselect happens on mouseup only if no drag occurred.
        const pos = e.target.getStage().getPointerPosition();
        setMarquee({
          startX: pos.x,
          startY: pos.y,
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
          shift: e.evt?.shiftKey || false,
          moved: false,
        });
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
    [activeTool, onDeselect]
  );

  const handleMouseMove = useCallback(
    (e) => {
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
      if (!drawing) return;
    },
    [marquee, drawing]
  );

  const handleMouseUp = useCallback(
    (e) => {
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
        const dx = Math.abs(pos.x - startX);
        const dy = Math.abs(pos.y - startY);
        shape = createShape(type, {
          x: startX,
          y: startY,
          radius: Math.min(dx, dy) / 2,
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

  // pizarra-ux-overhaul: solid background + opt-in texture. The grid
  // is gone. When the env flag is enabled, a CSS radial-gradient is
  // applied at low opacity so the canvas still has a hint of texture
  // for users who miss the visual rhythm.
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
        style={{
          background: 'transparent',
          cursor: activeTool === 'select' ? 'default' : 'crosshair',
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
        </Layer>
      </Stage>
    </div>
  );
}
