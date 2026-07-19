/**
 * Warm cache of Electron <webview> elements ( tab cache).
 *
 * - Keep guest sessions alive across workspace switch (no reload).
 * - Prefer in-place hide over reparent when possible — reparenting <webview>
 *   often reloads the guest process (Electron).
 * - Serialize loadURL per webview to avoid ERR_ABORTED (-3) from stacked navigations.
 * - LRU eviction when pool exceeds MAX_POOL_SIZE.
 */

const MAX_POOL_SIZE = 8;
const PARK_HOST_ID = 'devhub-electron-webview-park';

/** URLs that must not clobber a warm guest during dock-state races. */
const PLACEHOLDER_URLS = new Set([
  '',
  'about:blank',
  'http://localhost:3200/',
  'http://localhost:3200',
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
    // Drop default ports; keep path (empty path → '/')
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
    // Full-ish size so a parked guest keeps layout metrics .
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

function createWebviewElement(partition) {
  const el = document.createElement('webview');
  el.setAttribute('partition', partition);
  el.setAttribute('allowpopups', 'true');
  el.setAttribute('webpreferences', 'contextIsolation=yes, nativeWindowOpen=yes');
  el.style.cssText = [
    'width:100%',
    'height:100%',
    'display:flex',
    'border:none',
    'background:#0a111d',
    'transform:translate3d(0,0,0)',
    'will-change:transform',
  ].join(';');
  el.dataset.testid = 'electron-webview-browser';
  return el;
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

function evictIfNeeded(keepKey) {
  if (pool.size <= MAX_POOL_SIZE) return;
  const candidates = [...pool.entries()]
    .filter(([key, e]) => e.parked && key !== keepKey)
    .sort((a, b) => a[1].lastUsedTs - b[1].lastUsedTs);
  while (pool.size > MAX_POOL_SIZE && candidates.length) {
    const [key, entry] = candidates.shift();
    try {
      entry.el.remove();
    } catch {
      /* ignore */
    }
    pool.delete(key);
  }
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
    // Partition is immutable after create — ignore mismatches.
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
  };

  const onDomReady = () => {
    entry.domReady = true;
    // Flush any navigation queued before dom-ready.
    if (entry.pendingUrl) {
      const url = entry.pendingUrl;
      entry.pendingUrl = null;
      void navigateElectronWebview(key, url, { force: true });
    }
  };
  el.addEventListener('dom-ready', onDomReady);
  entry.listenersCleanup.add(() => el.removeEventListener('dom-ready', onDomReady));

  // Track real navigations so lastUrl stays aligned with the guest (redirects, in-page).
  const onDidNavigate = (e) => {
    const url = e?.url || readGuestUrl(entry);
    if (url && url !== 'about:blank') {
      entry.lastUrl = url;
    }
  };
  el.addEventListener('did-navigate', onDidNavigate);
  el.addEventListener('did-navigate-in-page', onDidNavigate);
  entry.listenersCleanup.add(() => {
    el.removeEventListener('did-navigate', onDidNavigate);
    el.removeEventListener('did-navigate-in-page', onDidNavigate);
  });

  pool.set(key, entry);
  evictIfNeeded(key);
  return entry;
}

/**
 * Mark entry parked without moving DOM (preferred — avoids guest reload).
 * @param {string} cacheKey
 */
export function markElectronWebviewParked(cacheKey) {
  const entry = pool.get(String(cacheKey || ''));
  if (!entry) return;
  entry.parked = true;
  touch(entry);
}

/**
 * Park webview into off-screen host (only for true unmount / cache retention).
 * Prefer markElectronWebviewParked when the React host stays mounted.
 * @param {string} cacheKey
 */
export function parkElectronWebview(cacheKey) {
  const entry = pool.get(String(cacheKey || ''));
  if (!entry) return;
  entry.parked = true;
  touch(entry);
  const host = ensureParkHost();
  if (host && entry.el.parentElement !== host) {
    try {
      host.appendChild(entry.el);
    } catch {
      /* ignore */
    }
  }
  evictIfNeeded(cacheKey);
}

/**
 * Attach webview to a React host element. No-op if already there.
 * @param {string} cacheKey
 * @param {HTMLElement|null} hostEl
 */
export function attachElectronWebview(cacheKey, hostEl) {
  const entry = pool.get(String(cacheKey || ''));
  if (!entry || !hostEl) return;
  entry.parked = false;
  touch(entry);
  if (entry.el.parentElement !== hostEl) {
    try {
      hostEl.appendChild(entry.el);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Hard destroy one entry (optional explicit close).
 * @param {string} cacheKey
 */
export function destroyElectronWebview(cacheKey) {
  const key = String(cacheKey || '');
  const entry = pool.get(key);
  if (!entry) return;
  for (const fn of entry.listenersCleanup) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  try {
    entry.el.remove();
  } catch {
    /* ignore */
  }
  pool.delete(key);
}

/**
 * Whether navigate should be a pure no-op (no loadURL).
 * @param {PoolEntry} entry
 * @param {string} next
 * @param {{ force?: boolean }} opts
 * @returns {{ skip: boolean, reason?: string }}
 */
export function shouldSkipWebviewNavigation(entry, next, opts = {}) {
  if (!entry || opts.force) return { skip: false };
  const target = String(next || '').trim();
  if (!target) return { skip: true, reason: 'empty-url' };

  if (webviewUrlsEqual(entry.lastUrl, target)) {
    return { skip: true, reason: 'already-there-lastUrl' };
  }

  const current = readGuestUrl(entry);
  if (current && webviewUrlsEqual(current, target)) {
    entry.lastUrl = current;
    return { skip: true, reason: 'already-there-getURL' };
  }

  // Dock-state race: inactive workspaces briefly receive DEFAULT_RIGHT_DOCK_STATE.
  // Never clobber a warm guest with a placeholder URL.
  if (isPlaceholderWebviewUrl(target)) {
    if (current && !isPlaceholderWebviewUrl(current)) {
      return { skip: true, reason: 'keep-warm-over-placeholder' };
    }
    if (entry.lastUrl && !isPlaceholderWebviewUrl(entry.lastUrl)) {
      return { skip: true, reason: 'keep-warm-over-placeholder-lastUrl' };
    }
  }

  return { skip: false };
}

/**
 * Serialize navigations. Skips no-ops. Treats ERR_ABORTED as benign when superseded.
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

  if (!entry.domReady) {
    entry.pendingUrl = next;
    entry.lastUrl = next;
    // Initial attribute only once — never fight loadURL with src thrash.
    if (!entry.el.getAttribute('src')) {
      try {
        entry.el.setAttribute('src', next);
      } catch {
        /* ignore */
      }
    }
    return Promise.resolve({ ok: true, reason: 'queued-dom-ready' });
  }

  // Chain navigations so only the latest wins without parallel loadURL races.
  entry.pendingUrl = next;
  const run = async () => {
    if (entry.navChain) {
      try {
        await entry.navChain;
      } catch {
        /* ignore */
      }
    }

    const target = entry.pendingUrl || next;
    entry.pendingUrl = null;

    if (!target) return { ok: true, aborted: true };

    // Re-check after waiting — a concurrent nav or user navigation may have landed.
    const recheck = shouldSkipWebviewNavigation(entry, target, opts);
    if (recheck.skip) {
      return { ok: true, reason: recheck.reason || 'already-there' };
    }

    entry.lastUrl = target;

    try {
      if (typeof entry.el.loadURL === 'function') {
        await entry.el.loadURL(target);
      } else {
        entry.el.setAttribute('src', target);
      }
      return { ok: true };
    } catch (err) {
      const msg = String(err?.message || err || '');
      const code = err?.code || err?.errno;
      // ERR_ABORTED (-3): superseded navigation — expected when user types fast or remounts.
      if (code === 'ERR_ABORTED' || code === -3 || /ERR_ABORTED|abort/i.test(msg)) {
        return { ok: true, aborted: true, reason: 'aborted' };
      }
      console.warn('[electronWebviewPool] loadURL failed', target, msg);
      return { ok: false, reason: msg };
    }
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
