/**
 * Shape Renderers — per-shape Konva components for the pizarra canvas.
 *
 * Each renderer is a functional component wrapping a react-konva primitive.
 * They receive a `shape` object and render the appropriate Konva node.
 */

import React from 'react';
import { SHAPE_TYPES } from './shapeModel';

// ─── Individual Renderers ──────────────────────────────────────────────────

export function RectRenderer({ shape, isSelected, onSelect, transformerRef }) {
  const handleClick = (e) => {
    e.cancelBubble = true;
    onSelect(e, shape.id);
  };

  return (
    <Rect
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      fill={shape.fill}
      stroke={shape.stroke}
      strokeWidth={shape.strokeWidth}
      cornerRadius={shape.cornerRadius}
      opacity={shape.opacity}
      rotation={shape.rotation || 0}
      draggable
      onClick={handleClick}
      onTap={handleClick}
      onTransformEnd={(e) => {
        const node = e.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        return {
          id: shape.id,
          x: node.x(),
          y: node.y(),
          width: Math.max(5, node.width() * scaleX),
          height: Math.max(5, node.height() * scaleY),
          rotation: node.rotation(),
        };
      }}
      ref={(node) => {
        if (isSelected && transformerRef && node) {
          transformerRef.nodes(node);
        }
      }}
    />
  );
}

export function CircleRenderer({ shape, isSelected, onSelect, transformerRef }) {
  const handleClick = (e) => {
    e.cancelBubble = true;
    onSelect(e, shape.id);
  };

  return (
    <Circle
      x={shape.x}
      y={shape.y}
      radius={shape.radius}
      fill={shape.fill}
      stroke={shape.stroke}
      strokeWidth={shape.strokeWidth}
      opacity={shape.opacity}
      rotation={shape.rotation || 0}
      draggable
      onClick={handleClick}
      onTap={handleClick}
      ref={(node) => {
        if (isSelected && transformerRef && node) {
          transformerRef.nodes(node);
        }
      }}
    />
  );
}

export function LineRenderer({ shape, isSelected, onSelect, transformerRef }) {
  const handleClick = (e) => {
    e.cancelBubble = true;
    onSelect(e, shape.id);
  };

  const points = shape.points || [0, 0, 100, 100];

  return (
    <Line
      x={shape.x}
      y={shape.y}
      points={points}
      stroke={shape.stroke}
      strokeWidth={shape.strokeWidth}
      opacity={shape.opacity}
      lineCap="round"
      lineJoin="round"
      draggable
      onClick={handleClick}
      onTap={handleClick}
      ref={(node) => {
        if (isSelected && transformerRef && node) {
          transformerRef.nodes(node);
        }
      }}
    />
  );
}

export function ArrowRenderer({ shape, isSelected, onSelect, transformerRef }) {
  const handleClick = (e) => {
    e.cancelBubble = true;
    onSelect(e, shape.id);
  };

  const points = shape.points || [0, 0, 100, 100];

  return (
    <Arrow
      x={shape.x}
      y={shape.y}
      points={points}
      stroke={shape.stroke}
      strokeWidth={shape.strokeWidth}
      fill={shape.fill || shape.stroke}
      opacity={shape.opacity}
      pointerLength={shape.pointerLength || 10}
      pointerWidth={shape.pointerWidth || 8}
      lineCap="round"
      lineJoin="round"
      draggable
      onClick={handleClick}
      onTap={handleClick}
      ref={(node) => {
        if (isSelected && transformerRef && node) {
          transformerRef.nodes(node);
        }
      }}
    />
  );
}

export function TextboxRenderer({ shape, isSelected, onSelect, transformerRef }) {
  const handleClick = (e) => {
    e.cancelBubble = true;
    onSelect(e, shape.id);
  };

  return (
    <Text
      x={shape.x}
      y={shape.y}
      text={shape.text}
      fontSize={shape.fontSize}
      fontFamily={shape.fontFamily || "'JetBrains Mono', monospace"}
      fill={shape.fill || '#f0ece4'}
      width={shape.width}
      wrap="word"
      opacity={shape.opacity}
      rotation={shape.rotation || 0}
      draggable
      onClick={handleClick}
      onTap={handleClick}
      ref={(node) => {
        if (isSelected && transformerRef && node) {
          transformerRef.nodes(node);
        }
      }}
    />
  );
}

// ─── Renderer Map ─────────────────────────────────────────────────────────

export function TerminalRenderer({ shape, isSelected, onSelect, transformerRef }) {
  const handleClick = (e) => {
    e.cancelBubble = true;
    onSelect(e, shape.id);
  };

  return (
    <Rect
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      fill="#0c1018"
      stroke={isSelected ? 'rgba(88,166,255,0.7)' : 'rgba(88,166,255,0.3)'}
      strokeWidth={isSelected ? 2 : 1}
      cornerRadius={8}
      opacity={shape.opacity}
      rotation={shape.rotation || 0}
      draggable
      onClick={handleClick}
      onTap={handleClick}
      ref={(node) => {
        if (isSelected && transformerRef && node) {
          transformerRef.nodes(node);
        }
      }}
    />
  );
}

export function BrowserRenderer({ shape, isSelected, onSelect, transformerRef }) {
  const handleClick = (e) => {
    e.cancelBubble = true;
    onSelect(e, shape.id);
  };

  return (
    <Rect
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      fill="#1e2535"
      stroke={isSelected ? 'rgba(88,166,255,0.7)' : 'rgba(88,166,255,0.3)'}
      strokeWidth={isSelected ? 2 : 1}
      cornerRadius={8}
      opacity={shape.opacity}
      rotation={shape.rotation || 0}
      draggable
      onClick={handleClick}
      onTap={handleClick}
      ref={(node) => {
        if (isSelected && transformerRef && node) {
          transformerRef.nodes(node);
        }
      }}
    />
  );
}

// ─── Renderer Map ─────────────────────────────────────────────────────────

export const SHAPE_RENDERERS = {
  [SHAPE_TYPES.RECT]: RectRenderer,
  [SHAPE_TYPES.CIRCLE]: CircleRenderer,
  [SHAPE_TYPES.LINE]: LineRenderer,
  [SHAPE_TYPES.ARROW]: ArrowRenderer,
  [SHAPE_TYPES.TEXTBOX]: TextboxRenderer,
  [SHAPE_TYPES.TERMINAL]: TerminalRenderer,
  [SHAPE_TYPES.BROWSER]: BrowserRenderer,
};

/**
 * Render a shape by looking up the correct renderer component.
 * Returns null if the type is unknown.
 */
export function renderShape(shape, props) {
  const Renderer = SHAPE_RENDERERS[shape.type];
  if (!Renderer) {
    console.warn(`Unknown shape type: ${shape.type}`);
    return null;
  }
  return <Renderer shape={shape} {...props} />;
}
