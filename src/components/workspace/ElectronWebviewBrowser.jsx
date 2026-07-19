'use client';

/**
 *  dock browser: pooled Chromium <webview> in SPA DOM.
 *
 * Critical for no-reload workspace switch:
 * - Keep the <webview> attached to its React host while the workspace shell
 *   stays mounted (opacity:0 keep-alive). Reparenting reloads the guest.
 * - Only move to the park host on true React unmount.
 * - Navigate only when the intended URL changes — never on mere surface re-activate.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  acquireElectronWebview,
  attachElectronWebview,
  getElectronWebviewEntry,
  markElectronWebviewParked,
  navigateElectronWebview,
  parkElectronWebview,
  webviewUrlsEqual,
} from '@/lib/browser/electronWebviewPool';

/**
 * @param {object} props
 * @param {string} props.cacheKey  stable id (e.g. browser-${projectId}-${workspaceId})
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
    /** When false, mark parked in-place  — do NOT reparent. */
    surfaceActive = true,
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
  /** Last URL we intentionally navigated to for this key (survives surface toggle). */
  const lastIntentSrcRef = useRef('');
  const key = String(cacheKey || partition || 'default');
  const active = surfaceActive !== false;

  const getWv = useCallback(() => entryRef.current?.el || null, []);

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

  // Acquire + attach once per cacheKey. Do NOT reparent when surfaceActive flips —
  // inactive workspace shells stay mounted (opacity:0); moving <webview> reloads guest.
  useLayoutEffect(() => {
    const entry = acquireElectronWebview(key, partition);
    entryRef.current = entry;
    const host = hostRef.current;
    if (host) {
      attachElectronWebview(key, host);
    }

    return () => {
      // True unmount only: park warm off-screen for later reacquire.
      parkElectronWebview(key);
      if (entryRef.current === entry) {
        entryRef.current = null;
      }
    };
  }, [key, partition]);

  // Surface visibility: flag only. Guest stays in the React host under the shell.
  useLayoutEffect(() => {
    const entry = entryRef.current || getElectronWebviewEntry(key);
    if (!entry) return;
    if (active) {
      entry.parked = false;
      const host = hostRef.current;
      // Re-attach only if something else parked us to the off-screen host (unmount race).
      if (host && entry.el.parentElement !== host) {
        attachElectronWebview(key, host);
      }
      // Re-focus guest after workspace restore (helps compositor paint without reload).
      const focusGuest = () => {
        try {
          entry.el.focus?.();
        } catch {
          /* ignore */
        }
      };
      focusGuest();
      const t1 = setTimeout(focusGuest, 10);
      const t2 = setTimeout(focusGuest, 30);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    markElectronWebviewParked(key);
    return undefined;
  }, [key, active]);

  // Event wiring on the stable pooled element.
  useEffect(() => {
    const entry = entryRef.current || acquireElectronWebview(key, partition);
    const wv = entry.el;
    if (!wv) return undefined;

    const emitNav = () => {
      try {
        const url = (typeof wv.getURL === 'function' ? wv.getURL() : '') || entry.lastUrl || '';
        if (url && url !== 'about:blank') {
          entry.lastUrl = url;
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
      emitNav();
    };
    const onNav = () => emitNav();
    const onTitle = (e) => {
      const title = e?.title;
      if (title) onPageTitle?.(String(title));
    };
    const onFail = (e) => {
      onLoadingChange?.(false);
      const code = e?.errorCode;
      if (code === -3 || code === '-3') return;
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
  }, [key, partition, onFailLoad, onLoadingChange, onNavigate, onPageTitle]);

  // Reset intent when the pool key changes (must run before navigate effect).
  useEffect(() => {
    lastIntentSrcRef.current = '';
  }, [key]);

  // Navigate only when the intended URL changes. Surface re-activate alone = no loadURL.
  useEffect(() => {
    if (!active) return;
    const next = String(src || '').trim();
    if (!next) return;

    // Mere workspace re-show with the same intent — keep guest session.
    if (webviewUrlsEqual(next, lastIntentSrcRef.current)) {
      return;
    }

    const entry = getElectronWebviewEntry(key);
    // Guest already warm on this (or equivalent) URL — common after workspace switch.
    if (entry?.lastUrl && webviewUrlsEqual(entry.lastUrl, next)) {
      lastIntentSrcRef.current = next;
      return;
    }

    void navigateElectronWebview(key, next).then((result) => {
      // Dock-state race may offer DEFAULT_RIGHT_DOCK_STATE; pool skips it — keep prior intent.
      if (result?.reason && String(result.reason).includes('placeholder')) {
        return;
      }
      if (result?.ok !== false) {
        lastIntentSrcRef.current = next;
      }
    });
  }, [key, src, active]);

  return (
    <div
      ref={hostRef}
      className={className}
      data-testid="electron-webview-host"
      data-surface-active={active ? 'true' : 'false'}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    />
  );
});

export default ElectronWebviewBrowser;

export function shouldUseElectronWebview() {
  if (typeof window === 'undefined') return false;
  return window.devhubDesktop?.isElectron === true;
}
