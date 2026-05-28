// Pure helper functions for workspace/panel/window creation and normalization.
// Extracted from TerminalWorkspacesManager.jsx — no React dependencies.

function createPanel(id, initialCommand = null, panelCwd = null, metadata = null) {
  return {
    id,
    initialCommand,
    cwd: panelCwd,
    swarmRole: metadata?.swarmRole || null,
  };
}

function createColumn(colId, panelId, initialCommand = null, panelCwd = null) {
  return {
    id: colId,
    panels: [createPanel(panelId, initialCommand, panelCwd)],
  };
}

function createWindow(id, name, columns, activePanelId = null) {
  return {
    id,
    name,
    columns,
    activePanelId,
  };
}

function createDefaultWorkspaceState() {
  return {
    workspaces: [
      {
        id: 'ws1',
        name: 'Workspace 1',
        columns: [createColumn('c1', 'p1')],
      },
    ],
    activeWsId: 'ws1',
    activePanelIds: { ws1: 'p1' },
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
  const workspaceCounterState = { value: 1 };
  const columnCounterState = { value: 1 };
  const panelCounterState = { value: 1 };

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

function resolveWorkspacePanelId(workspace, savedPanelId) {
  const panelIds =
    workspace?.columns?.flatMap((column) => column.panels || []).map((panel) => panel.id) || [];
  if (!panelIds.length) return null;
  return savedPanelId && panelIds.includes(savedPanelId) ? savedPanelId : panelIds[0];
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

export {
  createPanel,
  createColumn,
  createWindow,
  createDefaultWorkspaceState,
  normalizeWorkspaceState,
  normalizeWorkspaceWindows,
  resolveWorkspacePanelId,
  getWorkspaceTabStyle,
};
