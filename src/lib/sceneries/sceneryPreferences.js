/**
 * Scenery Preferences — persistence and resolution for workspace wallpapers.
 *
 * Storage shape (localStorage key `devhub:scenery`):
 * {
 *   sceneryId: string | null,        // active scenery id (null = disabled)
 *   scope: 'both' | 'pizarra' | 'terminal',
 *   overlayOpacity: number 0..1,     // dim overlay for readability
 *   blur: number 0..20,              // backdrop blur in px
 *   terminalTint: number 0..1,       // dark glass tint over terminals (0 = clear)
 *   customImageUrl: string | null,   // user-provided image overrides catalog
 * }
 *
 * Live updates are broadcast via CustomEvent('devhub:scenery-changed')
 * so all mounted surfaces react instantly without remount.
 */

import { SCENERY_CATALOG, getSceneryById, isImageScenery } from './sceneryCatalog';

export const SCENERY_STORAGE_KEY = 'devhub:scenery';
export const SCENERY_CHANGED_EVENT = 'devhub:scenery-changed';
/**
 * Mirrors the resolved active wallpaper URL so the inline <script> in
 * app/layout.js can start the download before the JS bundle evaluates.
 */
export const SCENERY_WALLPAPER_URL_KEY = 'devhub:scenery:wallpaper-url';

export const SCENERY_SCOPES = {
  BOTH: 'both',
  PIZARRA: 'pizarra',
  TERMINAL: 'terminal',
};

const DEFAULT_SCENERY_PREFS = {
  sceneryId: null,
  scope: SCENERY_SCOPES.BOTH,
  overlayOpacity: 0.35,
  blur: 0,
  terminalTint: 0.3,
  customImageUrl: null,
};

/** Read current scenery preferences from localStorage (SSR-safe). */
export function readSceneryPrefs() {
  if (typeof window === 'undefined') return { ...DEFAULT_SCENERY_PREFS };
  try {
    const raw = window.localStorage.getItem(SCENERY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SCENERY_PREFS };
    const parsed = JSON.parse(raw);
    return normalizeSceneryPrefs(parsed);
  } catch {
    return { ...DEFAULT_SCENERY_PREFS };
  }
}

/** Normalize an arbitrary parsed value into valid prefs. */
export function normalizeSceneryPrefs(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SCENERY_PREFS };

  const scope = Object.values(SCENERY_SCOPES).includes(value.scope)
    ? value.scope
    : DEFAULT_SCENERY_PREFS.scope;

  const overlayOpacity =
    typeof value.overlayOpacity === 'number'
      ? Math.max(0, Math.min(1, value.overlayOpacity))
      : DEFAULT_SCENERY_PREFS.overlayOpacity;

  const blur =
    typeof value.blur === 'number'
      ? Math.max(0, Math.min(20, value.blur))
      : DEFAULT_SCENERY_PREFS.blur;

  const terminalTint =
    typeof value.terminalTint === 'number'
      ? Math.max(0, Math.min(1, value.terminalTint))
      : DEFAULT_SCENERY_PREFS.terminalTint;

  return {
    sceneryId: typeof value.sceneryId === 'string' ? value.sceneryId : null,
    scope,
    overlayOpacity,
    blur,
    terminalTint,
    customImageUrl:
      typeof value.customImageUrl === 'string' && value.customImageUrl
        ? value.customImageUrl
        : null,
  };
}

