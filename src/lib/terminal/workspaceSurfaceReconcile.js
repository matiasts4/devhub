/**
 * Maps workspace panel columns → pizarra terminal surfaces for reconcile.
 * The active window uses live `workspace.columns` so splits in normal view
 * are reflected immediately (workspaceWindows snapshots can lag).
 */

export function countPanelsInColumns(columns = []) {
  return columns.reduce((sum, col) => sum + (col?.panels?.length || 0), 0);
}

export function resolveWindowColumnsForReconcile({
  windowColumns = [],
  liveColumns = [],
  isActiveWindow = false,
} = {}) {
  const winCols = Array.isArray(windowColumns) && windowColumns.length > 0 ? windowColumns : [];
  const liveCols = Array.isArray(liveColumns) && liveColumns.length > 0 ? liveColumns : [];

  if (isActiveWindow && liveCols.length > 0) {
    return liveCols;
  }
  if (winCols.length > 0) {
    return winCols;
  }
  return liveCols;
}

export function buildTerminalSurfacesFromWindows({
  workspaceId,
  windows = [],
  activeWindowId = null,
  liveColumns = [],
  resolveRequestedRenderer,
  terminalRendererPreferences = {},
  resolveLabel,
} = {}) {
  const activePanelIds = new Set();
  const terminals = [];

  // Active live columns are the freshest ownership source. Process them first,
  // then ignore duplicate panel ids from lagging inactive-window snapshots.
  const orderedWindows = [...windows].sort(
    (a, b) => Number(b?.id === activeWindowId) - Number(a?.id === activeWindowId)
  );

  for (const win of orderedWindows) {
    const viewId = win.id;
    const isActiveWindow = Boolean(activeWindowId && viewId === activeWindowId);
    const columns = resolveWindowColumnsForReconcile({
      windowColumns: win.columns,
      liveColumns,
      isActiveWindow,
    });

    for (const col of columns) {
      for (const p of col.panels || []) {
        if (!p?.id) continue;
        if (activePanelIds.has(p.id)) continue;
        activePanelIds.add(p.id);
        terminals.push({
          id: `shape-term-${p.id}`,
          type: 'terminal',
          panelId: p.id,
          label:
            typeof resolveLabel === 'function'
              ? resolveLabel(p, { workspaceId, viewId, win })
              : p.initialCommand || `Terminal ${p.id}`,
          cwd: p.cwd || null,
          initialCommand: p.initialCommand || null,
          requestedRendererMode: resolveRequestedRenderer({
            workspaceId,
            panelId: p.id,
            prefs: terminalRendererPreferences,
          }),
          pizarra: {
            x: null,
            y: null,
            width: 640,
            height: 400,
            visible: true,
            viewId,
          },
        });
      }
    }
  }

  return { terminals, activePanelIds };
}
