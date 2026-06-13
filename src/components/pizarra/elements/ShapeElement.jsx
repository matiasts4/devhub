'use client';

/**
 * ShapeElement — renders rectangle, ellipse, line, and arrow shapes.
 * Shapes are positioned absolutely; rect/ellipse use CSS, line/arrow use SVG.
 */
import { ELEMENT_TYPES } from '@/lib/pizarra/elementModel';

/**
 * @param {object} props
 * @param {object} props.element - element with type in RECTANGLE|ELLIPSE|LINE|ARROW
 * @param {number} [props.width]  - override width from element.size
 * @param {number} [props.height] - override height from element.size
 */
export default function ShapeElement({ element, width, height }) {
  const { type, size } = element;
  const data = element.data ?? {};
  const stroke = data.stroke ?? '#00d084';
  const fill = data.fill ?? 'transparent';
  const strokeWidth = data.strokeWidth ?? 2;

  const w = width ?? size?.width ?? 120;
  const h = height ?? size?.height ?? 80;

  if (type === ELEMENT_TYPES.RECTANGLE) {
    return (
      <div
        style={{
          width: w,
          height: h,
          border: `${strokeWidth}px solid ${stroke}`,
          background: fill,
          borderRadius: '4px',
          boxSizing: 'border-box',
        }}
      />
    );
  }

  if (type === ELEMENT_TYPES.ELLIPSE) {
    return (
      <div
        style={{
          width: w,
          height: h,
          border: `${strokeWidth}px solid ${stroke}`,
          background: fill,
          borderRadius: '50%',
          boxSizing: 'border-box',
        }}
      />
    );
  }

  if (type === ELEMENT_TYPES.LINE || type === ELEMENT_TYPES.ARROW) {
    const w2 = Math.max(w, 1);
    const h2 = Math.max(h, 1);

    // SVG arrow pointing right-down
    const arrowHead = type === ELEMENT_TYPES.ARROW ? (
      <polyline
        points={`${w2},${h2} ${w2 - 8},${h2} ${w2},${h2 - 8}`}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : null;

    return (
      <svg
        width={w2}
        height={Math.max(h2, strokeWidth + 4)}
        style={{ overflow: 'visible', display: 'block' }}
      >
        <line
          x1="0"
          y1="0"
          x2={w2}
          y2={Math.max(h2, 1)}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {arrowHead}
      </svg>
    );
  }

  return null;
}
