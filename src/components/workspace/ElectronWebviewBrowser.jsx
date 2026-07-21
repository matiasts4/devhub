'use client';

/**
 * Electron dock browser: pooled Chromium <webview> in SPA DOM.
 *
 * - Guest is a real child of this host (absolute fill) — reliable paint in Electron.
 * - Mode handoff (workspace ↔ pizarra) recreates the guest instead of reparenting
 *   (reparent blanks/kills the guest after 1–3 toggles).
 * - Session cookies survive via persist: partition; page reloads once on handoff.
 * - surfaceActive=false only marks parked (keep-alive shells stay mounted).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  claimElectronWebview,
  getElectronWebviewEntry,
  injectElectronWebviewChromeCss,
  markElectronWebviewParked,
  navigateElectronWebview,
  releaseElectronWebview,
  syncWebviewPixelSize,
  webviewUrlsEqual,
} from '@/lib/browser/electronWebviewPool';

/**
 * @param {object} props
 * @param {string} props.cacheKey
 * @param {string} props.src
 * @param {string} [props.partition]
 * @param {string} [props.className]
 * @param {boolean} [props.surfaceActive]
 * @param {(url: string) => void} [props.onNavigate]
 * @param {(info: object) => void} [props.onFailLoad]
 * @param {(loading: boolean) => void} [props.onLoadingChange]
 * @param {(title: string) => void} [props.onPageTitle]
 */
