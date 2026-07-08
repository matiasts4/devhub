'use strict';

const { dispatchZedOpenTerminalFromToolResults } = require('../dispatchZedActions');

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

const { dispatchZedOpenTerminal } = require('@/components/zedOpenTerminalEvent');

describe('dispatchZedOpenTerminalFromToolResults', () => {
  beforeEach(() => {
    dispatchZedOpenTerminal.mockClear();
  });

  test('dispatches all successful open_terminal results', () => {
    const keys = new Set();
    const count = dispatchZedOpenTerminalFromToolResults(
      [
        {
          tool: 'open_terminal',
          result: { opened: true, workspace: true, terminalId: 'p1', displayName: 'Chase' },
        },
        {
          tool: 'open_terminal',
          result: {
            opened: true,
            workspace: true,
            terminalId: 'p2',
            displayName: 'Nate',
            command: 'ls',
          },
        },
      ],
      { getTerminalPanelCount: () => 0, dispatchedKeys: keys }
    );
    expect(count).toBe(2);
    expect(dispatchZedOpenTerminal).toHaveBeenCalledTimes(2);
  });

  test('defaults focus to false so multi-open does not maximize panels', () => {
    dispatchZedOpenTerminalFromToolResults(
      [
        {
          tool: 'open_terminal',
          result: { opened: true, workspace: true, terminalId: 'p9', displayName: 'Alex' },
        },
      ],
      { getTerminalPanelCount: () => 0 }
    );
    expect(dispatchZedOpenTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ focus: false, terminalId: 'p9', displayName: 'Alex' })
    );
  });

  test('honors explicit focus:true from tool result', () => {
    dispatchZedOpenTerminalFromToolResults(
      [
        {
          tool: 'open_terminal',
          result: {
            opened: true,
            workspace: true,
            terminalId: 'p9',
            displayName: 'Alex',
            focus: true,
          },
        },
      ],
      { getTerminalPanelCount: () => 0 }
    );
    expect(dispatchZedOpenTerminal).toHaveBeenCalledWith(expect.objectContaining({ focus: true }));
  });
});
