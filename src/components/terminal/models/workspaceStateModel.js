// Workspace/panel/window state model — pure helpers extracted from TerminalWorkspacesManager.jsx.

import {
  getDisplayName as getPanelDisplayNameFromStore,
  setDisplayName as setPanelDisplayNameInStore,
  nextDisplayNameForPanel as nextPoolNameForWorkspace,
} from '@/lib/terminal/panelDisplayName';
import { resolveActiveWorkspaceWindowId } from '@/lib/terminal/workspaceWindowRender';

const NEXT_DEV_OVERLAY_HIDE_STYLE_ID = 'devhub-hide-next-dev-overlay-on-terminals';

const createPanel = (id, initialCommand = null, panelCwd = null, metadata = null) => ({
  id,
  initialCommand,
  cwd: panelCwd,
  swarmRole: metadata?.swarmRole || null,
  swarmContext: metadata?.swarmContext || null,
  displayName: metadata?.displayName ?? null,
  terminalEngineV2: metadata?.terminalEngineV2 ?? false,
});

function createPanelWithDisplayNameFactory(workspaceId, getSiblingNames = () => []) {
  return (id, initialCommand = null, panelCwd = null, metadata = null) => {
    const existing = getPanelDisplayNameFromStore(id, workspaceId);
    if (existing) {
      return createPanel(id, initialCommand, panelCwd, {
        ...(metadata || {}),
        displayName: existing,
      });
    }
    const reserved =
      typeof metadata?.displayName === 'string' && metadata.displayName.trim()
        ? metadata.displayName.trim()
        : null;
    if (reserved) {
      setPanelDisplayNameInStore(id, workspaceId, reserved);
      return createPanel(id, initialCommand, panelCwd, {
        ...(metadata || {}),
        displayName: reserved,
      });
    }
    const siblings = typeof getSiblingNames === 'function' ? getSiblingNames() : [];
    const assigned = nextPoolNameForWorkspace(workspaceId, siblings);
    setPanelDisplayNameInStore(id, workspaceId, assigned);
    return createPanel(id, initialCommand, panelCwd, {
      ...(metadata || {}),
      displayName: assigned,
    });
  };
}

const createColumn = (colId, panelId, initialCommand = null, panelCwd = null) => ({
  id: colId,
  panels: [createPanel(panelId, initialCommand, panelCwd)],
});

const createWindow = (id, name, columns, activePanelId = null) => ({
  id,
  name,
  columns,
  activePanelId,
});

function getPanelIdsFromColumns(columns = []) {
  return columns.flatMap((column) => (column?.panels || []).map((panel) => panel.id));
}

function resolveWorkspaceVisibleTerminalPanelCount(columns = []) {
  return getPanelIdsFromColumns(columns).length;
}

/** Count unique panels across all stacked windows (V1/V2/V3) for GPU/layout hints. */
function resolveWorkspaceAllWindowsTerminalPanelCount(ws, workspaceWindows = {}) {
  const windows = workspaceWindows?.[ws?.id] || [];
  if (windows.length > 0) {
    const uniquePanelIds = new Set();
    for (const win of windows) {
      for (const panelId of getPanelIdsFromColumns(win.columns || [])) {
        if (panelId) uniquePanelIds.add(panelId);
      }
    }
    return uniquePanelIds.size;
  }
  return resolveWorkspaceVisibleTerminalPanelCount(ws?.columns || []);
}

function columnContainsFocusedPanel(column, focusedPanelId) {
  if (!focusedPanelId) return true;
  return (column?.panels || []).some((panel) => panel.id === focusedPanelId);
}

function resolveFocusPanelSlotClassName({ focusedPanelId, panelId }) {
  if (!focusedPanelId) return 'h-full w-full min-h-0 min-w-0';
  if (focusedPanelId === panelId) {
    return 'absolute inset-0 z-20 h-full w-full min-h-0 min-w-0';
  }
  return 'hidden';
}

function getPanelsFromColumns(columns = []) {
  return columns.flatMap((column) => column?.panels || []);
}

function collectEngineV2PanelIds(workspaces = [], workspaceWindows = {}, activeWindowIds = {}) {
  const engineV2PanelIds = new Set();
  for (const ws of workspaces) {
    const windowId = resolveActiveWorkspaceWindowId(ws.id, workspaceWindows, activeWindowIds);
    const windows = workspaceWindows?.[ws.id] || [];
    const activeWindow = windows.find((win) => win.id === windowId);
    const panels = getPanelsFromColumns(activeWindow?.columns || ws.columns || []);
    for (const panel of panels) {
      if (panel?.terminalEngineV2) {
        engineV2PanelIds.add(panel.id);
      }
    }
  }
  return engineV2PanelIds;
}

