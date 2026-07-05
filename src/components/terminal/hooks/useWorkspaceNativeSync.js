import { useCallback } from 'react';
import { resolveActiveWorkspaceWindowId } from '@/lib/terminal/workspaceWindowRender';
import {
  dispatchTerminalWorkspaceLayoutSync,
  dispatchTerminalLayoutSettled,
} from '@/components/terminal/nativeLayoutSync';

export default function useWorkspaceNativeSync({
  activeWindowIds,
  activeWsId,
  focusedPanelByWorkspace,
  getAllPanelIds,
  isVisible,
  workspaceWindows,
  workspaces,
}) {
  const buildNativeWorkspaceSyncDetail = useCallback(
    (reason = 'workspace-switch', { columnsOverride = null } = {}) => {
      const activePanelIdsForNativeSurface = [];
      const hiddenPanelIdsForNativeSurface = [];

      workspaces.forEach((workspace) => {
        const focusedPanelId = focusedPanelByWorkspace[workspace.id];
        const windows = workspaceWindows[workspace.id] || [];

        if (workspace.id === activeWsId) {
          const activeWindowId = resolveActiveWorkspaceWindowId(
            workspace.id,
            workspaceWindows,
            activeWindowIds
          );
          const windowsToSync =
            windows.length > 0
              ? windows
              : [
                  {
                    id: activeWindowId || `${workspace.id}-default`,
                    columns:
                      (columnsOverride && columnsOverride[workspace.id]) || workspace.columns || [],
                  },
                ];

          windowsToSync.forEach((window) => {
            const isActiveWindow = window.id === activeWindowId;
            const columns =
              isActiveWindow && columnsOverride?.[workspace.id]
                ? columnsOverride[workspace.id]
                : window.columns || [];
            const panelIds = getAllPanelIds(columns);

            if (!isActiveWindow) {
              hiddenPanelIdsForNativeSurface.push(...panelIds);
              return;
            }

            if (focusedPanelId) {
              activePanelIdsForNativeSurface.push(focusedPanelId);
              panelIds.forEach((id) => {
                if (id !== focusedPanelId) hiddenPanelIdsForNativeSurface.push(id);
              });
              return;
            }

            activePanelIdsForNativeSurface.push(...panelIds);
          });
        } else if (windows.length > 0) {
          windows.forEach((window) => {
            hiddenPanelIdsForNativeSurface.push(...getAllPanelIds(window.columns || []));
          });
        } else {
          hiddenPanelIdsForNativeSurface.push(...getAllPanelIds(workspace.columns || []));
        }
      });

      return {
        activeWorkspaceId: activeWsId,
        workspaceId: activeWsId,
        activePanelIds: isVisible ? activePanelIdsForNativeSurface : [],
        hiddenPanelIds: isVisible
          ? hiddenPanelIdsForNativeSurface
          : [...activePanelIdsForNativeSurface, ...hiddenPanelIdsForNativeSurface],
        reason: isVisible ? reason : 'terminal-manager-hidden',
      };
    },
    [
      activeWindowIds,
      activeWsId,
      focusedPanelByWorkspace,
      getAllPanelIds,
      isVisible,
      workspaceWindows,
      workspaces,
    ]
  );

  const notifyNativeWorkspaceSurfaceSync = useCallback(
    (reason, options = {}) => {
      if (typeof window === 'undefined') return;
      dispatchTerminalWorkspaceLayoutSync(buildNativeWorkspaceSyncDetail(reason, options));
    },
    [buildNativeWorkspaceSyncDetail]
  );

  const notifyNativeLayoutSettled = useCallback(
    (reason, options = {}) => {
      if (typeof window === 'undefined') return;
      dispatchTerminalLayoutSettled({ reason });
      dispatchTerminalWorkspaceLayoutSync(buildNativeWorkspaceSyncDetail(reason, options));
    },
    [buildNativeWorkspaceSyncDetail]
  );

  return {
    buildNativeWorkspaceSyncDetail,
    notifyNativeWorkspaceSurfaceSync,
    notifyNativeLayoutSettled,
  };
}
