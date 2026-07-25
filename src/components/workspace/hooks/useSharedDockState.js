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
 *
 * In production, the TWM root mounts a `SharedDockStoreProvider`
 * (also exported from this file) which holds the per-project/
 * per-workspace store as React state. All consumers in the same
 * tab share the same store; cross-tab sync comes from the native
 * `storage` event.
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

// Same-tab shared store. The TWM root mounts a provider that
// gives every consumer in the same tab the same store instance.
export const SharedDockStoreContext = createContext(null);

function useStorageFacade() {
  const ctx = useContext(SharedDockStorageContext);
  if (ctx) return ctx;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

// Pure reducer-style state transitions. Exposed so the test
// suite (and the useBrowserTabs hook in Phase 3) can call them
// directly.
export function applyAddTab(state, url) {
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
    const fallback = tabs[idx] || tabs[idx - 1] || null;
    activeTabId = fallback ? fallback.id : null;
  }
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

export function createSharedDockStore(storage, projectId, workspaceId) {
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

  currentState = read();

  return {
    getState: () => currentState,
    setState: (next) => write(next),
    subscribe,
  };
}

/**
 * Same-tab shared store provider. Mount this at the TWM root
 * so every useSharedDockState() consumer in the same tab gets
 * the same store instance. Cross-tab sync still happens through
 * the `storage` event wired in createSharedDockStore.
 */
export function SharedDockStoreProvider({ children, storage, projectId, workspaceId }) {
  // The store is per (projectId, workspaceId) pair. Memoize
  // creation on the pair so a re-render with the same pair
  // returns the same instance.
  const store = useMemo(
    () => createSharedDockStore(storage, projectId, workspaceId),
    [storage, projectId, workspaceId]
  );
  // Tag the store with its key so useSharedDockState can detect
  // a mismatch and fall back to a per-consumer store.
  store.__projectId = projectId;
  store.__workspaceId = workspaceId;
  return (
    <SharedDockStoreContext.Provider value={store}>{children}</SharedDockStoreContext.Provider>
  );
}

export function useSharedDockState(opts = {}) {
  const storage = useStorageFacade();
  const projectId = opts.projectId || 'global';
  const workspaceId = opts.workspaceId || 'global';

  // Prefer the shared store from context. Falls back to a
  // per-component store when no provider is mounted (useful
  // for tests that don't want to wire the provider).
  const ctxStore = useContext(SharedDockStoreContext);
  const storeRef = useRef(null);
  const storeKey = `${projectId}::${workspaceId}::${storage === null ? 'null' : 'facade'}`;
  if (ctxStore) {
    // Trust the context's store; ensure the projectId/workspaceId
    // pair matches what the consumer wants. If it doesn't, we
    // create a per-consumer store as a safety valve (the TWM
    // root should always mount a provider with the right pair).
    if (ctxStore.__projectId !== projectId || ctxStore.__workspaceId !== workspaceId) {
      if (!storeRef.current || storeRef.current.__key !== storeKey) {
        storeRef.current = createSharedDockStore(storage, projectId, workspaceId);
        storeRef.current.__key = storeKey;
      }
    }
  } else if (!storeRef.current || storeRef.current.__key !== storeKey) {
    storeRef.current = createSharedDockStore(storage, projectId, workspaceId);
    storeRef.current.__key = storeKey;
  }
  const store =
    ctxStore && ctxStore.__projectId === projectId && ctxStore.__workspaceId === workspaceId
      ? ctxStore
      : storeRef.current;

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
