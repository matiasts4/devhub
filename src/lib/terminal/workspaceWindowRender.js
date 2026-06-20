/** Keep every terminal mounted in focus mode; only layout visibility changes. */
export function resolvePanelVisibleInLayout({
  isWorkspaceVisibleInLayout,
  focusedPanelId,
  panelId,
}) {
  if (!isWorkspaceVisibleInLayout) return false;
  if (!focusedPanelId) return true;
  return focusedPanelId === panelId;
}

export function resolveActiveWorkspaceWindowId(wsId, workspaceWindows, activeWindowIds) {
  const windows = workspaceWindows?.[wsId] || [];
  return activeWindowIds?.[wsId] || windows[0]?.id || null;
}

/** Fallback to live columns when window snapshots are not initialized yet. */
export function resolveWorkspaceWindowsForRender(ws, workspaceWindows) {
  const windows = workspaceWindows?.[ws.id];
  if (Array.isArray(windows) && windows.length > 0) return windows;
  return [{ id: `${ws.id}-default`, columns: ws.columns || [] }];
}
