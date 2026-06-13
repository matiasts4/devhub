'use strict';

const {
  dispatchZedOpenTerminalFromToolResults,
} = require('../dispatchZedActions');

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
          result: { opened: true, workspace: true, terminalId: 'p2', displayName: 'Nate', command: 'ls' },
        },
      ],
      { getTerminalPanelCount: () => 0, dispatchedKeys: keys }
    );
    expect(count).toBe(2);
    expect(dispatchZedOpenTerminal).toHaveBeenCalledTimes(2);
  });
});