const ElectronWebviewBrowser = forwardRef(function ElectronWebviewBrowser(
  {
    cacheKey,
    src,
    partition = 'persist:devhub-browser-dock',
    className = '',
    surfaceActive = true,
    suspendNativeSurface = false,
    onNavigate,
    onFailLoad,
    onLoadingChange,
    onPageTitle,
  },
  ref
) {
  const hostRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const entryRef = useRef(
    /** @type {import('@/lib/browser/electronWebviewPool').PoolEntry|null} */ (null)
  );
  const lastIntentSrcRef = useRef('');
  const srcRef = useRef(src);
  srcRef.current = src;
  const key = String(cacheKey || partition || 'default');
  const active = surfaceActive !== false;
  const reactId = useId();
  const ownerIdRef = useRef(`ewv-${key}-${reactId}`);
  /** Bumps when the pool recreates the guest so event listeners re-bind. */
  const [guestGeneration, setGuestGeneration] = useState(0);

  const getWv = useCallback(() => entryRef.current?.el || getElectronWebviewEntry(key)?.el || null, [
    key,
  ]);

  const noteEntry = useCallback((entry) => {
    entryRef.current = entry;
    if (entry && typeof entry.generation === 'number') {
      setGuestGeneration(entry.generation);
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      goBack() {
        try {
          getWv()?.goBack?.();
        } catch {
          /* ignore */
        }
      },
      goForward() {
        try {
          getWv()?.goForward?.();
        } catch {
          /* ignore */
        }
      },
      reload() {
        try {
          getWv()?.reload?.();
        } catch {
          /* ignore */
        }
      },
      stop() {
        try {
          getWv()?.stop?.();
        } catch {
          /* ignore */
        }
      },
      loadURL(url) {
        lastIntentSrcRef.current = String(url || '').trim();
        void navigateElectronWebview(key, url, { force: true });
      },
      canGoBack() {
        try {
          return Boolean(getWv()?.canGoBack?.());
        } catch {
          return false;
        }
      },
      canGoForward() {
        try {
          return Boolean(getWv()?.canGoForward?.());
        } catch {
          return false;
        }
      },
      getURL() {
        try {
          return String(getWv()?.getURL?.() || entryRef.current?.lastUrl || '');
        } catch {
          return entryRef.current?.lastUrl || '';
        }
      },
      getWebview() {
        return getWv();
      },
    }),
    [getWv, key]
  );

  // Claim host on mount; delayed release lets the next mode claim & recreate cleanly.
  useLayoutEffect(() => {
    const ownerId = ownerIdRef.current;
    const host = hostRef.current;

    const claim = (hostEl) => {
      const entry = claimElectronWebview(key, hostEl, ownerId, partition);
      noteEntry(entry);
      return entry;
    };

    if (host) {
      claim(host);
    } else {
      const raf = requestAnimationFrame(() => {
        const h = hostRef.current;
        if (h) claim(h);
      });
      return () => {
        cancelAnimationFrame(raf);
        releaseElectronWebview(key, ownerId);
        entryRef.current = null;
      };
    }

    return () => {
      releaseElectronWebview(key, ownerId);
      entryRef.current = null;
    };
  }, [key, partition, noteEntry]);

  // surfaceActive: reclaim + force navigate when shown again after handoff.
  useLayoutEffect(() => {
    const ownerId = ownerIdRef.current;
    const host = hostRef.current;

    if (!active) {
      markElectronWebviewParked(key);
      return undefined;
    }

    const genBefore = getElectronWebviewEntry(key)?.generation ?? 0;
    if (host) {
      noteEntry(claimElectronWebview(key, host, ownerId, partition));
      const ent = getElectronWebviewEntry(key);
      if (ent) syncWebviewPixelSize(ent, host);
    }

    const live = entryRef.current || getElectronWebviewEntry(key);
    const genAfter = live?.generation ?? genBefore;
    const recreated = genAfter !== genBefore;
    const desired = String(
      srcRef.current || lastIntentSrcRef.current || live?.lastUrl || ''
    ).trim();

    const ensurePaint = (force) => {
      const h = hostRef.current;
      const entry = getElectronWebviewEntry(key);
      if (entry && h) syncWebviewPixelSize(entry, h);
      if (!desired || desired === 'about:blank') return;
      let liveUrl = '';
      try {
        liveUrl =
          entry?.el && typeof entry.el.getURL === 'function' ? String(entry.el.getURL() || '') : '';
      } catch {
        liveUrl = '';
      }
      const blank = !liveUrl || liveUrl === 'about:blank';
      const size = entry?.lastPixelSize;
      const hasBox = size && size.w >= 2 && size.h >= 2;
      if (!hasBox) return; // wait for RO / delayed size apply
      if (force || recreated || blank || entry?.loadFailed || !entry?.hasLoadedOnce) {
        void navigateElectronWebview(key, desired, { force: true }).then(() => {
          const el = getElectronWebviewEntry(key)?.el;
          if (el) injectElectronWebviewChromeCss(el);
        });
      } else if (entry?.el) {
        injectElectronWebviewChromeCss(entry.el);
      }
    };

    ensurePaint(recreated);

    // After handoff recreate, re-claim once layout has non-zero bounds.
    const t0 = setTimeout(() => {
      const h = hostRef.current;
      if (h && active) {
        const g0 = getElectronWebviewEntry(key)?.generation ?? 0;
        noteEntry(claimElectronWebview(key, h, ownerId, partition));
        const g1 = getElectronWebviewEntry(key)?.generation ?? 0;
        if (g1 !== g0 || recreated) {
          ensurePaint(true);
        }
      }
    }, 50);
    const t1 = setTimeout(() => {
      const entry = getElectronWebviewEntry(key);
      let liveUrl = '';
      try {
        liveUrl =
          entry?.el && typeof entry.el.getURL === 'function'
            ? String(entry.el.getURL() || '')
            : '';
      } catch {
        liveUrl = '';
      }
      if (!liveUrl || liveUrl === 'about:blank' || entry?.loadFailed) {
        ensurePaint(true);
      }
      const el = entry?.el;
      if (el) {
        injectElectronWebviewChromeCss(el);
        try {
          el.focus?.();
        } catch {
          /* ignore */
        }
      }
    }, 250);

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [key, active, partition, noteEntry]);

  // Event wiring — re-bind when pool generation changes (after recreate).
  useEffect(() => {
    const ownerId = ownerIdRef.current;
    const entry =
      entryRef.current || claimElectronWebview(key, hostRef.current, ownerId, partition);
    noteEntry(entry);
    const wv = getElectronWebviewEntry(key)?.el;
    if (!wv) return undefined;

    const emitNav = () => {
      try {
        const current = getElectronWebviewEntry(key);
        const url =
          (typeof wv.getURL === 'function' ? wv.getURL() : '') || current?.lastUrl || '';
        if (url && url !== 'about:blank') {
          if (current) current.lastUrl = url;
          lastIntentSrcRef.current = url;
          onNavigate?.(url);
        }
      } catch {
        /* guest mid-navigation */
      }
    };

    const onStart = () => onLoadingChange?.(true);
    const onStop = () => {
      onLoadingChange?.(false);
      injectElectronWebviewChromeCss(wv);
      emitNav();
    };
    const onNav = () => {
      injectElectronWebviewChromeCss(wv);
      emitNav();
    };
    const onTitle = (e) => {
      if (e?.title) onPageTitle?.(String(e.title));
    };
    const onFail = (e) => {
      onLoadingChange?.(false);
      const code = e?.errorCode;
      if (code === -3 || code === '-3' || code === 0) return;
      if (code === -102 || code === '-102') return;
      onFailLoad?.({
        errorCode: code,
        errorDescription: e?.errorDescription,
        url: e?.validatedURL,
      });
    };

    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('did-navigate', onNav);
    wv.addEventListener('did-navigate-in-page', onNav);
    wv.addEventListener('page-title-updated', onTitle);
    wv.addEventListener('did-fail-load', onFail);

    return () => {
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('did-navigate', onNav);
      wv.removeEventListener('did-navigate-in-page', onNav);
      wv.removeEventListener('page-title-updated', onTitle);
      wv.removeEventListener('did-fail-load', onFail);
    };
  }, [
    key,
    partition,
    guestGeneration,
    onFailLoad,
    onLoadingChange,
    onNavigate,
    onPageTitle,
    noteEntry,
  ]);

  useEffect(() => {
    lastIntentSrcRef.current = '';
  }, [key]);

  useEffect(() => {
    if (!active) return;
    const next = String(src || '').trim();
    if (!next) return;

    const entry = getElectronWebviewEntry(key);
    let live = '';
    try {
      live = entry?.el && typeof entry.el.getURL === 'function' ? String(entry.el.getURL() || '') : '';
    } catch {
      live = '';
    }
    const guestBlank = !live || live === 'about:blank';
    const neverPainted = !entry?.hasLoadedOnce;

    if (
      webviewUrlsEqual(next, lastIntentSrcRef.current) &&
      !guestBlank &&
      !entry?.loadFailed &&
      !neverPainted
    ) {
      return;
    }

    if (
      entry?.lastUrl &&
      webviewUrlsEqual(entry.lastUrl, next) &&
      !guestBlank &&
      !entry.loadFailed &&
      entry.hasLoadedOnce
    ) {
      lastIntentSrcRef.current = next;
      injectElectronWebviewChromeCss(entry.el);
      return;
    }

    void navigateElectronWebview(key, next, {
      force: Boolean(guestBlank || entry?.loadFailed || neverPainted),
    }).then((result) => {
      if (result?.reason && String(result.reason).includes('placeholder')) return;
      if (result?.ok !== false) lastIntentSrcRef.current = next;
    });
  }, [key, src, active]);

  useEffect(() => {
    const el = getWv();
    if (el) {
      el.style.pointerEvents = active && !suspendNativeSurface ? 'auto' : 'none';
    }
  }, [getWv, active, suspendNativeSurface, guestGeneration]);

  // Keep host box stretching fully so pixel-size sync has a real rect.
  return (
    <div
      ref={hostRef}
      className={className}
      data-testid="electron-webview-host"
      data-surface-active={active ? 'true' : 'false'}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        flex: '1 1 auto',
        alignSelf: 'stretch',
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: 'var(--surface-app, #0a111d)',
        pointerEvents: active && !suspendNativeSurface ? 'auto' : 'none',
      }}
    />
  );
});

export default ElectronWebviewBrowser;

/**
 * DOM &lt;webview&gt; path is disabled by default.
 * Electron uses WebContentsView (native_browser_* IPC) so normal↔pizarra
 * only setBounds/setVisible — no guest remount, no black panel after toggles.
 *
 * Opt-in emergency: window.__DEVHUB_FORCE_DOM_WEBVIEW__ = true
 */
export function shouldUseElectronWebview() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.__DEVHUB_FORCE_DOM_WEBVIEW__ === true) {
      return window.devhubDesktop?.isElectron === true;
    }
  } catch {
    /* ignore */
  }
  // Prefer main-process WebContentsView on Electron (stable across mode switches).
  return false;
}