/** Persist prefs and broadcast the change event. Returns the normalized prefs. */
export function writeSceneryPrefs(prefs) {
  const normalized = normalizeSceneryPrefs(prefs);
  if (typeof window === 'undefined') return normalized;
  try {
    window.localStorage.setItem(SCENERY_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
  window.dispatchEvent(new CustomEvent(SCENERY_CHANGED_EVENT, { detail: normalized }));
  return normalized;
}

/** Convenience: set only the active scenery id (preserving other prefs). */
export function setActiveScenery(sceneryId) {
  const current = readSceneryPrefs();
  return writeSceneryPrefs({ ...current, sceneryId });
}

/** Convenience: set scope. */
export function setSceneryScope(scope) {
  const current = readSceneryPrefs();
  return writeSceneryPrefs({ ...current, scope });
}

/** Convenience: set overlay opacity. */
export function setSceneryOverlayOpacity(overlayOpacity) {
  const current = readSceneryPrefs();
  return writeSceneryPrefs({ ...current, overlayOpacity });
}

/** Convenience: set blur. */
export function setSceneryBlur(blur) {
  const current = readSceneryPrefs();
  return writeSceneryPrefs({ ...current, blur });
}

/** Convenience: set terminal glass tint intensity. */
export function setSceneryTerminalTint(terminalTint) {
  const current = readSceneryPrefs();
  return writeSceneryPrefs({ ...current, terminalTint });
}

/**
 * Resolve the terminal glass tint color (dark rgba) applied over the xterm
 * layers while a scenery is active. Higher values hide more of the wallpaper
 * behind terminals; 0 keeps the current fully-clear glass.
 */
export function resolveTerminalTintColor(prefs) {
  const tint =
    prefs && typeof prefs.terminalTint === 'number'
      ? Math.max(0, Math.min(1, prefs.terminalTint))
      : DEFAULT_SCENERY_PREFS.terminalTint;
  return `rgba(8, 10, 16, ${tint})`;
}

/**
 * Resolve the CSS style object for a given scenery definition + prefs.
 * Returns null when scenery is disabled or not applicable for the scope.
 *
 * @param {object} prefs - normalized scenery prefs
 * @param {'pizarra'|'terminal'} targetScope - the surface asking for styles
 * @returns {object|null} CSS properties or null
 */
export function resolveSceneryStyle(prefs, targetScope = 'pizarra') {
  if (!prefs || !prefs.sceneryId) return null;

  // Scope gate: 'both' applies everywhere; otherwise must match.
  if (prefs.scope !== SCENERY_SCOPES.BOTH && prefs.scope !== targetScope) return null;

  // Custom image takes priority over catalog scenery layers. `customImageUrl`
  // may be a remote URL or a data-URL produced by the in-app file picker.
  if (prefs.customImageUrl) {
    return {
      backgroundColor: '#0e1117',
      backgroundImage: `url(${prefs.customImageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }

  const scenery = getSceneryById(prefs.sceneryId);
  if (!scenery) return null;

  // Bundled image scenery: render the packaged wallpaper with cover sizing.
  if (isImageScenery(scenery)) {
    return {
      backgroundColor: scenery.base,
      backgroundImage: `url(${scenery.src})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }

  return {
    backgroundColor: scenery.base,
    backgroundImage: scenery.layers.join(', '),
    backgroundSize: 'auto',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

/** Whether scenery is active for a given target scope. */
export function isSceneryActiveForScope(prefs, targetScope) {
  return resolveSceneryStyle(prefs, targetScope) !== null;
}

/**
 * Build the overlay style (dim + blur) applied on top of the scenery
 * for content readability. Returns null when no overlay needed.
 */
export function resolveSceneryOverlayStyle(prefs) {
  if (!prefs || !prefs.sceneryId) return null;
  const opacity = prefs.overlayOpacity ?? DEFAULT_SCENERY_PREFS.overlayOpacity;
  const blur = prefs.blur ?? 0;

  if (opacity <= 0 && blur <= 0) return null;

  return {
    backgroundColor: `rgba(8, 10, 16, ${opacity})`,
    ...(blur > 0 ? { backdropFilter: `blur(${blur}px)` } : {}),
  };
}

/* ── Wallpaper preloading ────────────────────────────────────────────── */

/**
 * Fire-and-forget image preload: warms the browser/HTTP cache so the
 * wallpaper is already local when the terminals first render. No-op without
 * a DOM and never throws — preloading is a pure optimization.
 */
export function preloadSceneryImage(url) {
  if (!url || typeof url !== 'string') return;
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;
  try {
    const img = new Image();
    img.src = url;
  } catch {
    /* non-fatal */
  }
}

/** Resolve the wallpaper URL for prefs (custom image or bundled image scenery). */
function resolveActiveWallpaperUrl(prefs) {
  if (!prefs || !prefs.sceneryId) return null;
  if (prefs.customImageUrl) return prefs.customImageUrl;
  const scenery = getSceneryById(prefs.sceneryId);
  if (scenery && isImageScenery(scenery)) return scenery.src;
  return null;
}

/**
 * Resolve the active wallpaper URL for the given (or stored) prefs, persist
 * it under SCENERY_WALLPAPER_URL_KEY for the early <link rel="preload"> in
 * app/layout.js, and warm the image cache. Returns the URL (or null).
 */
export function preloadActiveSceneryPrefs(prefs) {
  const resolved = prefs ? normalizeSceneryPrefs(prefs) : readSceneryPrefs();
  const url = resolveActiveWallpaperUrl(resolved);
  if (typeof window !== 'undefined') {
    try {
      if (url) window.localStorage.setItem(SCENERY_WALLPAPER_URL_KEY, url);
      else window.localStorage.removeItem(SCENERY_WALLPAPER_URL_KEY);
    } catch {
      /* storage unavailable — non-fatal */
    }
  }
  if (url) preloadSceneryImage(url);
  return url;
}

/** Warm the cache for every bundled image wallpaper in the catalog. */
export function warmAllBundledWallpapers() {
  try {
    SCENERY_CATALOG.filter((scenery) => isImageScenery(scenery)).forEach((scenery) =>
      preloadSceneryImage(scenery.src)
    );
  } catch {
    /* non-fatal */
  }
}
