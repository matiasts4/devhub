/**
 * Pizarra view layout — each workspace "ventana" (V1, V2…) owns a fixed
 * region in world space. Zones, snap, and camera are anchored there, not
 * to the current viewport (fixes zoom/pan vs zone mismatch).
 */

export const VIEW_WORLD_WIDTH = 1680;
export const VIEW_WORLD_HEIGHT = 960;
export const VIEW_WORLD_GAP = 120;
export const BROWSER_ZONE_RATIO = 0.62;
/** Browser share when auto-layout mixes browser + terminal(s) — not 50/50. */
export const BROWSER_PRIMARY_WIDTH_RATIO = 0.58;
export const BROWSER_PRIMARY_WIDTH_RATIO_DENSE = 0.55;

export function getViewIndex(viewId, views = []) {
  if (!viewId || !views.length) return 0;
  const idx = views.findIndex((v) => v.id === viewId);
  return idx >= 0 ? idx : 0;
}

export function getViewWorldOrigin(viewIndex = 0) {
  const i = Math.max(0, viewIndex);
  return {
    x: i * (VIEW_WORLD_WIDTH + VIEW_WORLD_GAP),
    y: 0,
  };
}

/** Fixed zones for a view — browser left (62%), terminal right (38%). */
export function computeViewZones(viewOrigin, { gap = 16 } = {}) {
  const x = viewOrigin?.x ?? 0;
  const y = viewOrigin?.y ?? 0;
  const w = VIEW_WORLD_WIDTH;
  const h = VIEW_WORLD_HEIGHT;
  const splitX = x + Math.round(w * BROWSER_ZONE_RATIO);
  const innerGap = gap;

  return {
    left: {
      x: x + innerGap,
      y: y + innerGap,
      width: splitX - x - innerGap * 2,
      height: h - innerGap * 2,
    },
    right: {
      x: splitX + innerGap,
      y: y + innerGap,
      width: x + w - splitX - innerGap * 2,
      height: h - innerGap * 2,
    },
    center: {
      x: x + w * 0.12,
      y: y + h * 0.12,
      width: w * 0.76,
      height: h * 0.76,
    },
    splitLine: splitX,
    centerPoint: { x: x + w / 2, y: y + h / 2 },
    bounds: { x, y, width: w, height: h },
  };
}

/** Pan offset to center a view region in the viewport. */
export function getCameraPanForView(viewOrigin, canvasWidth, canvasHeight, zoom = 1) {
  const z = zoom > 0 ? zoom : 1;
  const cx = (viewOrigin?.x ?? 0) + VIEW_WORLD_WIDTH / 2;
  const cy = (viewOrigin?.y ?? 0) + VIEW_WORLD_HEIGHT / 2;
  return {
    x: canvasWidth / 2 - cx * z,
    y: canvasHeight / 2 - cy * z,
  };
}

export function isSurfaceVisibleForLayout(surface) {
  return surface?.pizarra?.visible !== false;
}

/** Workspace browser carried from normal view (not a pizarra-only card). */
export function isCarriedWorkspaceBrowser(surface) {
  if (!surface || surface.type !== 'browser') return false;
  const panelId = String(surface.panelId || '');
  return panelId.startsWith('browser-') && !panelId.startsWith('pizarra-browser-');
}

/**
 * Surfaces that participate in automatic layout for a view.
 * Carried workspace browsers are excluded when multiple terminals need space
 * and the browser has not been manually placed yet.
 */
export function partitionSurfacesForAutoLayout(surfaces = []) {
  const visible = surfaces.filter(isSurfaceVisibleForLayout);
  const terminals = visible.filter((s) => s.type === 'terminal');
  const browsers = visible.filter((s) => s.type === 'browser');
  const terminalCount = terminals.length;

  const layoutBrowsers = browsers.filter((browser) => {
    if (!isCarriedWorkspaceBrowser(browser)) return true;
    const userPlaced = browser.pizarra?.userPlaced === true;
    if (userPlaced) return true;
    // Zed open_url (and similar explicit opens) must stay visible even with 2+ terminals.
    if (browser.pizarra?.layoutPriority === true) return true;
    if (terminalCount >= 2) return false;
    return true;
  });

  const hiddenBrowsers = browsers.filter((b) => !layoutBrowsers.includes(b));

  return { browsers: layoutBrowsers, terminals, hiddenBrowsers };
}

