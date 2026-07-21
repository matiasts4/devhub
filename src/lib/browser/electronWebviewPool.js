/**
 * Warm cache of Electron <webview> elements.
 *
 * Strategy (normal ↔ pizarra survival):
 * - Guest is a real child of the active React host (absolute fill) — reliable paint.
 * - NEVER reparent a warm <webview> between hosts (Electron blanks/kills the guest).
 * - On host change: destroy + recreate the element (same partition + lastUrl).
 *   Session cookies survive via persist: partition; page reloads once — acceptable.
 * - claim/release with delayed park so the next host claims before we park.
 * - Themed guest scrollbars via insertCSS (SPA CSS cannot style guest chrome).
 */

const MAX_POOL_SIZE = 8;
const PARK_HOST_ID = 'devhub-electron-webview-park';
const READY_WAIT_MS = 10000;
/** Grace so the next host (pizarra ↔ workspace) can claim before park. */
const RELEASE_PARK_DELAY_MS = 80;

/** URLs that must not clobber a warm guest during dock-state races. */
const PLACEHOLDER_URLS = new Set([
  '',
  'about:blank',
  'http://localhost:3200/',
  'http://localhost:3200',
  'http://localhost:3000/',
  'http://localhost:3000',
  'http://127.0.0.1:3000/',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3200/',
  'http://127.0.0.1:3200',
]);

/** @type {Map<string, PoolEntry>} */
const pool = new Map();

/**
 * @typedef {object} PoolEntry
 * @property {HTMLElement} el
 * @property {string} partition
 * @property {string} lastUrl
 * @property {number} lastUsedTs
 * @property {boolean} parked
 * @property {boolean} domReady
 * @property {Promise<void>|null} navChain
 * @property {string|null} pendingUrl
 * @property {Set<Function>} listenersCleanup
 * @property {Promise<boolean>|null} readyWait
 * @property {string|null} ownerId
 * @property {ReturnType<typeof setTimeout>|null} parkTimer
 * @property {boolean} needsForceRecover
 * @property {boolean} hasLoadedOnce
 * @property {boolean} loadFailed
 * @property {number} navGeneration
 * @property {number} generation
 */

/**
 * Normalize URL for equality checks (trailing slash, lowercase host).
 * @param {string} url
 * @returns {string}
 */
export function normalizeWebviewUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    let path = u.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}${u.hash}`;
  } catch {
    return raw.replace(/\/+$/, '') || raw;
  }
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function webviewUrlsEqual(a, b) {
  if (a === b) return true;
  const na = normalizeWebviewUrl(a);
  const nb = normalizeWebviewUrl(b);
  return Boolean(na) && na === nb;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isPlaceholderWebviewUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return true;
  if (PLACEHOLDER_URLS.has(raw)) return true;
  return PLACEHOLDER_URLS.has(normalizeWebviewUrl(raw));
}

function ensureParkHost() {
  if (typeof document === 'undefined') return null;
  let host = document.getElementById(PARK_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = PARK_HOST_ID;
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = [
      'position:fixed',
      'left:-20000px',
      'top:0',
      'width:1200px',
      'height:800px',
      'overflow:hidden',
      'opacity:0',
      'pointer-events:none',
      'z-index:-1',
    ].join(';');
    document.body.appendChild(host);
  }
  return host;
}

/**
 * Resolve theme-ish colors from the SPA host for guest scrollbar injection.
 * @returns {{ track: string, thumb: string, thumbHover: string, corner: string }}
 */
export function resolveGuestScrollbarTheme() {
  const fallback = {
    track: '#0d1520',
    thumb: '#3d4f66',
    thumbHover: 'rgba(88, 166, 255, 0.55)',
    corner: '#0d1520',
  };
  if (typeof document === 'undefined' || !document.documentElement) return fallback;
  try {
    const cs = getComputedStyle(document.documentElement);
    const surface = (cs.getPropertyValue('--surface-app') || '').trim();
    const border = (cs.getPropertyValue('--border-subtle') || '').trim();
    const accentRgb = (cs.getPropertyValue('--accent-rgb') || '88, 166, 255').trim();
    const raised = (cs.getPropertyValue('--surface-raised') || '').trim();
    return {
      track: surface || raised || fallback.track,
      thumb: border || fallback.thumb,
      thumbHover: `rgba(${accentRgb || '88, 166, 255'}, 0.55)`,
      corner: surface || fallback.corner,
    };
  } catch {
    return fallback;
  }
}

/**
 * @param {{ track?: string, thumb?: string, thumbHover?: string, corner?: string }} [theme]
 * @returns {string}
 */
export function buildGuestScrollbarCss(theme = resolveGuestScrollbarTheme()) {
  const track = theme.track || '#0d1520';
  const thumb = theme.thumb || '#3d4f66';
  const thumbHover = theme.thumbHover || 'rgba(88, 166, 255, 0.55)';
  const corner = theme.corner || track;
  return `
