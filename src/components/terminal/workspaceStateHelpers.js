function extractSequentialIdNumber(prefix, value) {
  const match = String(value || '').match(new RegExp(`^${prefix}(\\d+)$`));
  return match ? parseInt(match[1], 10) : 0;
}

export function syncWorkspaceCountersMonotonic(workspaces, currentCounters) {
  const workspaceMax = Math.max(
    1,
    ...workspaces.map((workspace) => extractSequentialIdNumber('ws', workspace.id))
  );
  const columnMax = Math.max(
    1,
    ...workspaces.flatMap((workspace) =>
      workspace.columns.map((column) => extractSequentialIdNumber('c', column.id))
    )
  );
  const panelMax = Math.max(
    1,
    ...workspaces.flatMap((workspace) =>
      workspace.columns.flatMap((column) =>
        column.panels.map((panel) => extractSequentialIdNumber('p', panel.id))
      )
    )
  );

  return {
    workspace: Math.max(currentCounters?.workspace || 1, workspaceMax),
    column: Math.max(currentCounters?.column || 1, columnMax),
    panel: Math.max(currentCounters?.panel || 1, panelMax),
  };
}

export async function closeTerminalSessions(panelIds, fetchImpl = fetch) {
  const uniquePanelIds = [...new Set((panelIds || []).filter(Boolean))];

  await Promise.allSettled(
    uniquePanelIds.map((panelId) =>
      fetchImpl(`/api/terminal/session?sessionId=${encodeURIComponent(panelId)}`, {
        method: 'DELETE',
      })
    )
  );
}
