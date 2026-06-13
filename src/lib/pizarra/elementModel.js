/**
 * Pizarra element model — shared constants and factory helpers.
 */

export const ELEMENT_TYPES = {
  AGENT: 'agent',
  TERMINAL: 'terminal',
  TEXTBOX: 'textbox',
  RECTANGLE: 'rectangle',
  ELLIPSE: 'ellipse',
  LINE: 'line',
  ARROW: 'arrow',
};

export const DEFAULT_TEXTBOX_DATA = {
  content: '',
  fontSize: 16,
  color: '#ffffff',
};

export const DEFAULT_SHAPE_DATA = {
  stroke: '#00d084',
  fill: 'transparent',
  strokeWidth: 2,
};

/**
 * Create a new textbox element at a given canvas position.
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @returns {object}
 */
export function createTextbox(id, x, y) {
  return {
    id,
    type: ELEMENT_TYPES.TEXTBOX,
    position: { x, y },
    size: { width: 200, height: 50 },
    zIndex: 1,
    locked: false,
    selected: false,
    data: { ...DEFAULT_TEXTBOX_DATA },
  };
}

/**
 * Create a new rectangle element at a given canvas position.
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @returns {object}
 */
export function createRectangle(id, x, y) {
  return {
    id,
    type: ELEMENT_TYPES.RECTANGLE,
    position: { x, y },
    size: { width: 120, height: 80 },
    zIndex: 1,
    locked: false,
    selected: false,
    data: { ...DEFAULT_SHAPE_DATA },
  };
}

/**
 * Create a new ellipse element at a given canvas position.
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @returns {object}
 */
export function createEllipse(id, x, y) {
  return {
    id,
    type: ELEMENT_TYPES.ELLIPSE,
    position: { x, y },
    size: { width: 120, height: 80 },
    zIndex: 1,
    locked: false,
    selected: false,
    data: { ...DEFAULT_SHAPE_DATA },
  };
}

/**
 * Create a new line element at a given canvas position.
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @returns {object}
 */
export function createLine(id, x, y) {
  return {
    id,
    type: ELEMENT_TYPES.LINE,
    position: { x, y },
    size: { width: 100, height: 0 },
    zIndex: 1,
    locked: false,
    selected: false,
    data: { ...DEFAULT_SHAPE_DATA },
  };
}

/**
 * Create a new arrow element at a given canvas position.
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @returns {object}
 */
export function createArrow(id, x, y) {
  return {
    id,
    type: ELEMENT_TYPES.ARROW,
    position: { x, y },
    size: { width: 100, height: 0 },
    zIndex: 1,
    locked: false,
    selected: false,
    data: { ...DEFAULT_SHAPE_DATA },
  };
}

/**
 * Sort elements by zIndex ascending for rendering.
 * @param {object[]} elements
 * @returns {object[]}
 */
export function sortByZIndex(elements) {
  return [...elements].sort((a, b) => a.zIndex - b.zIndex);
}

/**
 * Find the maximum zIndex in an element list.
 * @param {object[]} elements
 * @returns {number}
 */
export function maxZIndex(elements) {
  if (!elements || elements.length === 0) return 0;
  return Math.max(...elements.map((el) => el.zIndex));
}