html {
  color-scheme: dark;
  scrollbar-width: thin;
  scrollbar-color: ${thumb} ${track};
}
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
  background: ${track};
}
::-webkit-scrollbar-track {
  background: ${track};
  border-radius: 8px;
}
::-webkit-scrollbar-thumb {
  background: ${thumb};
  border-radius: 8px;
  border: 2px solid ${track};
  background-clip: padding-box;
}
::-webkit-scrollbar-thumb:hover {
  background: ${thumbHover};
  border: 2px solid ${track};
  background-clip: padding-box;
}
::-webkit-scrollbar-corner {
  background: ${corner};
}
`.trim();
}

/**
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export function injectElectronWebviewChromeCss(el) {
  if (!el || typeof el.insertCSS !== 'function') return false;
  try {
    const css = buildGuestScrollbarCss();
    const result = el.insertCSS(css);
    if (result && typeof result.then === 'function') {
      result.catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

function createWebviewElement(partition) {
  const el = document.createElement('webview');
  el.setAttribute('partition', partition);
  el.setAttribute('allowpopups', 'true');
  el.setAttribute('webpreferences', 'contextIsolation=yes, nativeWindowOpen=yes');
  // Electron <webview> often ignores % height and collapses to a small intrinsic box
  // at the top of the host (content "recortado" + black below). Pixel sizing via
  // syncWebviewPixelSize + display:flex is the reliable fill.
  el.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
    'width:100%',
    'height:100%',
    'min-width:0',
    'min-height:0',
    'display:flex',
    'border:none',
    'background:#0a111d',
  ].join(';');
  el.dataset.testid = 'electron-webview-browser';
  return el;
}

function stopSizeSync(entry) {
  if (!entry) return;
  if (entry.sizeRo) {
    try {
      entry.sizeRo.disconnect();
    } catch {
      /* ignore */
    }
    entry.sizeRo = null;
  }
  if (entry.sizeWinHandler) {
    try {
      window.removeEventListener('resize', entry.sizeWinHandler);
    } catch {
      /* ignore */
    }
    entry.sizeWinHandler = null;
  }
  entry.sizeHost = null;
}

/**
 * Force the <webview> box to host pixel bounds.
 * Percentage CSS routinely fails for Electron webview → top-only content + black fill.
 *
 * @param {PoolEntry} entry
 * @param {HTMLElement} hostEl
 * @returns {{ width: number, height: number }}
 */
export function syncWebviewPixelSize(entry, hostEl) {
  if (!entry?.el || !hostEl) return { width: 0, height: 0 };
  let width = 0;
  let height = 0;
  try {
    const r = hostEl.getBoundingClientRect();
    width = Math.max(0, Math.round(r.width));
    height = Math.max(0, Math.round(r.height));
  } catch {
    return { width: 0, height: 0 };
  }

  const el = entry.el;
  // Always pin absolute top-left; never rely on inset/% alone.
  el.style.position = 'absolute';
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.margin = '0';
  el.style.display = 'flex';
  el.style.border = 'none';

  if (width >= 2 && height >= 2) {
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.minWidth = `${width}px`;
    el.style.minHeight = `${height}px`;
    const wasZero = entry.lastPixelSize && (entry.lastPixelSize.w < 2 || entry.lastPixelSize.h < 2);
    entry.lastPixelSize = { w: width, h: height };
    // Guest first painted while 0×0 — force a soft reload once size is real.
    if (wasZero && entry.hasLoadedOnce === false && entry.lastUrl && !isPlaceholderWebviewUrl(entry.lastUrl)) {
      entry.pendingUrl = entry.lastUrl;
    }
  } else {
    entry.lastPixelSize = { w: width, h: height };
  }
  return { width, height };
}

/**
 * Keep webview pixel size locked to the React host for the lifetime of the attach.
 * @param {string} cacheKey
 * @param {PoolEntry} entry
 * @param {HTMLElement} hostEl
 */
function startSizeSync(cacheKey, entry, hostEl) {
  stopSizeSync(entry);
  entry.sizeHost = hostEl;

  const apply = () => {
    if (entry.sizeHost !== hostEl || !entry.el) return;
    const prev = entry.lastPixelSize || { w: 0, h: 0 };
    const { width, height } = syncWebviewPixelSize(entry, hostEl);
    // Became non-zero: guest may have loaded into a 0×0 box — re-navigate once.
    const becameReal = (prev.w < 2 || prev.h < 2) && width >= 2 && height >= 2;
    if (
      (becameReal || (width >= 2 && height >= 2 && entry.pendingUrl && !entry.hasLoadedOnce)) &&
      entry.pendingUrl &&
      isGuestAttached(entry) &&
      !entry._sizeNavScheduled
    ) {
      const url = entry.pendingUrl;
      entry._sizeNavScheduled = true;
      void navigateElectronWebview(cacheKey, url, { force: true }).finally(() => {
        entry._sizeNavScheduled = false;
      });
    }
  };

  apply();

  if (typeof ResizeObserver !== 'undefined') {
    try {
      entry.sizeRo = new ResizeObserver(() => {
        apply();
      });
      entry.sizeRo.observe(hostEl);
    } catch {
      entry.sizeRo = null;
    }
  }

  if (typeof window !== 'undefined') {
    entry.sizeWinHandler = () => apply();
    window.addEventListener('resize', entry.sizeWinHandler);
  }

  // Layout often settles a frame or two after React mount (pizarra card).
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  setTimeout(apply, 50);
  setTimeout(apply, 200);
}

function touch(entry) {
  entry.lastUsedTs = Date.now();
}

function readGuestUrl(entry) {
  try {
    if (typeof entry.el.getURL === 'function') {
      return String(entry.el.getURL() || '');
    }
  } catch {
    /* guest not ready */
  }
  return '';
}

function isGuestAttached(entry) {
  const el = entry?.el;
  if (!el) return false;
  if (typeof el.isConnected === 'boolean') return el.isConnected;
  return Boolean(el.parentElement);
}

function clearParkTimer(entry) {
  if (entry?.parkTimer) {
    clearTimeout(entry.parkTimer);
    entry.parkTimer = null;
  }
}

function clearListeners(entry) {
  if (!entry?.listenersCleanup) return;
  for (const fn of entry.listenersCleanup) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  entry.listenersCleanup.clear();
}

/**
 * Ready for navigation:
 * - Cold guest: only needs to be attached.
 * - Warm guest: attached + dom-ready.
 *
 * @param {PoolEntry} entry
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export function waitForGuestReady(entry, timeoutMs = READY_WAIT_MS) {
  if (!entry?.el) return Promise.resolve(false);

  if (!entry.hasLoadedOnce && !entry.domReady) {
    if (isGuestAttached(entry)) return Promise.resolve(true);
  }

  if (entry.domReady && isGuestAttached(entry)) return Promise.resolve(true);

  if (entry.readyWait) return entry.readyWait;

  entry.readyWait = new Promise((resolve) => {
    const start = Date.now();
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      entry.readyWait = null;
      try {
        entry.el.removeEventListener('dom-ready', onDomReady);
      } catch {
        /* ignore */
      }
      resolve(Boolean(ok));
    };

    const onDomReady = () => {
      entry.domReady = true;
      if (isGuestAttached(entry)) finish(true);
    };

    try {
      entry.el.addEventListener('dom-ready', onDomReady);
    } catch {
      /* ignore */
    }

    const tick = () => {
      if (settled) return;
      if (!entry.hasLoadedOnce && isGuestAttached(entry)) {
        finish(true);
        return;
      }
      if (entry.domReady && isGuestAttached(entry)) {
        finish(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        finish(false);
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });

  return entry.readyWait;
}

function wireGuestListeners(key, entry) {
  const el = entry.el;

  const onDomReady = () => {
    entry.domReady = true;
    injectElectronWebviewChromeCss(el);
    if (entry.pendingUrl && isGuestAttached(entry)) {
      const url = entry.pendingUrl;
      entry.pendingUrl = null;
      void navigateElectronWebview(key, url, { force: true });
    }
  };
  el.addEventListener('dom-ready', onDomReady);
  entry.listenersCleanup.add(() => el.removeEventListener('dom-ready', onDomReady));

  const onDidNavigate = (e) => {
    const url = e?.url || readGuestUrl(entry);
    if (url && url !== 'about:blank') {
      entry.lastUrl = url;
      entry.hasLoadedOnce = true;
      entry.loadFailed = false;
    }
    injectElectronWebviewChromeCss(el);
  };
  el.addEventListener('did-navigate', onDidNavigate);
  el.addEventListener('did-navigate-in-page', onDidNavigate);
  entry.listenersCleanup.add(() => {
    el.removeEventListener('did-navigate', onDidNavigate);
    el.removeEventListener('did-navigate-in-page', onDidNavigate);
  });

  const onDidStop = () => {
    entry.hasLoadedOnce = true;
    entry.loadFailed = false;
    injectElectronWebviewChromeCss(el);
  };
  el.addEventListener('did-stop-loading', onDidStop);
  entry.listenersCleanup.add(() => el.removeEventListener('did-stop-loading', onDidStop));

  const onFailLoad = (e) => {
    const code = e?.errorCode;
    if (code === -3 || code === '-3') return;
    if (code === -102 || code === -105 || code === -106) {
      entry.loadFailed = true;
      return;
    }
    entry.loadFailed = true;
  };
  el.addEventListener('did-fail-load', onFailLoad);
  entry.listenersCleanup.add(() => el.removeEventListener('did-fail-load', onFailLoad));
}

function evictIfNeeded(keepKey) {
  if (pool.size <= MAX_POOL_SIZE) return;
  const candidates = [...pool.entries()]
    .filter(([key, e]) => e.parked && key !== keepKey)
    .sort((a, b) => a[1].lastUsedTs - b[1].lastUsedTs);
  while (pool.size > MAX_POOL_SIZE && candidates.length) {
    const [key] = candidates.shift();
    destroyElectronWebview(key);
  }
}

/**
 * Hard-destroy guest DOM + pool entry (listeners cleared).
 * @param {string} cacheKey
 * @returns {{ partition: string, lastUrl: string }|null}
 */
function takeEntrySnapshot(cacheKey) {
  const key = String(cacheKey || '');
  const entry = pool.get(key);
  if (!entry) return null;
  const snap = {
    partition: entry.partition,
    lastUrl: entry.lastUrl || entry.pendingUrl || '',
    generation: (entry.generation || 0) + 1,
  };
  clearParkTimer(entry);
  stopSizeSync(entry);
  clearListeners(entry);
  try {
    entry.el.remove();
  } catch {
    /* ignore */
  }
  pool.delete(key);
  return snap;
}

/**
 * Destroy + create a fresh <webview> for this key (same partition).
 * Prefer this over reparenting — Electron guest paint dies after reparents.
 *
 * @param {string} cacheKey
 * @param {{ partition?: string, lastUrl?: string }} [opts]
 * @returns {PoolEntry}
 */
export function recreateElectronWebview(cacheKey, opts = {}) {
  const key = String(cacheKey || '');
  if (!key) throw new Error('recreateElectronWebview: cacheKey required');
  const prev = pool.get(key);
  const partition = opts.partition || prev?.partition || 'persist:devhub-browser-dock';
  const lastUrl =
    opts.lastUrl ||
    prev?.lastUrl ||
    prev?.pendingUrl ||
    (typeof prev?.el?.getAttribute === 'function' ? prev.el.getAttribute('src') : '') ||
    '';
  const generation = (prev?.generation || 0) + 1;
  const ownerId = opts.ownerId !== undefined ? opts.ownerId : prev?.ownerId || null;

  takeEntrySnapshot(key);

  const entry = acquireElectronWebview(key, partition);
  entry.generation = generation;
  entry.needsForceRecover = true;
  entry.ownerId = ownerId;
  if (lastUrl && !isPlaceholderWebviewUrl(lastUrl)) {
    entry.lastUrl = lastUrl;
    entry.pendingUrl = lastUrl;
  }
  return entry;
}

/**
 * Acquire (or create) a webview for this panel cache key.
 * @param {string} cacheKey
 * @param {string} partition
 * @returns {PoolEntry}
 */
export function acquireElectronWebview(cacheKey, partition) {
  const key = String(cacheKey || '');
  if (!key) throw new Error('acquireElectronWebview: cacheKey required');

  let entry = pool.get(key);
  if (entry) {
    entry.parked = false;
    touch(entry);
    return entry;
  }

  const el = createWebviewElement(partition);
  entry = {
    el,
    partition,
    lastUrl: '',
    lastUsedTs: Date.now(),
    parked: false,
    domReady: false,
    navChain: null,
    pendingUrl: null,
    listenersCleanup: new Set(),
    readyWait: null,
    loadFailed: false,
    hasLoadedOnce: false,
    ownerId: null,
    parkTimer: null,
    needsForceRecover: false,
    navGeneration: 0,
    generation: 0,
  };

  wireGuestListeners(key, entry);
  pool.set(key, entry);
  evictIfNeeded(key);
  return entry;
}

/**
 * Mark parked without moving DOM (keep-alive workspace shell still mounted).
 * @param {string} cacheKey
 */
export function markElectronWebviewParked(cacheKey) {
  const entry = pool.get(String(cacheKey || ''));
  if (!entry) return;
  entry.parked = true;
  touch(entry);
}

/**
 * Park into off-screen host only when no owner. Used after release grace.
 * @param {string} cacheKey
 */
export function parkElectronWebview(cacheKey) {
  const entry = pool.get(String(cacheKey || ''));
  if (!entry) return;
  clearParkTimer(entry);
  if (entry.ownerId) {
    entry.parked = false;
    return;
  }
  entry.parked = true;
  touch(entry);
  stopSizeSync(entry);
  const host = ensureParkHost();
  // Parking is fine — next claim will RECREATE instead of reparenting out of park.
  if (host && entry.el.parentElement !== host) {
    try {
      host.appendChild(entry.el);
    } catch {
      /* ignore */
    }
    entry.domReady = false;
    entry.readyWait = null;
  }
  evictIfNeeded(cacheKey);
}

/**
 * Attach guest as child of React host.
 * If guest already lives under another host (or park), recreate — never reparent.
 *
 * @param {string} cacheKey
 * @param {HTMLElement|null} hostEl
 * @param {{ forceRecreate?: boolean }} [opts]
 */
export function attachElectronWebview(cacheKey, hostEl, opts = {}) {
  const key = String(cacheKey || '');
  let entry = pool.get(key);
  if (!entry || !hostEl) return;

  clearParkTimer(entry);
  entry.parked = false;
  touch(entry);

  const parent = entry.el.parentElement;
  const mustRecreate =
    Boolean(opts.forceRecreate) ||
    Boolean(entry.needsForceRecover && parent && parent !== hostEl) ||
    (Boolean(parent) && parent !== hostEl) ||
    (Boolean(parent) && !entry.el.isConnected);

  if (mustRecreate) {
    const url = entry.lastUrl || entry.pendingUrl || '';
    const partition = entry.partition;
    const ownerId = entry.ownerId;
    entry = recreateElectronWebview(key, { partition, lastUrl: url, ownerId });
  }

  if (entry.el.parentElement !== hostEl) {
    try {
      hostEl.appendChild(entry.el);
    } catch {
      /* ignore */
    }
  }

  entry.needsForceRecover = false;
  entry.parked = false;

  // Pixel-lock size immediately + continuously (fixes top-only crop / black body).
  startSizeSync(key, entry, hostEl);
  const { width, height } = syncWebviewPixelSize(entry, hostEl);

  // Restore navigation after fresh create or first attach.
  // Prefer waiting for a real non-zero box so the guest gets a correct viewport.
  const desired = entry.pendingUrl || entry.lastUrl || '';
  if (desired && !isPlaceholderWebviewUrl(desired)) {
    if (width >= 2 && height >= 2) {
      void navigateElectronWebview(key, desired, { force: true });
    } else {
      // size sync will navigate once RO reports a real box
      entry.pendingUrl = desired;
    }
  } else {
    injectElectronWebviewChromeCss(entry.el);
  }
}

/**
 * Claim ownership for a React host (workspace dock or pizarra card).
 * @param {string} cacheKey
 * @param {HTMLElement|null} hostEl
 * @param {string} ownerId
 * @param {string} [partition]
 * @returns {PoolEntry|null}
 */
export function claimElectronWebview(cacheKey, hostEl, ownerId, partition = 'persist:devhub-browser-dock') {
  const key = String(cacheKey || '');
  if (!key || !ownerId) return null;
  let entry = acquireElectronWebview(key, partition);
  clearParkTimer(entry);
  entry.ownerId = String(ownerId);
  entry.parked = false;
  touch(entry);
  if (hostEl) {
    attachElectronWebview(key, hostEl);
    entry = pool.get(key) || entry;
    // attach may recreate — re-assert ownership on the live entry.
    entry.ownerId = String(ownerId);
    entry.parked = false;
  }
  return entry;
}

/**
 * Release ownership. Parks after a short delay if nobody claims.
 * @param {string} cacheKey
 * @param {string} ownerId
 */
export function releaseElectronWebview(cacheKey, ownerId) {
  const key = String(cacheKey || '');
  const entry = pool.get(key);
  if (!entry) return;
  if (entry.ownerId && entry.ownerId !== String(ownerId || '')) {
    return;
  }
  entry.ownerId = null;
  clearParkTimer(entry);
  entry.parkTimer = setTimeout(() => {
    entry.parkTimer = null;
    if (entry.ownerId) return;
    // Still under a live connected host (keep-alive) — leave in place.
    if (entry.el?.isConnected && entry.el.parentElement) {
      const park = document.getElementById(PARK_HOST_ID);
      if (entry.el.parentElement !== park) {
        entry.parked = true;
        return;
      }
    }
    parkElectronWebview(key);
  }, RELEASE_PARK_DELAY_MS);
}

/**
 * @param {string} cacheKey
 */
export function destroyElectronWebview(cacheKey) {
  takeEntrySnapshot(cacheKey);
}

/**
 * @param {PoolEntry} entry
 * @param {string} next
 * @param {{ force?: boolean }} opts
 * @returns {{ skip: boolean, reason?: string }}
 */
export function shouldSkipWebviewNavigation(entry, next, opts = {}) {
  if (!entry || opts.force) return { skip: false };
  const target = String(next || '').trim();
  if (!target) return { skip: true, reason: 'empty-url' };

  const current = readGuestUrl(entry);
  if (current && webviewUrlsEqual(current, target)) {
    entry.lastUrl = current;
    return { skip: true, reason: 'already-there-getURL' };
  }

  if (
    webviewUrlsEqual(entry.lastUrl, target) &&
    current &&
    current !== 'about:blank' &&
    !entry.loadFailed
  ) {
    return { skip: true, reason: 'already-there-lastUrl' };
  }

  if (isPlaceholderWebviewUrl(target)) {
    if (current && !isPlaceholderWebviewUrl(current)) {
      return { skip: true, reason: 'keep-warm-over-placeholder' };
    }
    if (
      entry.lastUrl &&
      !isPlaceholderWebviewUrl(entry.lastUrl) &&
      !entry.loadFailed &&
      entry.hasLoadedOnce
    ) {
      return { skip: true, reason: 'keep-warm-over-placeholder-lastUrl' };
    }
  }

  return { skip: false };
}

/**
 * @param {PoolEntry} entry
 * @param {string} target
 * @param {{ force?: boolean }} [opts]
 */
async function performGuestNavigation(entry, target, opts = {}) {
  const el = entry.el;
  entry.navGeneration = (entry.navGeneration || 0) + 1;
  const gen = entry.navGeneration;

  const isSuperseded = () => gen !== entry.navGeneration;

  const markOk = (reason) => {
    if (isSuperseded()) return { ok: true, aborted: true, reason: 'superseded' };
    entry.loadFailed = false;
    entry.lastUrl = target;
    if (reason === 'reload' || reason === 'loadURL' || reason === 'already-live' || reason === 'src') {
      // src marks intent; hasLoadedOnce also set on did-stop-loading
      if (reason !== 'src') entry.hasLoadedOnce = true;
    }
    return { ok: true, reason };
  };

  try {
    const live = typeof el.getURL === 'function' ? String(el.getURL() || '') : '';
    if (!opts.force && live && webviewUrlsEqual(live, target)) {
      return markOk('already-live');
    }
  } catch {
    /* guest mid-flight */
  }

  const prevSrc = el.getAttribute('src') || '';
  const sameSrc = webviewUrlsEqual(prevSrc, target);

  // Cold first load OR src change: setAttribute is the reliable path.
  if (!entry.hasLoadedOnce || !sameSrc || opts.force) {
    try {
      if (!isGuestAttached(entry)) {
        entry.loadFailed = true;
        return { ok: false, reason: 'not-attached', retriable: true };
      }
      // Force same-URL: toggle src to guarantee a load after recreate.
      if (opts.force && sameSrc) {
        try {
          el.removeAttribute('src');
        } catch {
          /* ignore */
        }
      }
      el.setAttribute('src', target);
      return markOk('src');
    } catch (err) {
      const msg = String(err?.message || err || '');
      entry.loadFailed = true;
      return { ok: false, reason: 'src-failed', retriable: true, message: msg };
    }
  }

  if (typeof el.reload === 'function') {
    try {
      el.reload();
      return markOk('reload');
    } catch {
      /* fall through */
    }
  }

  if (typeof el.loadURL === 'function') {
    try {
      await el.loadURL(target);
      return markOk('loadURL');
    } catch (err) {
      if (isSuperseded()) return { ok: true, aborted: true, reason: 'superseded' };
      const msg = String(err?.message || err || '');
      const code = err?.code || err?.errno;
      if (
        code === 'ERR_ABORTED' ||
        code === -3 ||
        /ERR_ABORTED|abort|\(-3\)/i.test(msg)
      ) {
        entry.loadFailed = false;
        entry.lastUrl = target;
        return { ok: true, aborted: true, reason: 'aborted' };
      }
      if (/must be attached to the DOM|dom-ready/i.test(msg)) {
        entry.domReady = false;
        entry.loadFailed = true;
        return { ok: false, reason: 'not-ready', retriable: true, message: msg };
      }
      try {
        el.removeAttribute('src');
        el.setAttribute('src', target);
        return markOk('src-retry');
      } catch {
        entry.loadFailed = true;
        return { ok: false, reason: 'err-failed', message: msg, retriable: true };
      }
    }
  }

  entry.loadFailed = true;
  return { ok: false, reason: 'no-navigate-api', retriable: true };
}

/**
 * @param {string} cacheKey
 * @param {string} url
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, aborted?: boolean, reason?: string }>}
 */
export function navigateElectronWebview(cacheKey, url, opts = {}) {
  const entry = pool.get(String(cacheKey || ''));
  if (!entry) return Promise.resolve({ ok: false, reason: 'not-in-pool' });

  const next = String(url || '').trim();
  if (!next) return Promise.resolve({ ok: false, reason: 'empty-url' });

  touch(entry);

  const gate = shouldSkipWebviewNavigation(entry, next, opts);
  if (gate.skip) {
    return Promise.resolve({ ok: true, reason: gate.reason || 'already-there' });
  }

  entry.pendingUrl = next;
  entry.loadFailed = false;

  const run = async () => {
    if (entry.navChain) {
      try {
        await entry.navChain;
      } catch {
        /* ignore */
      }
    }

    const target = entry.pendingUrl || next;
    if (!target) return { ok: true, aborted: true };

    let ready = await waitForGuestReady(entry, READY_WAIT_MS);
    if (!ready) {
      entry.pendingUrl = target;
      return { ok: false, reason: 'guest-not-ready' };
    }

    const finalTarget = entry.pendingUrl || target;
    if (entry.pendingUrl && entry.pendingUrl !== finalTarget) {
      return { ok: true, aborted: true, reason: 'superseded' };
    }
    entry.pendingUrl = null;

    const recheck = shouldSkipWebviewNavigation(entry, finalTarget, opts);
    if (recheck.skip) {
      return { ok: true, reason: recheck.reason || 'already-there' };
    }

    let result = await performGuestNavigation(entry, finalTarget, opts);

    if (!result.ok && result.retriable) {
      entry.domReady = false;
      entry.pendingUrl = finalTarget;
      await new Promise((r) => setTimeout(r, 120));
      ready = await waitForGuestReady(entry, READY_WAIT_MS);
      if (ready) {
        const retryTarget = entry.pendingUrl || finalTarget;
        entry.pendingUrl = null;
        result = await performGuestNavigation(entry, retryTarget, { force: true });
      }
    }

    if (
      !result.ok &&
      result.reason !== 'connection-refused' &&
      result.reason !== 'guest-not-ready' &&
      result.reason !== 'aborted' &&
      result.reason !== 'superseded'
    ) {
      console.warn(
        '[electronWebviewPool] navigation failed',
        finalTarget,
        result.message || result.reason
      );
    }
    return result;
  };

  const p = run();
  entry.navChain = p.then(
    () => undefined,
    () => undefined
  );
  return p;
}

export function getElectronWebviewEntry(cacheKey) {
  return pool.get(String(cacheKey || '')) || null;
}

export function getElectronWebviewPoolStats() {
  return {
    size: pool.size,
    max: MAX_POOL_SIZE,
    keys: [...pool.keys()],
    parked: [...pool.values()].filter((e) => e.parked).length,
  };
}

// Legacy no-ops kept so older imports don't crash during HMR.
export function syncElectronWebviewBounds() {}
export function setElectronWebviewSlotVisible(cacheKey, hostEl, visible = true) {
  if (visible && hostEl) {
    attachElectronWebview(cacheKey, hostEl);
  } else {
    markElectronWebviewParked(cacheKey);
  }
}
