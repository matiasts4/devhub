import { useEffect, useContext } from 'react';
import { isPizarraSharedViewEnabled } from '@/lib/pizarra/featureFlag';
import {
  mergeRightDockChromeIntoSharedDock,
  readSharedDockState,
  writeSharedDockState,
} from '@/lib/dock/sharedDockState';
import { SharedDockStorageContext } from './useSharedDockState';

function resolveStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

/**
 * B.2c — When shared-view is ON, mirror right-dock chrome fields into
 * `devhub_shared_dock_state_*` alongside browser tabs (single persistence key).
 */
export function useMirrorRightDockToSharedStore(rightDockState, { projectId, workspaceId } = {}) {
  const ctxStorage = useContext(SharedDockStorageContext);
  const storage = ctxStorage || resolveStorage();
  const enabled = isPizarraSharedViewEnabled();

  useEffect(() => {
    if (!enabled || !storage || !rightDockState) return;
    const pid = projectId || 'global';
    const wid = workspaceId || 'workspace';
    const current = readSharedDockState(storage, pid, wid);
    const next = mergeRightDockChromeIntoSharedDock(current, rightDockState);
    writeSharedDockState(storage, pid, wid, next);
  }, [
    enabled,
    storage,
    projectId,
    workspaceId,
    rightDockState?.visible,
    rightDockState?.activeTab,
    rightDockState?.maximized,
    rightDockState?.maximizedView,
    rightDockState?.size,
  ]);
}

export default useMirrorRightDockToSharedStore;
