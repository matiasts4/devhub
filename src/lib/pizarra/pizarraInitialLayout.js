/**
 * Synchronous initial layout for pizarra live surfaces.
 *
 * Surfaces without saved pizarra.x/y must NOT render at a shared fallback
 * (e.g. 100,100) while a useEffect assigns real slots — that causes the
 * visible "stacked cards" flash on workspace/mode switches. These helpers
 * compute the same preset slots the auto-fit path uses, synchronously at
 * render time, so the first paint already shows the distributed layout.
 */

import { SHAPE_TYPES } from './shapeModel';
import {
  VIEW_WORLD_HEIGHT,
  VIEW_WORLD_WIDTH,
  getViewIndex,
  getViewWorldOrigin,
  getSurfaceViewId,
} from './pizarraViewLayout';

export function isSurfacePositioned(pizarra = {}) {
  return typeof pizarra.x === 'number' && typeof pizarra.y === 'number';
}

/** Merged live element (registry + render bounds) may expose x/y at root or in pizarra. */
export function isLiveElementPositioned(el = {}) {
  return isSurfacePositioned(el.pizarra || {}) || isSurfacePositioned(el);
}

export function computeDevSplitSlots(vis, dockSide = 'left') {
  const edgePad = 4;
  const gap = 12;
  const usableW = Math.max(640, vis.width - edgePad * 2);
  const usableH = Math.max(300, vis.height - edgePad * 2);
  const bw = Math.round(usableW * 0.58);
  const tw = usableW - bw - gap;
  const leftX = vis.x + edgePad;
  const rightX = leftX + (dockSide === 'right' ? tw + gap : bw + gap);
  const topY = vis.y + edgePad;
  if (dockSide === 'right') {
    return {
      browser: { x: rightX, y: topY, width: bw, height: usableH },
      terminals: [{ x: leftX, y: topY, width: tw, height: usableH }],
    };
  }
  return {
    browser: { x: leftX, y: topY, width: bw, height: usableH },
    terminals: [{ x: rightX, y: topY, width: tw, height: usableH }],
  };
}

export function computeDevTrioSlots(vis, dockSide = 'left') {
  const edgePad = 4;
  const gap = 12;
  const rowGap = 12;
  const usableW = Math.max(640, vis.width - edgePad * 2);
  const usableH = Math.max(300, vis.height - edgePad * 2);
  const bw = Math.round(usableW * 0.58);
  const tw = usableW - bw - gap;
  const th = Math.max(140, Math.round((usableH - rowGap) / 2));
  const leftX = vis.x + edgePad;
  const rightX = leftX + (dockSide === 'right' ? tw + gap : bw + gap);
  const topY = vis.y + edgePad;
  if (dockSide === 'right') {
    return {
      browser: { x: rightX, y: topY, width: bw, height: usableH },
      terminals: [
        { x: leftX, y: topY, width: tw, height: th },
        { x: leftX, y: topY + th + rowGap, width: tw, height: th },
      ],
    };
  }
  return {
    browser: { x: leftX, y: topY, width: bw, height: usableH },
    terminals: [
      { x: rightX, y: topY, width: tw, height: th },
      { x: rightX, y: topY + th + rowGap, width: tw, height: th },
    ],
  };
}

export function computeDualBrowserSlots(vis) {
  const edgePad = 4;
  const gap = 12;
  const usableW = Math.max(640, vis.width - edgePad * 2);
  const usableH = Math.max(300, vis.height - edgePad * 2);
  const bw = Math.round((usableW - gap) / 2);
  const leftX = vis.x + edgePad;
  const rightX = leftX + bw + gap;
  const topY = vis.y + edgePad;
  return {
    browsers: [
      { x: leftX, y: topY, width: bw, height: usableH },
      { x: rightX, y: topY, width: bw, height: usableH },
    ],
  };
}

/**
 * Compute layout slots for a set of live surfaces inside `vis`.
 * Returns Map<surfaceId, { x, y, width, height }>.
 */
