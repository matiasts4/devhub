const {
  MAX_ZED_TERMINAL_PANELS,
  MAX_WORKSPACE_TERMINAL_PANELS,
  buildTerminalPanelLimitError,
  isWorkspaceTerminalPanelLimitReached,
  resolveEffectiveTerminalPanelCount,
} = require('../workspaceTerminalLimits');

describe('workspaceTerminalLimits', () => {
  test('Zed limit is 6 and manual workspace limit is 12', () => {
    expect(MAX_ZED_TERMINAL_PANELS).toBe(6);
    expect(MAX_WORKSPACE_TERMINAL_PANELS).toBe(12);
  });

  test('isWorkspaceTerminalPanelLimitReached at manual boundary', () => {
    expect(isWorkspaceTerminalPanelLimitReached(11)).toBe(false);
    expect(isWorkspaceTerminalPanelLimitReached(12)).toBe(true);
    expect(isWorkspaceTerminalPanelLimitReached(6, MAX_ZED_TERMINAL_PANELS)).toBe(true);
    expect(isWorkspaceTerminalPanelLimitReached(5, MAX_ZED_TERMINAL_PANELS)).toBe(false);
  });

  test('buildTerminalPanelLimitError defaults to Zed limit', () => {
    expect(buildTerminalPanelLimitError(6)).toEqual({
      error: 'terminal_panel_limit_reached',
      opened: false,
      workspace: true,
      limit: 6,
      current_panel_count: 6,
      hint: expect.stringMatching(/maximum 6/i),
    });
  });

  test('resolveEffectiveTerminalPanelCount sums request opens', () => {
    expect(
      resolveEffectiveTerminalPanelCount({
        terminal_panel_count: 4,
        _terminal_opens_this_request: 2,
      })
    ).toBe(6);
  });
});