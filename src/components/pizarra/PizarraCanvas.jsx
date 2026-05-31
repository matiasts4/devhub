/**
 * PizarraCanvas — react-konva canvas component.
 *
 * SSR-safe: this component is imported via next/dynamic({ ssr: false })
 * from PizarraPane. react-konva is loaded lazily inside useEffect to
 * avoid React initialization order issues with Turbopack.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import { SHAPE_RENDERERS } from '@/lib/pizarra/shapeRenderers';
import { createShape, SHAPE_TYPES } from '@/lib/pizarra/shapeModel';

export default function PizarraCanvas({
  elements,
  selectedElementIds,
  activeTool,
  toolSettings,
  onShapeCreate,
  onSelect,
  onDeselect,
  onUpdateElement,
  width = 800,
  height = 600,
}) {
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const [konva, setKonva] = useState(null);
  const [drawing, setDrawing] = useState(null);

  // Lazily load react-konva on the client only
  useEffect(() => {
    import('react-konva').then((mod) => {
      setKonva({
        Stage: mod.Stage,
        Layer: mod.Layer,
        Rect: mod.Rect,
        Line: mod.Line,
        Transformer: mod.Transformer,
      });
    });
  }, []);

  // ── Viewport state (pan/zoom via @use-gesture) ───────────────────────────
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  const bind = useGesture(
    {
      onWheel: ({ deltaY, event }) => {
        event.preventDefault();
        setViewport((v) => ({
          ...v,
          zoom: Math.min(Math.max(v.zoom - deltaY * 0.001, 0.1), 5),
        }));
      },
      onDrag: ({ delta: [dx, dy], buttons }) => {
        if (buttons === 1) {
          setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }
      },
    },
    { wheel: { eventOptions: { passive: false } } }
  );

  // Attach transformer to selected nodes
  useEffect(() => {
    if (!konva || !transformerRef.current || !stageRef.current) return;
    const stage = stageRef.current;
    const selectedNodes = selectedElementIds
      .map((id) => stage.findOne(`#${id}`))
      .filter(Boolean);
    transformerRef.current.nodes(selectedNodes);
    transformerRef.current.getLayer().batchDraw();
  }, [selectedElementIds, konva]);

  // ── Render loading state while konva loads ───────────────────────────────
  if (!konva) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
        }}
      >
        Loading canvas...
      </div>
    );
  }

  const { Stage, Layer, Rect, Line, Transformer } = konva;

  // ── Background dot grid ───────────────────────────────────────────────

  const gridLines = [];
  const gridSize = 32;
  const cols = Math.ceil(width / gridSize) + 1;
  const rows = Math.ceil(height / gridSize) + 1;
  for (let i = 0; i < cols; i++) {
    gridLines.push(
      <Line
        key={`v${i}`}
        points={[i * gridSize, 0, i * gridSize, rows * gridSize]}
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={1}
        listening={false}
      />
    );
  }
  for (let j = 0; j < rows; j++) {
    gridLines.push(
      <Line
        key={`h${j}`}
        points={[0, j * gridSize, cols * gridSize, j * gridSize]}
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={1}
        listening={false}
      />
    );
  }

  // ── Shape creation handlers ────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e) => {
      const clickedOnEmpty = e.target === e.target.getStage();
      if (!clickedOnEmpty) return;

      if (activeTool === 'select') {
        onDeselect();
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

  const handleMouseMove = useCallback((e) => {
    if (!drawing) return;
  }, [drawing]);

  const handleMouseUp = useCallback(
    (e) => {
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
    [drawing, toolSettings, onShapeCreate]
  );

  // ── Shape select handler ─────────────────────────────────────────────────

  const handleShapeSelect = useCallback(
    (e, id) => {
      e.cancelBubble = true;
      onSelect(id);
    },
    [onSelect]
  );

  // ── Transform end handler ───────────────────────────────────────────────

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

  return (
    <div
      {...bind()}
      style={{
        width,
        height,
        overflow: 'hidden',
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
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
        style={{ background: 'transparent', cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
      >
        {/* Background grid layer */}
        <Layer listening={false}>
          <Rect width={width} height={height} fill="transparent" />
          {gridLines}
        </Layer>

        {/* Shapes layer */}
        <Layer>
          {elements.map((shape) => {
            const Renderer = SHAPE_RENDERERS[shape.type];
            if (!Renderer) return null;
            return (
              <Renderer
                key={shape.id}
                shape={shape}
                isSelected={selectedElementIds.includes(shape.id)}
                onSelect={handleShapeSelect}
                transformerRef={
                  selectedElementIds.includes(shape.id) ? transformerRef : null
                }
                onTransformEnd={(e) => handleTransformEnd(e.target)}
              />
            );
          })}

          {/* Transformer for selected shapes */}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) return oldBox;
              return newBox;
            }}
          />
        </Layer>
      </Stage>
    </div>
  );
}