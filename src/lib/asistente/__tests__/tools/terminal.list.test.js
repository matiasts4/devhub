const { terminalTool, listTerminalsTool, reviewTerminalTool } = require('../../tools/terminal');

const REAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = REAL_FETCH;
  jest.resetAllMocks();
});

function mockFetch(impl) {
  global.fetch = jest.fn(impl);
}

describe('open_terminal (terminalTool)', () => {
  test('opens workspace UI path without POST /api/terminal/session', async () => {
    mockFetch(async () => {
      throw new Error('fetch should not be called');
    });

    const result = await terminalTool.execute(
      { cwd: '/tmp/devhub-x', command: 'ls' },
      {}
    );

    expect(result).toEqual({
      opened: true,
      workspace: true,
      cwd: '/tmp/devhub-x',
      command_sent: 'ls',
      command: 'ls',
      hint: expect.stringMatching(/list_terminals/i),
    });
  });

  test('supports explicit agent program= (opencode) by building launch command and returning it as command_sent', async () => {
    const result = await terminalTool.execute({ program: 'opencode' }, {});
    expect(result.opened).toBe(true);
    expect(result.workspace).toBe(true);
    // Should have computed a launch command (contains "opencode" or "--agent")
    expect(result.command_sent || result.command || '').toMatch(/opencode|--agent/i);
    expect(result.program).toBe('opencode');
  });

  test('open_terminal echoes command_sent when command is provided', async () => {
    const result = await terminalTool.execute({ command: 'ls -la' }, {});
    expect(result.command_sent).toBe('ls -la');
    expect(result.workspace).toBe(true);
    expect(result.opened).toBe(true);
  });

  test('open_terminal adds a note when no command is provided', async () => {
    const result = await terminalTool.execute({}, {});
    expect(result.note).toMatch(/empty/i);
    expect(result.opened).toBe(true);
  });
});

describe('list_terminals (listTerminalsTool)', () => {
  test('GETs /api/terminal/processes and returns the processes array', async () => {
    const calls = [];
    mockFetch(async (url) => {
      calls.push({ url });
      return {
        ok: true,
        status: 200,
        json: async () => ({ processes: [{ terminalId: 'p1' }, { terminalId: 'p2' }] }),
      };
    });
    const result = await listTerminalsTool.execute({}, {});
    expect(calls[0].url).toMatch(/\/api\/terminal\/processes$/);
    expect(result.processes).toEqual([{ terminalId: 'p1' }, { terminalId: 'p2' }]);
  });

  test('returns empty processes array when backend has none', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ processes: [] }),
    }));
    const result = await listTerminalsTool.execute({}, {});
    expect(result).toEqual({ processes: [] });
  });
});

describe('review_terminal_output (reviewTerminalTool)', () => {
  test('GETs /api/terminal/session/:id/capture and returns output', async () => {
    const calls = [];
    mockFetch(async (url) => {
      calls.push({ url });
      return {
        ok: true,
        status: 200,
        json: async () => ({ output: 'hello\n', session_id: 'p1' }),
      };
    });
    const result = await reviewTerminalTool.execute({ session_id: 'p1' }, {});
    expect(calls[0].url).toMatch(/\/api\/terminal\/session\/p1\/capture$/);
    expect(result.output).toBe('hello\n');
    expect(result.session_id).toBe('p1');
  });

  test('returns missing-parameter error and does NOT call fetch', async () => {
    const calls = [];
    mockFetch(async (...args) => {
      calls.push(args);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const result = await reviewTerminalTool.execute({}, {});
    expect(calls).toHaveLength(0);
    expect(result.error).toBe('missing required parameter: session_id');
  });
});