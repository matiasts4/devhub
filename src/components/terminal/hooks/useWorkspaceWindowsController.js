// useWorkspaceWindowsController — manages workspace window state and Tauri WebviewWindow IPC.
// Extracted from TerminalWorkspacesManager.jsx.
// Args: { projectId, workspaces, activeWsId, activePanelIds, isClientLoaded, browserWindowStates, setBrowserWindowStates, storage }
// Returns: { workspaceWindows, setWorkspaceWindows, activeWindowIds, setActiveWindowIds, windowCounterRef, addWindowToWorkspace, switchWindowInWorkspace, removeWindowFromWorkspace, closeWorkspaceBrowserWindow }

import { useState, useCallback, useEffect, useRef } from 'react';
import { buildBrowserWindowLabel } from '../../workspace/browserWindowState';
import { closeTerminalSessions } from '../workspaceStateHelpers';
import { createColumn, createWindow } from '../utils/panelHelpers';
import { setPanelRendererPreference, TERMINAL_RENDERER_INHERIT_MODE } from '../terminalRendererPreferences';

export default function useWorkspaceWindowsController({
  projectId,
  workspaces,
  activeWsId,
  activePanelIds,
  isClientLoaded,
  browserWindowStates,
  setBrowserWindowStates,
  storage,
}) {
  const [workspaceWindows, setWorkspaceWindows] = useState(() => ({}));
  const [activeWindowIds, setActiveWindowIds] = useState(() => ({}));
  const windowCounterRef = useRef(1);
  const activeWindowIdsRef = useRef(activeWindowIds);

  useEffect(() => {
    activeWindowIdsRef.current = activeWindowIds;
  }, [activeWindowIds]);

  // Sync workspace windows when workspaces change
  useEffect(() => {
    if (!workspaces.length) return;

    setWorkspaceWindows((prev) => {
      let changed = false;
      const next = { ...prev };

      workspaces.forEach((ws) => {
        const existing = Array.isArray(next[ws.id]) ? next[ws.id] : [];
        if (existing.length === 0) {
          windowCounterRef.current += 1;
          const windowId = `v${windowCounterRef.current}`;
          const panelId = activePanelIds[ws.id] || ws.columns?.[0]?.panels?.[0]?.id || null;
          next[ws.id] = [createWindow(windowId, 'V1', ws.columns, panelId)];
          changed = true;
        }
      });

      return changed ? next : prev;
    });

    setActiveWindowIds((prev) => {
      let changed = false;
      const next = { ...prev };

      workspaces.forEach((ws) => {
        const windows = workspaceWindows[ws.id] || [];
        const candidate = prev[ws.id];
        if (!candidate || !windows.some((w) => w.id === candidate)) {
          const firstId = windows[0]?.id;
          if (firstId) {
            next[ws.id] = firstId;
            changed = true;
          }
        }
      });

      return changed ? next : prev;
    });
  }, [workspaces, workspaceWindows, activePanelIds]);

  // Update window counter from existing windows
  useEffect(() => {
    const maxWindowId = Object.values(workspaceWindows || {})
      .flat()
      .reduce((maxValue, windowView) => {
        const match = /^v(\d+)$/i.exec(String(windowView?.id || ''));
        if (!match) return maxValue;
        return Math.max(maxValue, Number(match[1]));
      }, 1);

    windowCounterRef.current = Math.max(windowCounterRef.current, maxWindowId);
  }, [workspaceWindows]);

  // Tauri WebviewWindow reconciliation
  useEffect(() => {
    if (!isClientLoaded || typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return;

    let cancelled = false;

    async function reconcileBrowserWindows() {
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const entries = await Promise.all(
          Object.entries(browserWindowStates || {}).map(async ([wsId, state]) => {
            const label = state?.label || buildBrowserWindowLabel(projectId, wsId);
            const existingWindow = await WebviewWindow.getByLabel(label);

            if (existingWindow) {
              existingWindow.once('tauri://destroyed', () => {
                setBrowserWindowStates((prev) => ({
                  ...prev,
                  [wsId]: { ...prev?.[wsId], open: false, label, url: '', updatedAt: Date.now() },
                }));
              });
            }

            return [
              wsId,
              {
                ...state,
                label,
                open: Boolean(existingWindow),
                url: existingWindow ? state?.url || '' : '',
                updatedAt: Date.now(),
              },
            ];
          })
        );

        if (cancelled || entries.length === 0) return;

        setBrowserWindowStates((prev) => {
          let changed = false;
          const next = { ...prev };

          entries.forEach(([wsId, state]) => {
            const previous = prev?.[wsId] || {};
            if (
              previous.open !== state.open ||
              previous.label !== state.label ||
              previous.url !== state.url
            ) {
              changed = true;
            }
            next[wsId] = state;
          });

          return changed ? next : prev;
        });
      } catch {
        // Ignore reconciliation errors outside desktop contexts.
      }
    }

    reconcileBrowserWindows();

    return () => {
      cancelled = true;
    };
  }, [browserWindowStates, isClientLoaded, projectId, setBrowserWindowStates]);

  const updateBrowserWindowState = useCallback((wsId, nextValue) => {
    if (!wsId) return;
    setBrowserWindowStates((prev) => {
      const currentState = prev?.[wsId] || {};
      const resolvedState =
        typeof nextValue === 'function'
          ? nextValue(currentState)
          : { ...currentState, ...nextValue };
      return {
        ...prev,
        [wsId]: resolvedState,
      };
    });
  }, [setBrowserWindowStates]);

  const closeWorkspaceBrowserWindow = useCallback(
    async (wsId) => {
      if (!wsId) return;

      const browserState = browserWindowStates?.[wsId];
      const label = browserState?.label || buildBrowserWindowLabel(projectId, wsId);

      try {
        if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
          const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
          const existingWindow = await WebviewWindow.getByLabel(label);
          await existingWindow?.close().catch(() => {});
        }
      } catch {
        // Ignore Tauri close failures so state can still be cleaned up locally.
      } finally {
        updateBrowserWindowState(wsId, {
          open: false,
          label,
          url: '',
          updatedAt: Date.now(),
        });
      }
    },
    [browserWindowStates, projectId, updateBrowserWindowState]
  );

  const addWindowToWorkspace = useCallback(
    (
      wsId,
      panelCounterRef,
      colCounterRef,
      setTerminalRendererPreferences,
      setWorkspaces,
      setActivePanelIds
    ) => {
      panelCounterRef.current += 1;
      colCounterRef.current += 1;
      windowCounterRef.current += 1;

      const newPanelId = `p${panelCounterRef.current}`;
      const newColId = `c${colCounterRef.current}`;
      const newWindowId = `v${windowCounterRef.current}`;
      const newColumns = [createColumn(newColId, newPanelId)];

      setWorkspaceWindows((prev) => {
        const existing = prev[wsId] || [];
        return {
          ...prev,
          [wsId]: [
            ...existing,
            createWindow(newWindowId, `V${existing.length + 1}`, newColumns, newPanelId),
          ],
        };
      });

      setActiveWindowIds((prev) => ({ ...prev, [wsId]: newWindowId }));

      if (setActivePanelIds) {
        setActivePanelIds((prev) => ({ ...prev, [wsId]: newPanelId }));
      }

      if (setTerminalRendererPreferences) {
        setTerminalRendererPreferences((prev) =>
          setPanelRendererPreference(prev, wsId, newPanelId, TERMINAL_RENDERER_INHERIT_MODE)
        );
      }

      setWorkspaces((prev) =>
        prev.map((ws) => (ws.id === wsId ? { ...ws, columns: newColumns } : ws))
      );
    },
    []
  );

  const switchWindowInWorkspace = useCallback(
    (wsId, windowId, setWorkspaces, setActivePanelIds) => {
      const windows = workspaceWindows[wsId] || [];
      const nextWindow = windows.find((win) => win.id === windowId);
      if (!nextWindow) return;

      const nextPanelId =
        nextWindow.activePanelId ||
        nextWindow.columns?.flatMap((col) => col.panels || [])[0]?.id ||
        null;

      setActiveWindowIds((prev) => ({ ...prev, [wsId]: windowId }));

      if (nextPanelId && setActivePanelIds) {
        setActivePanelIds((prev) => ({ ...prev, [wsId]: nextPanelId }));
      }

      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === wsId ? { ...ws, columns: nextWindow.columns || ws.columns } : ws
        )
      );
    },
    [workspaceWindows]
  );

  const removeWindowFromWorkspace = useCallback(
    async (wsId, windowId, setWorkspaces, setActivePanelIds) => {
      const windows = workspaceWindows[wsId] || [];
      if (windows.length <= 1) return;

      const targetWindow = windows.find((win) => win.id === windowId);
      if (targetWindow?.columns?.length) {
        await closeTerminalSessions(
          targetWindow.columns.flatMap((col) => col.panels || []).map((p) => p.id)
        );
      }

      const nextWindows = windows.filter((win) => win.id !== windowId);
      const nextActiveWindowId =
        activeWindowIds[wsId] === windowId ? nextWindows[0]?.id : activeWindowIds[wsId];
      const nextActiveWindow =
        nextWindows.find((win) => win.id === nextActiveWindowId) || nextWindows[0];
      const nextPanelId =
        nextActiveWindow?.activePanelId ||
        nextActiveWindow?.columns?.flatMap((col) => col.panels || [])[0]?.id ||
        null;

      setWorkspaceWindows((prev) => ({ ...prev, [wsId]: nextWindows }));
      setActiveWindowIds((prev) => ({ ...prev, [wsId]: nextActiveWindowId }));

      if (nextPanelId) {
        setActivePanelIds((prev) => ({ ...prev, [wsId]: nextPanelId }));
      }

      if (nextActiveWindow?.columns) {
        setWorkspaces((prev) =>
          prev.map((ws) => (ws.id === wsId ? { ...ws, columns: nextActiveWindow.columns } : ws))
        );
      }
    },
    [workspaceWindows, activeWindowIds]
  );

  return {
    workspaceWindows,
    setWorkspaceWindows,
    activeWindowIds,
    setActiveWindowIds,
    windowCounterRef,
    updateBrowserWindowState,
    closeWorkspaceBrowserWindow,
    addWindowToWorkspace,
    switchWindowInWorkspace,
    removeWindowFromWorkspace,
  };
}
