/**
 * useActivatedWorkspaceIds — activate-then-keep-alive for workspace shells.
 * PR4 (terminal-load-performance): only the active workspace shell mounts on
 * first paint; other workspaces mount on first activation and stay mounted
 * afterwards (hidden via opacity, never unmounted by workspace switches).
 */

import { useEffect, useState } from 'react';

/**
 * Pure: ids whose workspace shell must render right now. The current active id
 * is always included so a workspace switched in this commit renders in the same
 * frame — the accumulation effect below may not have run yet.
 */
export function resolveRenderWorkspaceIds(activatedIds, activeWsId) {
  const renderIds = new Set(activatedIds);
  if (activeWsId) renderIds.add(activeWsId);
  return renderIds;
}

export default function useActivatedWorkspaceIds(activeWsId) {
  const [activatedIds, setActivatedIds] = useState(() => {
    const ids = new Set();
    if (activeWsId) ids.add(activeWsId);
    return ids;
  });

  // Keep-alive: once a workspace was activated, keep its id so its shell is
  // never unmounted by later workspace switches.
  useEffect(() => {
    if (!activeWsId) return;
    setActivatedIds((prev) => {
      if (prev.has(activeWsId)) return prev;
      const next = new Set(prev);
      next.add(activeWsId);
      return next;
    });
  }, [activeWsId]);

  return resolveRenderWorkspaceIds(activatedIds, activeWsId);
}
