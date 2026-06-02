/**
 * useSharedDockState.js — TWM-owned hook for the shared dock state.
 *
 * Phase 2 of pizarra-shared-view-state. This hook is the single
 * writer + reader for `sharedDockState` from the React layer.
 * Both the workspace right-dock and the pizarra browser surface
 * consume the same hook instance (provided by the TWM root), so
 * a tab added in one mode is visible in the other.
 *
 * The hook uses `useSyncExternalStore` for two reasons:
 *   1. It gives us a single, well-defined subscription model
 *      that works with React 18+ concurrent rendering.
 *   2. The cross-tab `storage` event subscription is natural to
 *      express as an external store.
 *
 * The store facade takes a `storage` argument (provided through
 * `SharedDockStorageContext`) so tests can drive the `storage`
 * event without touching real `window.localStorage`.
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  DEFAULT_SHARED_DOCK_STATE,
  buildSharedDockStorageKey,
  sanitizeSharedDockState,
  writeSharedDockState,
  migrateDockState,
  generateTabId,
} from '@/lib/dock/sharedDockState';

// Context that lets tests inject a custom storage facade.
export const SharedDockStorageContext = createContext(null);

function useStorageFacade() {
  const ctx = useContext(SharedDockStorageContext);
  if (ctx) return ctx;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

// Pure reducer-style state transitions. We expose them as pure
// functions so the hook can call them from `dispatchAction` and
// the test suite can call them directly to verify the contract.
export function applyAddTab(state, url) {
  // Cap at 20 tabs (spec pizarra-browser-tabs / "New-tab cap").
  if (state.tabs.length >= state.tabCap) {
    return { next: state, rejected: true };
  }
  const id = generateTabId();
  const newTab = {
    id,
    url: typeof url === 'string' && url ? url : 'about:blank',
    label: typeof url === 'string' && url ? url : 'New tab',
    favicon: '',
    loadingState: 'idle',
    isActive: true,
    canClose: true,
  };
  const tabs = state.tabs.map((t) => ({ ...t, isActive: false })).concat(newTab);
  return {
    next: {
      ...state,
      tabs,
      activeTabId: id,
      browserUrl: newTab.url,
      browserHistory: [...state.browserHistory.slice(-49), newTab.url],
    },
    rejected: false,
    id,
  };
}

export function applyCloseTab(state, tabId) {
  if (!tabId) return { next: state, removed: false };
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return { next: state, removed: false };
  const target = state.tabs[idx];
  if (target.canClose === false) return { next: state, removed: false, notCloseable: true };
  const tabs = state.tabs.filter((t) => t.id !== tabId);
  let activeTabId = state.activeTabId;
  if (state.activeTabId === tabId) {
    // Prefer the next tab to the right; fall back to the previous
    // tab on the left if the closed tab was the last one.
    const fallback = tabs[idx] || tabs[idx - 1] || null;
    activeTabId = fallback ? fallback.id : null;
  }
  // Surface MUST NOT go to zero tabs while visible (spec
  // "Closing the last tab auto-creates a blank tab"). If we just
  // removed the last tab, spawn a blank one.
  if (tabs.length === 0) {
    const id = generateTabId();
    const blank = {
      id,
      url: 'about:blank',
      label: 'New tab',
      favicon: '',
      loadingState: 'idle',
      isActive: true,
      canClose: true,
    };
    return {
      next: { ...state, tabs: [blank], activeTabId: id, browserUrl: 'about:blank' },
      removed: true,
    };
  }
  const newTabs = tabs.map((t) => ({ ...t, isActive: t.id === activeTabId }));
  const newActive = newTabs.find((t) => t.id === activeTabId);
  return {
    next: {
      ...state,
      tabs: newTabs,
      activeTabId,
      browserUrl: newActive ? newActive.url : state.browserUrl,
    },
    removed: true,
  };
}

export function applySelectTab(state, tabId) {
  if (!tabId) return state;
  const target = state.tabs.find((t) => t.id === tabId);
  if (!target) return state;
  const tabs = state.tabs.map((t) => ({ ...t, isActive: t.id === tabId }));
  return {
    ...state,
    tabs,
    activeTabId: tabId,
    browserUrl: target.url,
  };
}

export function applyUpdateTabUrl(state, tabId, url) {
  if (!tabId || typeof url !== 'string') return state;
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return state;
  const tabs = state.tabs.slice();
  tabs[idx] = { ...tabs[idx], url, label: url || tabs[idx].label };
  return {
    ...state,
    tabs,
    browserUrl: state.activeTabId === tabId ? url : state.browserUrl,
  };
}

function createSharedDockStore(storage, projectId, workspaceId) {
  // Subscribe model: every consumer registers a `cb`; we hold
  // them in a Set. The store's `setState` walks the Set and
  // notifies. The store's `subscribe` is what `useSyncExternalStore`
  // wires up.
  const listeners = new Set();
  let currentState = DEFAULT_SHARED_DOCK_STATE;

  function getStorage() {
    return storage || (typeof window !== 'undefined' ? window.localStorage : null);
  }

  function notify() {
    for (const cb of listeners) cb();
  }

  function read() {
    const s = getStorage();
    if (!s) return currentState;
    return migrateDockState(s, projectId, workspaceId);
  }

  function write(next) {
    const s = getStorage();
    if (!s) {
      currentState = next;
      notify();
      return;
    }
    writeSharedDockState(s, projectId, workspaceId, next);
    currentState = next;
    notify();
  }

  function onStorageEvent(event) {
    if (!event || event.key !== buildSharedDockStorageKey(projectId, workspaceId)) return;
    if (event.newValue == null) {
      // External clear — fall back to defaults.
      currentState = DEFAULT_SHARED_DOCK_STATE;
      notify();
      return;
    }
    try {
      const next = sanitizeSharedDockState(JSON.parse(event.newValue));
      currentState = next;
      notify();
    } catch {
      // Ignore malformed external writes.
    }
  }

  function subscribe(cb) {
    listeners.add(cb);
    const s = getStorage();
    const handler = onStorageEvent;
    if (s && typeof s.addEventListener === 'function') {
      s.addEventListener('storage', handler);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('storage', handler);
    }
    return () => {
      listeners.delete(cb);
      if (s && typeof s.removeEventListener === 'function') {
        s.removeEventListener('storage', handler);
      } else if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handler);
      }
    };
  }

  // Initial seed.
  currentState = read();

  return {
    getState: () => currentState,
    setState: (next) => write(next),
    subscribe,
  };
}

export function useSharedDockState(opts = {}) {
  const storage = useStorageFacade();
  const projectId = opts.projectId || 'global';
  const workspaceId = opts.workspaceId || 'global';
  // One store per (projectId, workspaceId) pair. The ref survives
  // re-renders; we only recreate the store if the key changes.
  const storeRef = useRef(null);
  const storeKey = `${projectId}::${workspaceId}::${storage === null ? 'null' : 'facade'}`;
  if (!storeRef.current || storeRef.current.__key !== storeKey) {
    storeRef.current = createSharedDockStore(storage, projectId, workspaceId);
    storeRef.current.__key = storeKey;
  }
  const store = storeRef.current;

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  const addTab = useCallback(
    (url) => {
      const result = applyAddTab(store.getState(), url);
      if (result.rejected) return null;
      store.setState(result.next);
      return result.id;
    },
    [store]
  );

  const closeTab = useCallback(
    (tabId) => {
      const result = applyCloseTab(store.getState(), tabId);
      if (result.removed) {
        store.setState(result.next);
      }
      return result;
    },
    [store]
  );

  const selectTab = useCallback(
    (tabId) => {
      const next = applySelectTab(store.getState(), tabId);
      store.setState(next);
    },
    [store]
  );

  const updateTabUrl = useCallback(
    (tabId, url) => {
      const next = applyUpdateTabUrl(store.getState(), tabId, url);
      store.setState(next);
    },
    [store]
  );

  const setBrowserUrl = useCallback(
    (url) => {
      const cur = store.getState();
      store.setState({ ...cur, browserUrl: url });
    },
    [store]
  );

  return useMemo(
    () => ({
      state,
      addTab,
      closeTab,
      selectTab,
      updateTabUrl,
      setBrowserUrl,
    }),
    [state, addTab, closeTab, selectTab, updateTabUrl, setBrowserUrl]
  );
}
