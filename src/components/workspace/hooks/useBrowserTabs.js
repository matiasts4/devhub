/**
 * useBrowserTabs.js — Convenience hook for the browser tab list.
 *
 * Phase 3 of pizarra-shared-view-state. This hook is a thin
 * wrapper around useSharedDockState that exposes only the
 * tab-related fields. A `BrowserTabStrip` component can use it
 * directly without knowing about the full state shape.
 *
 * The hook is stable across both workspace and pizarra mounts
 * because both use the same TWM-owned `useSharedDockState`
 * instance. Adding a tab in workspace makes it visible in
 * pizarra on next render (and vice versa) — see the
 * cross-mode integration test in useSharedDockState.test.js.
 */

'use client';

import { useMemo } from 'react';
import { useSharedDockState } from './useSharedDockState';

/**
 * @param {object} [opts]
 * @param {string} [opts.projectId]
 * @param {string} [opts.workspaceId]
 * @returns {{
 *   tabs: Array,
 *   activeTabId: string|null,
 *   addTab: (url?: string) => string|null,
 *   closeTab: (id: string) => { removed: boolean, notCloseable?: boolean },
 *   selectTab: (id: string) => void,
 *   updateTabUrl: (id: string, url: string) => void,
 *   setBrowserUrl: (url: string) => void,
 * }}
 */
export function useBrowserTabs(opts = {}) {
  const { state, addTab, closeTab, selectTab, updateTabUrl, setBrowserUrl } =
    useSharedDockState(opts);
  return useMemo(
    () => ({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      addTab,
      closeTab,
      selectTab,
      updateTabUrl,
      setBrowserUrl,
    }),
    [state.tabs, state.activeTabId, addTab, closeTab, selectTab, updateTabUrl, setBrowserUrl]
  );
}
