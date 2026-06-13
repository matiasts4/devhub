// Pizarra state helpers — createEmptyState, serialize, deserialize, validateState

const SCHEMA_VERSION = 1;

const VALID_TOOLS = new Set(['select', 'text', 'rect', 'circle', 'line', 'arrow']);

/**
 * Creates an initial empty pizarra state object.
 * @returns {{ elements: Map, viewport: {x:0,y:0,zoom:1}, activeTool: 'select',
 *             toolSettings: {color:string,strokeWidth:number,fontSize:number},
 *             activeBoardId: string, boards: Map }}
 */
function createEmptyState() {
  const now = Date.now();
  return {
    elements: new Map(),
    viewport: { x: 0, y: 0, zoom: 1 },
    activeTool: 'select',
    toolSettings: { color: '#000000', strokeWidth: 2, fontSize: 16 },
    activeBoardId: `board-${now}`,
    boards: new Map(),
  };
}

/**
 * Serializes pizarra state to a JSON string for localStorage.
 * Converts Map fields to plain objects.
 * @param {{ elements: Map, viewport: object, activeTool: string, toolSettings: object,
 *           activeBoardId: string, boards: Map }} state
 * @returns {string}
 */
function serialize(state) {
  return JSON.stringify({
    elements: Object.fromEntries(state.elements),
    viewport: state.viewport,
    activeTool: state.activeTool,
    toolSettings: state.toolSettings,
    activeBoardId: state.activeBoardId,
    boards: Object.fromEntries(state.boards),
    schemaVersion: SCHEMA_VERSION,
  });
}

/**
 * Deserializes a JSON string into a pizarra state object.
 * Reconstructs Maps from plain objects.
 * @param {string} raw - JSON string from localStorage
 * @returns {{ elements: Map, viewport: object, activeTool: string, toolSettings: object,
 *             activeBoardId: string, boards: Map } | null} null on parse error or missing keys
 */
function deserialize(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // Require top-level keys
  if (
    !parsed ||
    typeof parsed.elements !== 'object' ||
    typeof parsed.viewport !== 'object' ||
    typeof parsed.activeTool !== 'string' ||
    typeof parsed.toolSettings !== 'object' ||
    typeof parsed.activeBoardId !== 'string' ||
    typeof parsed.boards !== 'object'
  ) {
    return null;
  }

  return {
    elements: new Map(Object.entries(parsed.elements || {})),
    viewport: parsed.viewport,
    activeTool: parsed.activeTool,
    toolSettings: parsed.toolSettings,
    activeBoardId: parsed.activeBoardId,
    boards: new Map(Object.entries(parsed.boards || {})),
  };
}

/**
 * Validates that a state object has the required structure and valid values.
 * @param {{ viewport?: object, activeTool?: string, toolSettings?: object }} obj
 * @returns {boolean}
 */
function validateState(obj) {
  if (!obj) return false;

  // viewport: object with x, y, zoom numbers
  const vp = obj.viewport;
  if (
    typeof vp !== 'object' ||
    vp === null ||
    typeof vp.x !== 'number' ||
    typeof vp.y !== 'number' ||
    typeof vp.zoom !== 'number'
  ) {
    return false;
  }

  // activeTool must be a known tool string
  if (!VALID_TOOLS.has(obj.activeTool)) return false;

  // toolSettings: object with color (string), strokeWidth (number), fontSize (number)
  const ts = obj.toolSettings;
  if (
    typeof ts !== 'object' ||
    ts === null ||
    typeof ts.color !== 'string' ||
    typeof ts.strokeWidth !== 'number' ||
    typeof ts.fontSize !== 'number'
  ) {
    return false;
  }

  return true;
}

module.exports = { createEmptyState, serialize, deserialize, validateState };