function createDefaultWorkspaceState() {
  const wsId = 'ws1';
  const createPanelFn = createPanelWithDisplayNameFactory(wsId);
  return {
    workspaces: [
      {
        id: wsId,
        name: 'Workspace 1',
        columns: [{ id: 'c1', panels: [createPanelFn('p1')] }],
      },
    ],
    activeWsId: wsId,
    activePanelIds: { [wsId]: 'p1' },
  };
}

function normalizeWorkspaceState(rawWorkspaces, rawActiveWsId, rawActivePanelIds) {
  const fallbackState = createDefaultWorkspaceState();
  if (!Array.isArray(rawWorkspaces) || rawWorkspaces.length === 0) {
    return fallbackState;
  }

  const usedWorkspaceIds = new Set();
  const usedColumnIds = new Set();
  const usedPanelIds = new Set();
  const workspaceIdMap = new Map();
  const workspaceCounter = 1;
  const columnCounter = 1;
  const panelCounter = 1;

  const nextId = (prefix, preferred, usedIds, counterState) => {
    const rawPreferred = typeof preferred === 'string' ? preferred.trim() : '';
    const pattern = new RegExp(`^${prefix}(\\d+)$`);
    const preferredMatch = rawPreferred.match(pattern);

    if (preferredMatch && !usedIds.has(rawPreferred)) {
      usedIds.add(rawPreferred);
      const numericPart = Number(preferredMatch[1]);
      if (Number.isFinite(numericPart)) {
        counterState.value = Math.max(counterState.value, numericPart + 1);
      }
      return rawPreferred;
    }

    let generatedId = `${prefix}${counterState.value}`;
    while (usedIds.has(generatedId)) {
      counterState.value += 1;
      generatedId = `${prefix}${counterState.value}`;
    }

    usedIds.add(generatedId);
    counterState.value += 1;
    return generatedId;
  };

  const workspaceCounterState = { value: workspaceCounter };
  const columnCounterState = { value: columnCounter };
  const panelCounterState = { value: panelCounter };
  const nextActivePanelIds = {};

  const normalizedWorkspaces = rawWorkspaces.map((workspace, workspaceIndex) => {
    const originalWorkspaceId = typeof workspace?.id === 'string' ? workspace.id : '';
    const workspaceId = nextId('ws', originalWorkspaceId, usedWorkspaceIds, workspaceCounterState);

    if (originalWorkspaceId) {
      workspaceIdMap.set(originalWorkspaceId, workspaceId);
    }

    const originalColumns =
      Array.isArray(workspace?.columns) && workspace.columns.length > 0 ? workspace.columns : [{}];

    let firstPanelId = null;
    const panelIdMap = new Map();

    const columns = originalColumns.map((column) => {
      const columnId = nextId('c', column?.id, usedColumnIds, columnCounterState);
      const originalPanels =
        Array.isArray(column?.panels) && column.panels.length > 0 ? column.panels : [{}];

      const panels = originalPanels.map((panel) => {
        const originalPanelId = typeof panel?.id === 'string' ? panel.id : '';
        const panelId = nextId('p', originalPanelId, usedPanelIds, panelCounterState);

        if (originalPanelId) {
          panelIdMap.set(originalPanelId, panelId);
        }

        if (!firstPanelId) {
          firstPanelId = panelId;
        }

        return {
          id: panelId,
          cwd: panel?.cwd || null,
          initialCommand: panel?.initialCommand || null,
          swarmRole: panel?.swarmRole || null,
          displayName: panel?.displayName || null,
          terminalEngineV2: Boolean(panel?.terminalEngineV2),
        };
      });

      return { id: columnId, panels };
    });

    const originalActivePanelId =
      originalWorkspaceId && rawActivePanelIds ? rawActivePanelIds[originalWorkspaceId] : null;
    nextActivePanelIds[workspaceId] =
      (originalActivePanelId && panelIdMap.get(originalActivePanelId)) || firstPanelId;

    return {
      id: workspaceId,
      name:
        typeof workspace?.name === 'string' && workspace.name.trim()
          ? workspace.name
          : `Workspace ${workspaceIndex + 1}`,
      columns,
    };
  });

  return {
    workspaces: normalizedWorkspaces,
    activeWsId:
      (typeof rawActiveWsId === 'string' && workspaceIdMap.get(rawActiveWsId)) ||
      normalizedWorkspaces[0]?.id ||
      fallbackState.activeWsId,
    activePanelIds: nextActivePanelIds,
  };
}

function buildStableWorkspaceShellKey(scope, workspaceId) {
  return `${scope}-${String(workspaceId || 'unknown')}`;
}