function padRect(rect, pad = 6) {
  return {
    x: Math.round(rect.x + pad),
    y: Math.round(rect.y + pad),
    width: Math.max(160, Math.round(rect.width - pad * 2)),
    height: Math.max(120, Math.round(rect.height - pad * 2)),
  };
}

function splitHorizontal(rect, count, gap = 16) {
  const n = Math.max(1, count);
  const totalGap = gap * (n - 1);
  const cellW = Math.max(160, Math.floor((rect.width - totalGap) / n));
  const cellH = Math.max(120, Math.round(rect.height));
  const slots = [];
  let x = rect.x;
  for (let i = 0; i < n; i += 1) {
    const w = i === n - 1 ? rect.x + rect.width - x : cellW;
    slots.push({ x: Math.round(x), y: Math.round(rect.y), width: Math.round(w), height: cellH });
    x += w + gap;
  }
  return slots;
}

function splitVertical(rect, count, gap = 16) {
  const n = Math.max(1, count);
  const totalGap = gap * (n - 1);
  const cellH = Math.max(120, Math.floor((rect.height - totalGap) / n));
  const cellW = Math.max(160, Math.round(rect.width));
  const slots = [];
  let y = rect.y;
  for (let i = 0; i < n; i += 1) {
    const h = i === n - 1 ? rect.y + rect.height - y : cellH;
    slots.push({ x: Math.round(rect.x), y: Math.round(y), width: cellW, height: Math.round(h) });
    y += h + gap;
  }
  return slots;
}

function gridSlots(rect, items, { cols = 2, gap = 16 } = {}) {
  const n = items.length;
  const rows = Math.ceil(n / cols);
  const totalGapX = gap * (cols - 1);
  const totalGapY = gap * (rows - 1);
  const cellW = Math.max(160, Math.floor((rect.width - totalGapX) / cols));
  const cellH = Math.max(120, Math.floor((rect.height - totalGapY) / rows));
  return items.map((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: item.id,
      x: Math.round(rect.x + col * (cellW + gap)),
      y: Math.round(rect.y + row * (cellH + gap)),
      width: cellW,
      height: cellH,
    };
  });
}

/**
 * Adaptive layout inside an arbitrary world-space rectangle.
 * Used for manual auto-fit (visible viewport) and fixed view regions.
 */
