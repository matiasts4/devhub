'use client';

import { useContext, useEffect, useRef } from 'react';
import { LiveSurfaceRegistryContext } from '@/lib/pizarra/useLiveSurfaceRegistry';
import { useSharedDockState } from './hooks/useSharedDockState';

/**
 * Keeps the normal-view browser tab strip in sync with all pizarra
 * browser surfaces (across V1, V2, …) — one tab per embedded browser card.
 */
export default function PizarraBrowserTabsBridge({ projectId, workspaceId }) {
  const registry = useContext(LiveSurfaceRegistryContext);
  const { addTab, closeTab, updateTabUrl } = useSharedDockState({ projectId, workspaceId });
  const panelTabMapRef = useRef(new Map());

  useEffect(() => {
    if (!registry?.surfaces?.length) return;

    const browsers = registry.surfaces.filter(
      (s) =>
        s.type === 'browser' &&
        s.panelId &&
        (s.panelId.startsWith('pizarra-browser-') || s.id?.startsWith('shape-browser-piz-'))
    );

    const seenPanelIds = new Set();

    for (const browser of browsers) {
      const panelId = browser.panelId;
      if (!panelId) continue;
      seenPanelIds.add(panelId);

      const url = String(browser.url || 'http://localhost:3000/').trim() || 'http://localhost:3000/';
      const existingTabId = panelTabMapRef.current.get(panelId);

      if (!existingTabId) {
        const tabId = addTab(url);
        if (tabId) panelTabMapRef.current.set(panelId, tabId);
      } else {
        updateTabUrl(existingTabId, url);
      }
    }

    for (const [panelId, tabId] of panelTabMapRef.current.entries()) {
      if (!seenPanelIds.has(panelId)) {
        closeTab(tabId);
        panelTabMapRef.current.delete(panelId);
      }
    }
  }, [registry?.surfaces, addTab, closeTab, updateTabUrl]);

  return null;
}