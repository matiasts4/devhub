/**
 * Shape Model — factory and serialization helpers for pizarra canvas shapes.
 */

import { SHAPE_DEFAULTS } from './theme';

function normalizePositiveNumber(value, fallback) {
  return typeof value === 'number' && value > 0 ? value : fallback;
}

function normalizeRenderablePoints(points, fallback) {
  if (!Array.isArray(points) || points.length < 4) {
    return fallback;
  }

  const [startX, startY] = points;
  const hasLength = points.some((value, index) => {
    if (index < 2 || index % 2 !== 0 || index + 1 >= points.length) {
      return false;
    }

    return value !== startX || points[index + 1] !== startY;
  });

  return hasLength ? points : fallback;
}

// Unique ID generator
let _counter = 0;
export function generateId() {
  return `shape-${Date.now()}-${++_counter}`;
}

// Shape type constants
export const SHAPE_TYPES = {
  RECT: 'rect',
  CIRCLE: 'circle',
  LINE: 'line',
  ARROW: 'arrow',
  TEXTBOX: 'textbox',
  TERMINAL: 'terminal',
  BROWSER: 'browser',
};

/**
 * Create a shape object of the given type with sensible defaults.
 * @param {'rect'|'circle'|'line'|'arrow'|'textbox'} type
 * @param {object} props  Override defaults (x, y, fill, stroke, etc.)
 */
export function createShape(type, props = {}) {
  const id = generateId();
  const base = {
    id,
    type,
    x: props.x ?? 0,
    y: props.y ?? 0,
    fill: props.fill ?? SHAPE_DEFAULTS.fill,
    stroke: props.stroke ?? SHAPE_DEFAULTS.stroke,
    strokeWidth: props.strokeWidth ?? SHAPE_DEFAULTS.strokeWidth,
    opacity: props.opacity ?? SHAPE_DEFAULTS.opacity,
    rotation: 0,
  };

  switch (type) {
    case SHAPE_TYPES.RECT:
      return {
        ...base,
        width: normalizePositiveNumber(props.width, 100),
        height: normalizePositiveNumber(props.height, 80),
        cornerRadius: props.cornerRadius ?? SHAPE_DEFAULTS.cornerRadius,
      };

    case SHAPE_TYPES.CIRCLE:
      return {
        ...base,
        radius: normalizePositiveNumber(props.radius, 40),
      };

    case SHAPE_TYPES.LINE:
      return {
        ...base,
        points: normalizeRenderablePoints(props.points, [0, 0, 100, 100]),
        fill: 'transparent',
        stroke: props.stroke ?? SHAPE_DEFAULTS.stroke,
      };

    case SHAPE_TYPES.ARROW:
      return {
        ...base,
        points: normalizeRenderablePoints(props.points, [0, 0, 100, 100]),
        fill: props.fill ?? base.stroke,
        pointerLength: 10,
        pointerWidth: 8,
      };

    case SHAPE_TYPES.TEXTBOX:
      return {
        ...base,
        text: props.text ?? 'Text',
        fontSize: props.fontSize ?? SHAPE_DEFAULTS.fontSize,
        fontFamily: props.fontFamily ?? SHAPE_DEFAULTS.fontFamily,
        width: normalizePositiveNumber(props.width, 200),
      };

    case SHAPE_TYPES.TERMINAL:
      return {
        ...base,
        width: normalizePositiveNumber(props.width, 640),
        height: normalizePositiveNumber(props.height, 400),
        label: props.label ?? 'Terminal',
      };

    case SHAPE_TYPES.BROWSER:
      return {
        ...base,
        width: normalizePositiveNumber(props.width, 1024),
        height: normalizePositiveNumber(props.height, 700),
        url: props.url ?? 'http://localhost:3000/',
        label: props.label ?? 'Browser',
      };

    default:
      throw new Error(`Unknown shape type: ${type}`);
  }
}

/**
 * Serialize a shape to JSON string.
 * @param {object} shape
 */
export function serializeShape(shape) {
  return JSON.stringify(shape);
}

/**
 * Deserialize a shape from JSON string.
 * Throws if input is not valid JSON or missing required fields.
 * @param {string} json
 * @returns {object}
 */
export function deserializeShape(json) {
  const parsed = JSON.parse(json);
  if (!parsed.id || !parsed.type) {
    throw new Error('Invalid shape: missing id or type');
  }
  return parsed;
}