function getWorkspaceTabStyle(totalWorkspaces) {
  if (totalWorkspaces <= 4) {
    return { flex: '1 1 0%', minWidth: '190px', maxWidth: '260px' };
  }
  if (totalWorkspaces <= 7) {
    return { flex: '1 1 0%', minWidth: '158px', maxWidth: '220px' };
  }
  return { flex: '0 1 138px', minWidth: '138px', maxWidth: '180px' };
}

function resolveWorkspacePanelId(workspace, savedPanelId) {
  const panelIds =
    workspace?.columns?.flatMap((column) => column.panels || []).map((panel) => panel.id) || [];
  if (!panelIds.length) return null;
  return savedPanelId && panelIds.includes(savedPanelId) ? savedPanelId : panelIds[0];
}

function normalizeWorkspaceWindows(
  rawWorkspaceWindows,
  rawActiveWindowIds,
  workspaces,
  activePanelIds
) {
  const usedWindowIds = new Set();
  let windowCounter = 1;

  const nextWindowId = (preferredId) => {
    const normalizedPreferred = typeof preferredId === 'string' ? preferredId.trim() : '';
    const preferredMatch = /^v(\d+)$/i.exec(normalizedPreferred);

    if (preferredMatch && !usedWindowIds.has(normalizedPreferred)) {
      usedWindowIds.add(normalizedPreferred);
      windowCounter = Math.max(windowCounter, Number(preferredMatch[1]) + 1);
      return normalizedPreferred;
    }

    let candidate = `v${windowCounter}`;
    while (usedWindowIds.has(candidate)) {
      windowCounter += 1;
      candidate = `v${windowCounter}`;
    }

    usedWindowIds.add(candidate);
    windowCounter += 1;
    return candidate;
  };

  const nextWorkspaceWindows = {};
  const nextActiveWindowIds = {};

  workspaces.forEach((ws, wsIndex) => {
    const existingWindows =
      Array.isArray(rawWorkspaceWindows?.[ws.id]) && rawWorkspaceWindows[ws.id].length > 0
        ? rawWorkspaceWindows[ws.id]
        : null;

    if (existingWindows) {
      const normalizedWindows = existingWindows.map((win, index) => {
        const columns =
          Array.isArray(win?.columns) && win.columns.length > 0 ? win.columns : ws.columns;
        const panelIds = columns.flatMap((col) => col.panels || []).map((panel) => panel.id);
        const fallbackPanelId = panelIds[0] || activePanelIds[ws.id] || null;
        const activePanelId =
          typeof win?.activePanelId === 'string' && panelIds.includes(win.activePanelId)
            ? win.activePanelId
            : fallbackPanelId;

        return createWindow(
          nextWindowId(win?.id),
          typeof win?.name === 'string' && win.name.trim() ? win.name.trim() : `V${index + 1}`,
          columns,
          activePanelId
        );
      });

      nextWorkspaceWindows[ws.id] = normalizedWindows;

      const requestedActiveWindowId = rawActiveWindowIds?.[ws.id];
      const activeWindow =
        normalizedWindows.find(
          (win, index) => existingWindows[index]?.id === requestedActiveWindowId
        ) || normalizedWindows[0];

      nextActiveWindowIds[ws.id] = activeWindow?.id || normalizedWindows[0]?.id || null;

      if (activeWindow?.columns?.length) {
        ws.columns = activeWindow.columns;
        activePanelIds[ws.id] =
          activeWindow.activePanelId ||
          activeWindow.columns.flatMap((col) => col.panels || [])[0]?.id ||
          activePanelIds[ws.id];
      }

      return;
    }

    const windowId = nextWindowId();
    const activePanelId = activePanelIds[ws.id] || ws.columns[0]?.panels?.[0]?.id || null;
    nextWorkspaceWindows[ws.id] = [
      createWindow(windowId, `V${wsIndex + 1}`, ws.columns, activePanelId),
    ];
    nextActiveWindowIds[ws.id] = windowId;
  });

  return {
    workspaceWindows: nextWorkspaceWindows,
    activeWindowIds: nextActiveWindowIds,
    windowCounter,
  };
}

export {
  NEXT_DEV_OVERLAY_HIDE_STYLE_ID,
  createPanel,
  createPanelWithDisplayNameFactory,
  createColumn,
  createWindow,
  getPanelIdsFromColumns,
  resolveWorkspaceVisibleTerminalPanelCount,
  resolveWorkspaceAllWindowsTerminalPanelCount,
  columnContainsFocusedPanel,
  resolveFocusPanelSlotClassName,
  getPanelsFromColumns,
  collectEngineV2PanelIds,
  createDefaultWorkspaceState,
  normalizeWorkspaceState,
  buildStableWorkspaceShellKey,
  getWorkspaceTabStyle,
  resolveWorkspacePanelId,
  normalizeWorkspaceWindows,
};
