'use strict';

const { closeTerminalTool, closeAllTerminalsTool } = require('../../tools/terminal');

const REAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = REAL_FETCH;
  jest.resetAllMocks();
});

function mockFetchProcesses(processes) {
  global.fetch = jest.fn(async (url) => {
    if (typeof url === 'string' && url.includes('/api/terminal/processes')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ processes: processes || [] }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

jest.mock('@/lib/terminal/closeTerminalSession', () => ({
  closeTerminalSessionById: jest.fn(async (sessionId) => ({ closed: true, sessionId })),
}));

const TERMINALS = [
  { terminalId: 'p1', displayName: 'Chase' },
  { terminalId: 'p3', displayName: 'Cesar' },
];

describe('closeTerminalTool', () => {
  test('closes immediately without confirmation', async () => {
    mockFetchProcesses(TERMINALS);
    const { closeTerminalSessionById } = require('@/lib/terminal/closeTerminalSession');
    closeTerminalSessionById.mockClear();
    const result = await closeTerminalTool.execute(
      { name: 'Chase' },
      {
        workspace_terminals: TERMINALS,
      }
    );
    expect(result.success).toBe(true);
    expect(result.panel_closed).toBe(true);
    expect(result.displayName).toBe('Chase');
    expect(closeTerminalSessionById).toHaveBeenCalledWith('p1');
  });

  test('closes by session_id immediately', async () => {
    const { closeTerminalSessionById } = require('@/lib/terminal/closeTerminalSession');
    closeTerminalSessionById.mockClear();
    const result = await closeTerminalTool.execute({ session_id: 'p3' }, {});
    expect(result.success).toBe(true);
    expect(closeTerminalSessionById).toHaveBeenCalledWith('p3');
  });
});

describe('closeAllTerminalsTool', () => {
  test('closes all immediately without confirmation', async () => {
    mockFetchProcesses(TERMINALS);
    const { closeTerminalSessionById } = require('@/lib/terminal/closeTerminalSession');
    closeTerminalSessionById.mockClear();
    const result = await closeAllTerminalsTool.execute(
      { names: ['Chase', 'Cesar'] },
      {
        workspace_terminals: TERMINALS,
      }
    );
    expect(result.success).toBe(true);
    expect(result.closed).toBe(2);
    expect(closeTerminalSessionById).toHaveBeenCalledTimes(2);
    expect(closeTerminalSessionById).toHaveBeenCalledWith('p1');
    expect(closeTerminalSessionById).toHaveBeenCalledWith('p3');
  });

  test('errors when names is empty', async () => {
    const result = await closeAllTerminalsTool.execute({ names: [] }, {});
    expect(result.error).toBe('missing required parameter: names');
  });

  test('errors when no terminals match', async () => {
    mockFetchProcesses(TERMINALS);
    const result = await closeAllTerminalsTool.execute(
      { names: ['NoExiste'] },
      {
        workspace_terminals: TERMINALS,
      }
    );
    expect(result.error).toBe('not_found');
  });
});
