/**
 * ShapePreviewOverlay — pizarra-motion-polish (P-MP-7) live preview.
 *
 * Renders the in-flight shape geometry as a dashed outline during a
 * drag. The persisted `elements` list is NOT touched — this overlay
 * is purely visual and is cleared on mouseup.
 *
 * The component reads the shape `type` and branches to the right
 * Konva primitive (Rect, Circle, Line). Stroke is dashed + lightly
 * tinted with the accent so it reads as "tentative, not yet
 * committed". No fill, no listening — purely cosmetic.
 *
 * Test-friendly: source-level tests in
 * `PizarraCanvas.livePreview.test.jsx` check that the
 * `PizarraCanvas.jsx` render path mentions this component name.
 */
import React from 'react';

const PREVIEW_STROKE = '#3b82f6';
const PREVIEW_STROKE_WIDTH = 1;
const PREVIEW_DASH = [4, 4];

export function ShapePreviewOverlay({ konva, preview }) {
  if (!preview || !konva) return null;
  const { Rect, Circle, Line, Arrow } = konva;
  if (preview.type === 'circle') {
    if (!Circle) return null;
    return (
      <Circle
        x={preview.x}
        y={preview.y}
        radius={preview.radius}
        stroke={PREVIEW_STROKE}
        strokeWidth={PREVIEW_STROKE_WIDTH}
        dash={PREVIEW_DASH}
        listening={false}
      />
    );
  }
  if (preview.type === 'line') {
    if (!Line) return null;
    return (
      <Line
        x={preview.x}
        y={preview.y}
        points={preview.points}
        stroke={PREVIEW_STROKE}
        strokeWidth={PREVIEW_STROKE_WIDTH}
        dash={PREVIEW_DASH}
        listening={false}
      />
    );
  }
  if (preview.type === 'arrow') {
    if (!Arrow) return null;
    return (
      <Arrow
        x={preview.x}
        y={preview.y}
        points={preview.points}
        stroke={PREVIEW_STROKE}
        strokeWidth={PREVIEW_STROKE_WIDTH}
        dash={PREVIEW_DASH}
        listening={false}
      />
    );
  }
  // rect, textbox, or any other — fall through to Rect.
  if (!Rect) return null;
  return (
    <Rect
      x={preview.x}
      y={preview.y}
      width={preview.width}
      height={preview.height}
      stroke={PREVIEW_STROKE}
      strokeWidth={PREVIEW_STROKE_WIDTH}
      dash={PREVIEW_DASH}
      listening={false}
    />
  );
}

export default ShapePreviewOverlay;
