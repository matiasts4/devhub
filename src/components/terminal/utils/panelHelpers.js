// Pure helper functions for workspace/panel/window creation and normalization.
// Extracted from TerminalWorkspacesManager.jsx — no React dependencies.

function createPanel(id, initialCommand = null, panelCwd = null, metadata = null) {
  return {
    id,
    initialCommand,
    cwd: panelCwd,
    swarmRole: metadata?.swarmRole || null,
    displayName: metadata?.displayName || null,
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

function normalizeWorkspaceState(
  rawWorkspaces,
  rawActiveWsId,
  rawActivePanelIds,
  workspaceLabelOverride = null
) {
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
          displayName: panel?.displayName || null,
        };
      });

      return { id: columnId, panels };
    });

    const originalActivePanelId =
      originalWorkspaceId && rawActivePanelIds ? rawActivePanelIds[originalWorkspaceId] : null;
    nextActivePanelIds[workspaceId] =
      (originalActivePanelId && panelIdMap.get(originalActivePanelId)) || firstPanelId;

    // WSN-2 / WSN-S4: use workspace_label (from snapshot override or stored) before workspace.name
    const storedLabel =
      typeof workspaceLabelOverride === 'function'
        ? workspaceLabelOverride(workspace, workspaceIndex)
        : typeof workspaceLabelOverride === 'object' && workspaceLabelOverride !== null
          ? workspaceLabelOverride[workspace?.id || workspaceId] ||
            workspace?.workspace_label ||
            null
          : workspace?.workspace_label || null;
    const displayName =
      storedLabel ||
      (typeof workspace?.name === 'string' && workspace.name.trim()
        ? workspace.name
        : `Workspace ${workspaceIndex + 1}`);

    return {
      id: workspaceId,
      name: displayName,
      workspace_label: storedLabel || null,
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

function resolveWorkspaceGridShape(terminalCount) {
  switch (terminalCount) {
    case 1:
      return { columns: 1, rows: 1 };
    case 2:
      return { columns: 2, rows: 1 };
    case 3:
      return { columns: 3, rows: 1 };
    case 4:
      return { columns: 2, rows: 2 };
    case 6:
      return { columns: 3, rows: 2 };
    default:
      return { columns: 1, rows: Math.max(1, terminalCount) };
  }
}

function buildWorkspaceColumnsForTerminalCount({
  terminalCount,
  createPanel: createPanelFn,
  allocateColumnId,
  allocatePanelId,
  initialCommand = null,
  panelCwd = null,
}) {
  const safeCount = Math.max(0, Math.min(6, Number(terminalCount) || 0));
  if (safeCount === 0) {
    return { columns: [], firstPanelId: null };
  }

  let firstPanelId = null;
  const nextPanel = () => {
    const panelId = allocatePanelId();
    if (!firstPanelId) firstPanelId = panelId;
    return createPanelFn(panelId, initialCommand, panelCwd);
  };

  const panelsByIndex = Array.from({ length: safeCount }, () => nextPanel());

  if (safeCount === 5) {
    // Swarm-style 2+2+1: even workers left, odd workers center, fifth panel right.
    return {
      columns: [
        {
          id: allocateColumnId(),
          panels: [panelsByIndex[0], panelsByIndex[2]],
        },
        {
          id: allocateColumnId(),
          panels: [panelsByIndex[1], panelsByIndex[3]],
        },
        {
          id: allocateColumnId(),
          panels: [panelsByIndex[4]],
        },
      ],
      firstPanelId,
    };
  }

  const { columns: columnCount, rows } = resolveWorkspaceGridShape(safeCount);
  const builtColumns = [];

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const panels = [];
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      const panelIndex = rowIndex * columnCount + columnIndex;
      if (panelIndex >= safeCount) continue;
      panels.push(panelsByIndex[panelIndex]);
    }
    if (panels.length > 0) {
      builtColumns.push({
        id: allocateColumnId(),
        panels,
      });
    }
  }

  return { columns: builtColumns, firstPanelId };
}

/** First terminal panel when workspace has zero panels (split/add from empty). */
function spawnFirstTerminalPanelColumns({
  allocateColumnId,
  allocatePanelId,
  initialCommand = null,
  panelCwd = null,
  explicitPanelId = null,
  createPanel: createPanelFn = createPanel,
}) {
  const panelId =
    typeof explicitPanelId === 'string' && explicitPanelId.length > 0
      ? explicitPanelId
      : allocatePanelId();
  const colId = allocateColumnId();
  return {
    columns: [
      {
        id: colId,
        panels: [createPanelFn(panelId, initialCommand, panelCwd)],
      },
    ],
    panelId,
  };
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
  resolveWorkspaceGridShape,
  buildWorkspaceColumnsForTerminalCount,
  spawnFirstTerminalPanelColumns,
};