export function computeAdaptiveRectLayout(
  containerBounds,
  surfaces = [],
  { gap = 12, pad = 6 } = {}
) {
  const inner = padRect(containerBounds, pad);
  const { browsers, terminals, hiddenBrowsers } = partitionSurfacesForAutoLayout(surfaces);
  const layouts = [];
  const bCount = browsers.length;
  const tCount = terminals.length;

  if (bCount === 0 && tCount === 0) {
    return { layouts, hiddenBrowserIds: hiddenBrowsers.map((b) => b.id) };
  }

  // Terminals only — use full container width
  if (bCount === 0) {
    if (tCount === 1) {
      layouts.push({ id: terminals[0].id, ...inner });
    } else if (tCount === 2) {
      splitHorizontal(inner, 2, gap).forEach((slot, i) => {
        layouts.push({ id: terminals[i].id, ...slot });
      });
    } else if (tCount === 3) {
      splitHorizontal(inner, 3, gap).forEach((slot, i) => {
        layouts.push({ id: terminals[i].id, ...slot });
      });
    } else {
      const cols = tCount === 4 ? 2 : Math.min(3, tCount);
      gridSlots(inner, terminals, { cols, gap }).forEach((slot) => layouts.push(slot));
    }
    return { layouts, hiddenBrowserIds: hiddenBrowsers.map((b) => b.id) };
  }

  // Browsers only
  if (tCount === 0) {
    if (bCount === 1) {
      layouts.push({ id: browsers[0].id, ...inner });
    } else {
      splitHorizontal(inner, bCount, gap).forEach((slot, i) => {
        layouts.push({ id: browsers[i].id, ...slot });
      });
    }
    return { layouts, hiddenBrowserIds: hiddenBrowsers.map((b) => b.id) };
  }

  // Mixed: browser + terminal(s)
  if (bCount === 1 && tCount === 1) {
    const browserW = Math.round(inner.width * BROWSER_PRIMARY_WIDTH_RATIO);
    const browserRect = {
      x: inner.x,
      y: inner.y,
      width: browserW - Math.round(gap / 2),
      height: inner.height,
    };
    const termRect = {
      x: inner.x + browserW + Math.round(gap / 2),
      y: inner.y,
      width: inner.width - browserW - Math.round(gap / 2),
      height: inner.height,
    };
    layouts.push({ id: browsers[0].id, ...padRect(browserRect, 2) });
    layouts.push({ id: terminals[0].id, ...padRect(termRect, 2) });
    return { layouts, hiddenBrowserIds: hiddenBrowsers.map((b) => b.id) };
  }

  if (bCount === 1 && tCount === 2) {
    const browserW = Math.round(inner.width * BROWSER_PRIMARY_WIDTH_RATIO);
    const browserRect = {
      x: inner.x,
      y: inner.y,
      width: browserW - Math.round(gap / 2),
      height: inner.height,
    };
    const termRect = {
      x: inner.x + browserW + Math.round(gap / 2),
      y: inner.y,
      width: inner.width - browserW - Math.round(gap / 2),
      height: inner.height,
    };
    layouts.push({ id: browsers[0].id, ...padRect(browserRect, 2) });
    splitVertical(padRect(termRect, 2), 2, gap).forEach((slot, i) => {
      layouts.push({ id: terminals[i].id, ...slot });
    });
    return { layouts, hiddenBrowserIds: hiddenBrowsers.map((b) => b.id) };
  }

  if (bCount === 1 && tCount >= 3) {
    const browserW = Math.round(inner.width * BROWSER_PRIMARY_WIDTH_RATIO_DENSE);
    const browserRect = {
      x: inner.x,
      y: inner.y,
      width: browserW - Math.round(gap / 2),
      height: inner.height,
    };
    const termRect = {
      x: inner.x + browserW + Math.round(gap / 2),
      y: inner.y,
      width: inner.width - browserW - Math.round(gap / 2),
      height: inner.height,
    };
    layouts.push({ id: browsers[0].id, ...padRect(browserRect, 2) });
    const termInner = padRect(termRect, 2);
    if (tCount === 3) {
      splitHorizontal(termInner, 3, gap).forEach((slot, i) => {
        layouts.push({ id: terminals[i].id, ...slot });
      });
    } else {
      gridSlots(termInner, terminals, { cols: 2, gap }).forEach((slot) => layouts.push(slot));
    }
    return { layouts, hiddenBrowserIds: hiddenBrowsers.map((b) => b.id) };
  }

  // Multiple browsers + terminals — 2-row: browsers top, terminals bottom
  const topH = Math.round(inner.height * 0.48);
  const bottomH = inner.height - topH - gap;
  const topRect = { x: inner.x, y: inner.y, width: inner.width, height: topH };
  const bottomRect = { x: inner.x, y: inner.y + topH + gap, width: inner.width, height: bottomH };
  splitHorizontal(topRect, bCount, gap).forEach((slot, i) => {
    layouts.push({ id: browsers[i].id, ...slot });
  });
  if (tCount === 1) {
    layouts.push({ id: terminals[0].id, ...bottomRect });
  } else if (tCount === 2) {
    splitHorizontal(bottomRect, 2, gap).forEach((slot, i) => {
      layouts.push({ id: terminals[i].id, ...slot });
    });
  } else {
    gridSlots(bottomRect, terminals, { cols: 2, gap }).forEach((slot) => layouts.push(slot));
  }

  return { layouts, hiddenBrowserIds: hiddenBrowsers.map((b) => b.id) };
}

