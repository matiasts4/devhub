/** Max terminal panels Zed may open per workspace (tool + event path). */
export const MAX_ZED_TERMINAL_PANELS = 6;

/** Max terminal panels for manual splits (+, split right/down) per workspace. */
export const MAX_WORKSPACE_TERMINAL_PANELS = 12;

export function isWorkspaceTerminalPanelLimitReached(
  panelCount,
  limit = MAX_WORKSPACE_TERMINAL_PANELS
) {
  const count = Number(panelCount);
  const max = Number(limit);
  if (!Number.isFinite(count) || count < 0) return false;
  if (!Number.isFinite(max) || max < 1) return false;
  return count >= max;
}

export function buildTerminalPanelLimitError(
  panelCount,
  limit = MAX_ZED_TERMINAL_PANELS
) {
  const count = Number(panelCount) || 0;
  const max = Number(limit) || MAX_ZED_TERMINAL_PANELS;
  return {
    error: 'terminal_panel_limit_reached',
    opened: false,
    workspace: true,
    limit: max,
    current_panel_count: count,
    hint: `This workspace already has ${count} terminal panel(s) (maximum ${max}). Close one before opening another.`,
  };
}

export function resolveEffectiveTerminalPanelCount(context = {}) {
  const base = Number(context.terminal_panel_count);
  const openedThisRequest = Number(context._terminal_opens_this_request);
  const safeBase = Number.isFinite(base) && base >= 0 ? base : 0;
  const safeOpened = Number.isFinite(openedThisRequest) && openedThisRequest >= 0 ? openedThisRequest : 0;
  return safeBase + safeOpened;
}