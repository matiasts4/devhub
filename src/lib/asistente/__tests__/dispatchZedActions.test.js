'use strict';

jest.mock('@/components/zedOpenTerminalEvent', () => ({
  dispatchZedOpenTerminal: jest.fn(),
}));

jest.mock('@/components/zedOpenUrlEvent', () => ({
  dispatchZedOpenUrlFromToolResults: jest.fn(),
}));

jest.mock('@/components/zedCloseSurfaceEvent', () => ({
  dispatchZedCloseFromToolResults: jest.fn(),
}));

jest.mock('@/components/zedTerminalInputEvent', () => ({
  dispatchZedTerminalInputFromToolResults: jest.fn(),
}));

jest.mock('../zedWorkspaceActionEvent', () => ({
  dispatchZedWorkspaceActionFromToolResults: jest.fn(),
}));

const { dispatchZedOpenTerminalFromToolResults } = require('../dispatchZedActions');
const { dispatchZedOpenTerminal } = require('@/components/zedOpenTerminalEvent');

describe('dispatchZedOpenTerminalFromToolResults', () => {
  beforeEach(() => {
    dispatchZedOpenTerminal.mockClear();
  });

  test('dispatches open_terminal workspace opens', () => {
    const count = dispatchZedOpenTerminalFromToolResults(
      [
        {
          tool: 'open_terminal',
          result: {
            opened: true,
            workspace: true,
            command_sent: 'ls',
            terminalId: 'p1',
            displayName: 'Chase',
          },
        },
        {
          tool: 'open_terminal',
          result: {
            opened: true,
            workspace: true,
            command_sent: 'pwd',
            terminalId: 'p2',
          },
        },
      ],
      { getTerminalPanelCount: () => 0 }
    );
    expect(count).toBe(2);
    expect(dispatchZedOpenTerminal).toHaveBeenCalledTimes(2);
  });

  test('forwards bootstrap_input for native TUI paste', () => {
    dispatchZedOpenTerminalFromToolResults(
      [
        {
          tool: 'launch_agent_session',
          result: {
            opened: true,
            workspace: true,
            program: 'grok',
            command_sent: 'grok',
            terminalId: 'p3',
            bootstrap_input: 'refactor auth\n',
          },
        },
      ],
      { getTerminalPanelCount: () => 0 }
    );
    expect(dispatchZedOpenTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'grok',
        terminalId: 'p3',
        program: 'grok',
        bootstrap_input: 'refactor auth\n',
      })
    );
  });
});