export function computeAutoFitSlotMap(vis, surfaces = []) {
  const slotMap = new Map();
  if (!vis || surfaces.length === 0) return slotMap;

  const cx = vis.x + vis.width / 2;
  const cy = vis.y + vis.height / 2;
  const PAD = 10;
  const GAP = 12;
  const maxH = Math.max(200, Math.round(vis.height * 0.96));

  const browsers = surfaces.filter((s) => s.type === 'browser' || s.type === SHAPE_TYPES.BROWSER);
  const terminals = surfaces.filter(
    (s) => s.type === 'terminal' || s.type === SHAPE_TYPES.TERMINAL
  );
  const n = surfaces.length;

  const put = (id, layout) => slotMap.set(id, layout);

  if (n === 1) {
    const s = surfaces[0];
    const isBrowser = s.type === 'browser' || s.type === SHAPE_TYPES.BROWSER;
    const w = Math.max(400, Math.round(vis.width * 0.96));
    const h = Math.max(300, Math.min(Math.round(vis.height * 0.96), isBrowser ? 1200 : 900));
    put(s.id, { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: w, height: h });
    return slotMap;
  }

  if (browsers.length === 1 && terminals.length === 1) {
    const dockSide = browsers[0]?.pizarra?.dockSide || browsers[0]?.dockSide || 'left';
    const slots = computeDevSplitSlots(vis, dockSide);
    put(browsers[0].id, slots.browser);
    put(terminals[0].id, slots.terminals[0]);
    return slotMap;
  }

  if (browsers.length === 1 && terminals.length === 2) {
    const dockSide = browsers[0]?.pizarra?.dockSide || browsers[0]?.dockSide || 'left';
    const slots = computeDevTrioSlots(vis, dockSide);
    put(browsers[0].id, slots.browser);
    put(terminals[0].id, slots.terminals[0]);
    put(terminals[1].id, slots.terminals[1]);
    return slotMap;
  }

  if (browsers.length === 2 && terminals.length === 0) {
    const slots = computeDualBrowserSlots(vis);
    put(browsers[0].id, slots.browsers[0]);
    put(browsers[1].id, slots.browsers[1]);
    return slotMap;
  }

  if (browsers.length === 0 && terminals.length > 0 && terminals.length <= 4) {
    const tw = Math.max(
      200,
      Math.round((vis.width - PAD * 2 - GAP * (terminals.length - 1)) / terminals.length)
    );
    const th = Math.max(240, Math.min(maxH, Math.round(vis.height * 0.94)));
    const totalW = tw * terminals.length + GAP * (terminals.length - 1);
    const startX = Math.round(cx - totalW / 2);
    const startY = Math.round(cy - th / 2);
    terminals.forEach((t, i) => {
      put(t.id, { x: startX + i * (tw + GAP), y: startY, width: tw, height: th });
    });
    return slotMap;
  }

  const cols = n <= 2 ? n : Math.min(2, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const usableW = vis.width - PAD * 2 - GAP * (cols - 1);
  const usableH = vis.height - PAD * 2 - GAP * (rows - 1);
  const cellW = Math.max(200, Math.round(usableW / cols));
  const cellH = Math.max(160, Math.round(usableH / rows));
  const totalGridW = cols * cellW + GAP * (cols - 1);
  const totalGridH = rows * cellH + GAP * (rows - 1);
  const startX = Math.round(vis.x + (vis.width - totalGridW) / 2);
  const startY = Math.round(vis.y + (vis.height - totalGridH) / 2);
  const sorted = [...browsers, ...terminals];
  sorted.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    put(s.id, {
      x: startX + col * (cellW + GAP),
      y: startY + row * (cellH + GAP),
      width: cellW,
      height: cellH,
    });
  });
  return slotMap;
}

/**
 * Merge saved pizarra bounds with synchronous initial slots for unpositioned
 * live surfaces. Used at render time so the first paint is already distributed.
 */
/**
 * Resolve render bounds per workspace view region so V2+ surfaces are not
 * provisionally placed in V1 world space (fixes blank pizarra on view switch).
 */
export function resolveRegistrySurfacesBoundsByView(
  surfaces = [],
  views = [],
  fallbackViewId = null,
  { layoutWidth = VIEW_WORLD_WIDTH, layoutHeight = VIEW_WORLD_HEIGHT } = {}
) {
  if (!surfaces.length) return [];
  const byView = new Map();
  for (const s of surfaces) {
    // Always place the surface: empty workspaceWindows (tests / first open)
    // used to drop every card when neither viewId nor fallback existed.
    const viewId = getSurfaceViewId(s, views, fallbackViewId) || views[0]?.id || '__default__';
    if (!byView.has(viewId)) byView.set(viewId, []);
    byView.get(viewId).push(s);
  }
  const resolved = [];
  for (const [viewId, group] of byView) {
    const origin = getViewWorldOrigin(getViewIndex(viewId, views));
    const vis = {
      x: origin.x,
      y: origin.y,
      width: layoutWidth,
      height: layoutHeight,
    };
    resolved.push(...resolveSurfaceRenderBounds(group, vis));
  }
  return resolved;
}

export function resolveSurfaceRenderBounds(
  surfaces,
  vis,
  {
    defaultTerminalW = 640,
    defaultTerminalH = 400,
    defaultBrowserW = 1024,
    defaultBrowserH = 700,
  } = {}
) {
  const live = surfaces.filter(
    (s) =>
      s.type === 'terminal' ||
      s.type === 'browser' ||
      s.type === SHAPE_TYPES.TERMINAL ||
      s.type === SHAPE_TYPES.BROWSER
  );
  const unpositioned = live.filter((s) => !isSurfacePositioned(s.pizarra));
  const slotMap = unpositioned.length > 0 ? computeAutoFitSlotMap(vis, live) : new Map();

  return surfaces.map((s) => {
    const isLive =
      s.type === 'terminal' ||
      s.type === 'browser' ||
      s.type === SHAPE_TYPES.TERMINAL ||
      s.type === SHAPE_TYPES.BROWSER;
    if (!isLive) return s;

    const isBrowser = s.type === 'browser' || s.type === SHAPE_TYPES.BROWSER;
    const defaultW = isBrowser ? defaultBrowserW : defaultTerminalW;
    const defaultH = isBrowser ? defaultBrowserH : defaultTerminalH;
    const saved = s.pizarra || {};
    const slot = slotMap.get(s.id);

    if (isSurfacePositioned(saved)) {
      return {
        ...s,
        x: saved.x,
        y: saved.y,
        width: saved.width ?? defaultW,
        height: saved.height ?? defaultH,
        // pizarra-editing-ux Phase 4: surface locking + layer order ride
        // on pizarra.* and are flattened onto the render shape so the
        // live-surface layer + consumers read shape.locked / shape.zIndex
        // uniformly (same contract as simple shapes).
        locked: Boolean(saved.locked),
        zIndex: saved.zIndex ?? 0,
        _layoutResolved: true,
      };
    }

    if (slot) {
      return {
        ...s,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        locked: Boolean(saved.locked),
        zIndex: saved.zIndex ?? 0,
        _layoutResolved: true,
        _layoutProvisional: true,
      };
    }

    // No slot yet (empty vis) — keep off-screen rather than stacking at (100,100).
    return {
      ...s,
      x: -10000,
      y: -10000,
      width: saved.width ?? defaultW,
      height: saved.height ?? defaultH,
      locked: Boolean(saved.locked),
      zIndex: saved.zIndex ?? 0,
      _layoutResolved: false,
    };
  });
}
