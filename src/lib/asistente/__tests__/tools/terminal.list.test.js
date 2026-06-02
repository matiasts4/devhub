// Mock fetch at the module boundary so the tools hit the local Next API
// the same way the live UI does, without real network.
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
  test('POSTs body { command, program, cwd } to /api/terminal/session', async () => {
    const calls = [];
    mockFetch(async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'abc', port: 4001, wsPath: '/terminal' }),
      };
    });

    const result = await terminalTool.execute(
      { program: 'zsh', cwd: '/tmp/devhub-x', command: 'ls' },
      {}
    );

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toMatch(/\/api\/terminal\/session$/);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toEqual({ program: 'zsh', cwd: '/tmp/devhub-x', command: 'ls' });
    expect(result).toEqual({
      session_id: 'abc',
      port: 4001,
      wsPath: '/terminal',
      command_sent: 'ls',
    });
  });

  test('open_terminal echoes command_sent when command is provided', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'abc', port: 4001, wsPath: '/terminal' }),
    }));

    const result = await terminalTool.execute({ command: 'ls -la' }, {});

    expect(result.command_sent).toBe('ls -la');
    expect(result.session_id).toBe('abc');
    expect(result.port).toBe(4001);
    expect(result.wsPath).toBe('/terminal');
    expect(result.note).toBeUndefined();
  });

  test('open_terminal adds a note when no command is provided', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'abc', port: 4001, wsPath: '/terminal' }),
    }));

    const result = await terminalTool.execute({}, {});

    expect(result.note).toMatch(/no command was sent/i);
    expect(result.session_id).toBe('abc');
    expect(result.port).toBe(4001);
    expect(result.wsPath).toBe('/terminal');
    expect(result.command_sent).toBeUndefined();
  });

  test('returns error when backend response is missing fields', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'abc' }),
    }));
    const result = await terminalTool.execute({}, {});
    expect(result.error).toMatch(/missing required fields/i);
    expect(result.raw).toEqual({ id: 'abc' });
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
        json: async () => ({ processes: [{ id: 's1' }, { id: 's2' }] }),
      };
    });
    const result = await listTerminalsTool.execute({}, {});
    expect(calls[0].url).toMatch(/\/api\/terminal\/processes$/);
    expect(result.processes).toEqual([{ id: 's1' }, { id: 's2' }]);
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
        json: async () => ({ output: 'hello\n', session_id: 'sess-1' }),
      };
    });
    const result = await reviewTerminalTool.execute({ session_id: 'sess-1' }, {});
    expect(calls[0].url).toMatch(/\/api\/terminal\/session\/sess-1\/capture$/);
    expect(result.output).toBe('hello\n');
    expect(result.session_id).toBe('sess-1');
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
