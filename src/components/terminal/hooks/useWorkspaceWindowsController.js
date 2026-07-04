// useWorkspaceWindowsController — manages workspace window state and Tauri WebviewWindow IPC.
// Extracted from TerminalWorkspacesManager.jsx.

import { useState, useCallback, useEffect, useRef } from 'react';
import { buildBrowserWindowLabel } from '../../workspace/browserWindowState';
import { closeTerminalSessions } from '../workspaceStateHelpers';
import { createColumn, createWindow } from '../utils/panelHelpers';
import {
  setPanelRendererPreference,
  TERMINAL_RENDERER_INHERIT_MODE,
} from '../terminalRendererPreferences';
import { applyActiveWindowColumnSnapshot } from '@/lib/terminal/swarmLaunchWorkspace';
import { MAX_WORKSPACE_WINDOWS } from '../components/WorkspaceWindowSwitcher';

export default function useWorkspaceWindowsController({
  projectId,
  workspaces,
  activePanelIds,
  isClientLoaded,
  browserWindowStates,
  setBrowserWindowStates,
  workspaceWindowsRef,
  activeWindowIdsRef,
  workspacesRef,
  activePanelIdsRef,
  focusedPanelByWorkspaceRef,
  setFocusedPanelByWorkspace,
  setWorkspaces,
  setActivePanelIds,
  setTerminalRendererPreferences,
  panelCounterRef,
  colCounterRef,
  getAllPanelIds,
  getPanelIdsFromColumns,
}) {
  const [workspaceWindows, setWorkspaceWindows] = useState(() => ({}));
  const [activeWindowIds, setActiveWindowIds] = useState(() => ({}));
  const windowCounterRef = useRef(1);

  useEffect(() => {
    workspaceWindowsRef.current = workspaceWindows;
  }, [workspaceWindows, workspaceWindowsRef]);

  useEffect(() => {
    activeWindowIdsRef.current = activeWindowIds;
  }, [activeWindowIds, activeWindowIdsRef]);

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

  const updateBrowserWindowState = useCallback(
    (wsId, nextValue) => {
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
    },
    [setBrowserWindowStates]
  );

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
                updateBrowserWindowState(wsId, {
                  open: false,
                  label,
                  url: '',
                  updatedAt: Date.now(),
                });
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
  }, [
    browserWindowStates,
    isClientLoaded,
    projectId,
    setBrowserWindowStates,
    updateBrowserWindowState,
  ]);

  const addWindowToWorkspace = useCallback(
    (wsId) => {
      const existing = workspaceWindowsRef.current?.[wsId] || [];
      if (existing.length >= MAX_WORKSPACE_WINDOWS) return;

      const ws = workspacesRef.current.find((entry) => entry.id === wsId);
      const liveColumns = ws?.columns || [];
      const activeWindowId = activeWindowIdsRef.current?.[wsId];

      panelCounterRef.current += 1;
      colCounterRef.current += 1;
      windowCounterRef.current += 1;

      const newPanelId = `p${panelCounterRef.current}`;
      const newColId = `c${colCounterRef.current}`;
      const newWindowId = `v${windowCounterRef.current}`;
      const newColumns = [createColumn(newColId, newPanelId)];

      setWorkspaceWindows((prev) => {
        const prevExisting = prev[wsId] || [];
        const snapshotted =
          activeWindowId && liveColumns.length > 0
            ? applyActiveWindowColumnSnapshot(
                prevExisting,
                activeWindowId,
                liveColumns,
                activePanelIdsRef.current?.[wsId]
              )
            : prevExisting;

        return {
          ...prev,
          [wsId]: [
            ...snapshotted,
            createWindow(newWindowId, `V${prevExisting.length + 1}`, newColumns, newPanelId),
          ],
        };
      });

      setActiveWindowIds((prev) => ({ ...prev, [wsId]: newWindowId }));
      setActivePanelIds((prev) => ({ ...prev, [wsId]: newPanelId }));
      setTerminalRendererPreferences((prev) =>
        setPanelRendererPreference(prev, wsId, newPanelId, TERMINAL_RENDERER_INHERIT_MODE)
      );

      setWorkspaces((prev) =>
        prev.map((entry) => (entry.id === wsId ? { ...entry, columns: newColumns } : entry))
      );
    },
    [
      workspaceWindowsRef,
      workspacesRef,
      activeWindowIdsRef,
      activePanelIdsRef,
      panelCounterRef,
      colCounterRef,
      setActivePanelIds,
      setTerminalRendererPreferences,
      setWorkspaces,
    ]
  );

  const switchWindowInWorkspace = useCallback(
    (wsId, windowId) => {
      const windows = workspaceWindowsRef.current?.[wsId] || [];
      const nextWindow = windows.find((win) => win.id === windowId);
      if (!nextWindow) return;

      const activeWindowId = activeWindowIdsRef.current?.[wsId];
      if (activeWindowId === windowId) return;

      const ws = workspacesRef.current.find((entry) => entry.id === wsId);
      const liveColumns = ws?.columns || [];

      let resolvedWindows = windows;
      if (activeWindowId && liveColumns.length > 0) {
        resolvedWindows = applyActiveWindowColumnSnapshot(
          windows,
          activeWindowId,
          liveColumns,
          activePanelIdsRef.current?.[wsId]
        );
        setWorkspaceWindows((prev) => ({ ...prev, [wsId]: resolvedWindows }));
      }

      const destination = resolvedWindows.find((win) => win.id === windowId) || nextWindow;
      const nextPanelId =
        destination.activePanelId ||
        destination.columns?.flatMap((col) => col.panels || [])[0]?.id ||
        null;

      const focusedPanelId = focusedPanelByWorkspaceRef.current?.[wsId];
      const destinationPanelIds = getPanelIdsFromColumns(destination.columns || []);
      if (focusedPanelId && !destinationPanelIds.includes(focusedPanelId)) {
        setFocusedPanelByWorkspace((prev) => {
          if (!prev[wsId]) return prev;
          const next = { ...prev };
          delete next[wsId];
          return next;
        });
      }

      setActiveWindowIds((prev) => ({ ...prev, [wsId]: windowId }));
      if (nextPanelId) {
        setActivePanelIds((prev) => ({ ...prev, [wsId]: nextPanelId }));
      }

      setWorkspaces((prev) =>
        prev.map((entry) =>
          entry.id === wsId ? { ...entry, columns: destination.columns || entry.columns } : entry
        )
      );
    },
    [
      workspaceWindowsRef,
      workspacesRef,
      activeWindowIdsRef,
      activePanelIdsRef,
      focusedPanelByWorkspaceRef,
      setFocusedPanelByWorkspace,
      setActivePanelIds,
      setWorkspaces,
      getPanelIdsFromColumns,
    ]
  );

  const removeWindowFromWorkspace = useCallback(
    async (wsId, windowId) => {
      const windows = workspaceWindows[wsId] || [];
      if (windows.length <= 1) return;

      const targetWindow = windows.find((win) => win.id === windowId);
      if (targetWindow?.columns?.length) {
        const panelIds = getAllPanelIds(targetWindow.columns);
        await closeTerminalSessions(panelIds);
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
    [workspaceWindows, activeWindowIds, getAllPanelIds, setActivePanelIds, setWorkspaces]
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