/** Layout surfaces inside the region currently visible on screen (pan/zoom aware). */
export function computeAdaptiveVisibleLayout(visibleRegion, surfaces = [], options = {}) {
  if (!visibleRegion?.width || !visibleRegion?.height) {
    return { layouts: [], hiddenBrowserIds: [] };
  }
  return computeAdaptiveRectLayout(
    {
      x: visibleRegion.x ?? 0,
      y: visibleRegion.y ?? 0,
      width: visibleRegion.width,
      height: visibleRegion.height,
    },
    surfaces,
    options
  );
}

/**
 * Adaptive layout inside a view region — allocates space from what is present,
 * not fixed browser-left / terminal-right roles.
 * Returns [{ id, x, y, width, height }, ...] and { hiddenBrowserIds }.
 */
export function computeAdaptiveViewLayout(viewOrigin, surfaces = [], { gap = 12, pad = 6 } = {}) {
  const zones = computeViewZones(viewOrigin, { gap });
  return computeAdaptiveRectLayout(zones.bounds, surfaces, { gap, pad });
}

export function surfaceTypeLabel(type) {
  if (type === 'browser') return 'Browser';
  if (type === 'terminal') return 'Terminal';
  return 'Superficie';
}

/**
 * Snap zones + background guides derived from the current surfaces in view
 * (not fixed browser-left / terminal-right).
 */
export function computeAdaptiveSnapZones(viewOrigin, surfaces = [], { gap = 12, pad = 6 } = {}) {
  const zones = computeViewZones(viewOrigin, { gap });
  const inner = padRect(zones.bounds, pad);
  const { layouts } = computeAdaptiveViewLayout(viewOrigin, surfaces, { gap, pad });
  const surfaceById = new Map(surfaces.map((s) => [s.id, s]));

  const slots = layouts.map((layout, index) => {
    const surface = surfaceById.get(layout.id);
    const type = surface?.type || 'unknown';
    return {
      id: `slot-${index}`,
      surfaceId: layout.id,
      type,
      label: surfaceTypeLabel(type),
      rect: {
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
      },
    };
  });

  const splitLine =
    slots.length >= 2
      ? Math.round(slots[0].rect.x + slots[0].rect.width + gap / 2)
      : zones.splitLine;

  return {
    bounds: zones.bounds,
    slots,
    left: slots[0]?.rect || inner,
    right: slots[1]?.rect || slots[0]?.rect || inner,
    center: inner,
    splitLine,
    centerPoint: zones.centerPoint,
  };
}

/** Resolve a snap zone id (slot-0, left, center, …) to its layout rect. */
export function resolveSnapZoneRect(zones, zoneId) {
  if (!zones || !zoneId) return zones?.center || null;
  const slot = Array.isArray(zones.slots) ? zones.slots.find((s) => s.id === zoneId) : null;
  if (slot?.rect) return slot.rect;
  if (zones[zoneId]) return zones[zoneId];
  return zones.center || zones.left || null;
}

export function fitSurfaceToViewZone(zone, type, { pad = 12 } = {}) {
  const innerW = Math.max(200, zone.width - pad * 2);
  const innerH = Math.max(160, zone.height - pad * 2);
  return {
    x: Math.round(zone.x + pad),
    y: Math.round(zone.y + pad),
    width: Math.round(innerW),
    height: Math.round(innerH),
  };
}

export function isSwipeNavigationEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage?.getItem('devhub_pizarra_swipe_nav');
    return stored !== '0';
  } catch {
    return true;
  }
}

