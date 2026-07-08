/**
 * pizarraClipboard — in-session, app-level clipboard for the pizarra.
 *
 * Singleton at module scope so it survives workspace switches within a
 * session (it does NOT survive a page refresh — that is by design; the
 * user chose session/memory reach, not OS clipboard).
 *
 * Two element kinds live on the pizarra:
 *  - shapes  (rect/circle/line/arrow/text) — plain data in pizarraReducer
 *  - surfaces (terminal/browser)           — registry + runtime process
 *
 * Phase 2 implements shapes only. Surfaces are serialized as a metadata
 * stub here so the module is forward-compatible; the paste path filters
 * to shapes until surface duplicate is wired in Phase 4/5.
 *
 * SerializedItem = { kind: 'shape', data: {...} }
 *                | { kind: 'surface', data: { type, pizarra, ...metadata } }
 *
 * Serialization stores METADATA only — never a live panelId, scrollback,
 * or session. Pasting mints fresh ids (cloneShape) and, for surfaces, a
 * fresh panelId + spawned process (Phase 4).
 */

import { cloneShape, SHAPE_TYPES } from './shapeModel';

let _items = [];

function isSurface(el) {
  return el && (el.type === SHAPE_TYPES.TERMINAL || el.type === SHAPE_TYPES.BROWSER);
}

function serializeShape(el) {
  // Strip the id (a paste mints a fresh one via cloneShape). Copy the
  // points array so the stored item does not alias the original's array.
  const { id: _stripped, ...data } = el;
  if (Array.isArray(el.points)) data.points = [...el.points];
  return { kind: 'shape', data };
}

function serializeSurface(el) {
  // pizarra-editing-ux Phase 4: store the metadata needed to spawn a
  // duplicate (a fresh process / webview). No panelId / runtime / scrollback
  // is captured — those cannot be cloned. pizarra.* carries layout + viewId
  // + zIndex + locked; paste offsets x/y and resets locked.
  return {
    kind: 'surface',
    data: {
      type: el.type,
      pizarra: { ...el.pizarra },
      label: el.label,
      url: el.url,
      cwd: el.cwd,
      initialCommand: el.initialCommand,
      requestedRendererMode: el.requestedRendererMode,
    },
  };
}

function serialize(el) {
  return isSurface(el) ? serializeSurface(el) : serializeShape(el);
}

/**
 * Copy a selection into the session clipboard. Mixed selections are
 * supported; Phase 2 paste only reconstructs shapes.
 * @param {object[]} elements
 */
export function copyPizarra(elements) {
  const list = Array.isArray(elements) ? elements : [];
  _items = list.map(serialize);
}

/**
 * Read the current clipboard items (SerializedItem[]). Returns a new
 * array so callers cannot mutate the singleton's store.
 */
export function readPizarra() {
  return _items.map((item) => item);
}

/** Empty the clipboard. */
export function clearPizarra() {
  _items = [];
}

/** True when the clipboard holds at least one item. */
export function hasPizarraClipboard() {
  return _items.length > 0;
}

/**
 * Top-left origin (min x, min y) of the shape items in the clipboard, in
 * world coordinates. Used by paste-here to align the pasted group's
 * bounding box with the click point: offset = anchor - origin.
 * @param {object[]} items
 * @returns {{ x: number, y: number }}
 */
export function clipboardShapesOrigin(items) {
  const list = Array.isArray(items) ? items : [];
  const shapes = list.filter((item) => item && item.kind === 'shape' && item.data);
  if (shapes.length === 0) return { x: 0, y: 0 };
  return shapes.reduce(
    (acc, item) => ({
      x: Math.min(acc.x, item.data.x ?? 0),
      y: Math.min(acc.y, item.data.y ?? 0),
    }),
    { x: Infinity, y: Infinity }
  );
}

/**
 * Build pasted shapes from clipboard items. Pure — given the stored
 * items, the current max zIndex, and an offset, returns new shape
 * objects with fresh ids, offset positions, and zIndex stacked above
 * the current top. Surfaces in the clipboard are skipped here (see
 * buildPastedSurfaces).
 * @param {object[]} items
 * @param {number} [maxZ=0]
 * @param {{x?:number, y?:number}} [offset]
 * @returns {object[]}
 */
export function buildPastedShapes(items, maxZ = 0, offset = { x: 20, y: 20 }) {
  const list = Array.isArray(items) ? items : [];
  const ox = offset?.x ?? 20;
  const oy = offset?.y ?? 20;
  let z = maxZ;
  return list
    .filter((item) => item && item.kind === 'shape' && item.data)
    .map((item) => {
      z += 1;
      return cloneShape(item.data, {
        x: (item.data.x ?? 0) + ox,
        y: (item.data.y ?? 0) + oy,
        zIndex: z,
      });
    });
}

/**
 * Build pasted-surface spawn descriptors from clipboard items. Pure —
 * returns metadata ready for `registry.addSurface` (NO id / panelId, so
 * the provider mints fresh ones and spawns a new process/webview).
 * Position is offset from the stored pizarra.x/y; locked is reset so the
 * pasted copy is editable. zIndex is preserved from the stored value so
 * the copy lands in the same layer as the original.
 *
 * pizarra-editing-ux Phase 5: `options.destinationViewId` remaps the
 * surface to the destination workspace's active view. The clipboard is
 * app-level (singleton), so a surface copied in workspace A can be pasted
 * in workspace B — but A's viewId may not exist in B, so the pasted
 * descriptor must land in B's view. When omitted, the stored viewId is
 * preserved (same-workspace paste).
 * @param {object[]} items
 * @param {{x?:number, y?:number}} [offset]
 * @param {{destinationViewId?: string}} [options]
 * @returns {object[]}
 */
export function buildPastedSurfaces(items, offset = { x: 20, y: 20 }, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const ox = offset?.x ?? 20;
  const oy = offset?.y ?? 20;
  const destinationViewId = options?.destinationViewId;
  return list
    .filter((item) => item && item.kind === 'surface' && item.data)
    .map((item) => {
      const p = item.data.pizarra || {};
      return {
        type: item.data.type,
        label: item.data.label,
        url: item.data.url,
        cwd: item.data.cwd,
        initialCommand: item.data.initialCommand,
        requestedRendererMode: item.data.requestedRendererMode,
        pizarra: {
          ...p,
          x: (p.x ?? 0) + ox,
          y: (p.y ?? 0) + oy,
          locked: false,
          // Phase 5: remap to the destination workspace's view so a
          // cross-pizarra paste surfaces in the active view of B, not a
          // stale viewId from A that may not exist in B.
          ...(destinationViewId ? { viewId: destinationViewId } : {}),
        },
      };
    });
}