export function setSwipeNavigationEnabled(enabled) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem('devhub_pizarra_swipe_nav', enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

export const HORIZONTAL_WHEEL_NAV_THRESHOLD = 45;
export const HORIZONTAL_WHEEL_ACCUM_RESET_MS = 350;

/** Linux trackpads often emit DOM_DELTA_LINE — scale to pixel-equivalent deltas. */
export function normalizeWheelDelta(delta, deltaMode = 0) {
  const d = delta || 0;
  if (deltaMode === 1) return d * 16;
  if (deltaMode === 2) return d * 400;
  return d;
}

/** True when a trackpad/wheel event is primarily horizontal (view-switch gesture). */
export function shouldHorizontalWheelSwitchView(deltaX, deltaY) {
  const adx = Math.abs(deltaX);
  const ady = Math.abs(deltaY);
  if (adx < 5) return false;
  return adx > ady * 1.1;
}

/**
 * Accumulate horizontal wheel deltas; returns 'prev' | 'next' when threshold crossed.
 * Mutates `accumState` ({ x, t }).
 */
export function accumulateHorizontalWheelNav(accumState, deltaX, now = Date.now()) {
  if (!accumState || typeof deltaX !== 'number') return null;
  if (now - (accumState.t ?? 0) > HORIZONTAL_WHEEL_ACCUM_RESET_MS) {
    accumState.x = 0;
  }
  accumState.x = (accumState.x ?? 0) + deltaX;
  accumState.t = now;
  if (Math.abs(accumState.x) < HORIZONTAL_WHEEL_NAV_THRESHOLD) return null;
  const direction = accumState.x > 0 ? 'prev' : 'next';
  accumState.x = 0;
  return direction;
}

/** Resolve which workspace window a surface belongs to. */
export function getSurfaceViewId(surface, views = [], fallbackViewId = null) {
  const stored = surface?.pizarra?.viewId;
  if (stored && views.some((v) => v.id === stored)) return stored;
  if (fallbackViewId != null) return fallbackViewId;
  return null;
}

export function getViewOriginForSurface(surface, views = [], fallbackViewId = null) {
  const viewId = getSurfaceViewId(surface, views, fallbackViewId);
  const idx = getViewIndex(viewId || views[0]?.id, views);
  return getViewWorldOrigin(idx);
}

export function surfaceBelongsToView(surface, viewId, views = [], fallbackViewId = null) {
  if (!viewId) return true;
  const sid = getSurfaceViewId(surface, views, fallbackViewId);
  if (!sid) return false;
  return sid === viewId;
}

/** World-space bounds spanning N adjacent views (for pan clamp / minimap). */
export function getWorldBoundsForViewCount(viewCount = 1) {
  const n = Math.max(1, viewCount);
  const totalW = n * VIEW_WORLD_WIDTH + (n - 1) * VIEW_WORLD_GAP;
  return { x: 0, y: 0, width: totalW, height: VIEW_WORLD_HEIGHT };
}

/** Dev-split slots anchored to a fixed view region (not viewport). */
export function computeViewDevSplitSlots(viewOrigin) {
  const zones = computeViewZones(viewOrigin);
  return {
    browser: fitSurfaceToViewZone(zones.left, 'browser'),
    terminals: [fitSurfaceToViewZone(zones.right, 'terminal')],
  };
}

export function computeViewDevTrioSlots(viewOrigin) {
  const zones = computeViewZones(viewOrigin);
  const right = zones.right;
  const th = Math.max(140, Math.round((right.height - 14) / 2));
  return {
    browser: fitSurfaceToViewZone(zones.left, 'browser'),
    terminals: [
      { ...fitSurfaceToViewZone(right, 'terminal'), height: th },
      {
        x: Math.round(right.x + 12),
        y: Math.round(right.y + 12 + th + 14),
        width: Math.round(right.width - 24),
        height: th,
      },
    ],
  };
}

export function computeViewDualBrowserSlots(viewOrigin) {
  const zones = computeViewZones(viewOrigin);
  const left = fitSurfaceToViewZone(zones.left, 'browser');
  const right = fitSurfaceToViewZone(zones.right, 'browser');
  return { browsers: [left, right] };
}
