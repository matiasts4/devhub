const {
  terminalTool,
  listTerminalsTool,
  reviewTerminalTool,
  _resetOpenTerminalCounterForTests,
} = require('../../tools/terminal');

const REAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = REAL_FETCH;
  if (typeof _resetOpenTerminalCounterForTests === 'function') {
    _resetOpenTerminalCounterForTests();
  }
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

    const result = await terminalTool.execute({ cwd: '/tmp/devhub-x', command: 'ls' }, {});

    expect(result).toEqual({
      opened: true,
      workspace: true,
      cwd: '/tmp/devhub-x',
      command_sent: 'ls',
      command: 'ls',
      terminalId: expect.stringMatching(/^p\d+$/),
      displayName: expect.any(String),
      hint: expect.stringMatching(/list_terminals/i),
    });
  });

  test('supports explicit agent program= (opencode) by building launch command and returning it as command_sent', async () => {
    const result = await terminalTool.execute({ program: 'opencode' }, {});
    expect(result.opened).toBe(true);
    expect(result.workspace).toBe(true);
    // Should have computed a launch command (contains "opencode" or "--agent")
    expect(result.command_sent || result.command || '').toMatch(/opencode|--agent/i);
    expect(result.command_sent || result.command || '').toMatch(/--agent\s+gentle-orchestrator/i);
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

  test('open_terminal rejects when workspace panel limit is reached', async () => {
    const context = { terminal_panel_count: 6, max_terminal_panels: 6 };
    const result = await terminalTool.execute({ program: 'opencode' }, context);
    expect(result.error).toBe('terminal_panel_limit_reached');
    expect(result.opened).toBe(false);
    expect(context._terminal_opens_this_request).toBeUndefined();
  });

  test('open_terminal blocks destructive commands', async () => {
    const result = await terminalTool.execute({ command: 'rm -rf dist' }, {});
    expect(result.error).toBe('command_blocked');
    expect(result.opened).toBeUndefined();
  });

  test('open_terminal requires approval for non-allowlisted commands', async () => {
    const result = await terminalTool.execute({ command: 'npm install left-pad' }, {});
    expect(result.error).toBe('command_requires_approval');
    expect(result.action).toBe('would_execute');
  });

  test('open_terminal allows npm run dev without confirm', async () => {
    const result = await terminalTool.execute({ command: 'npm run dev' }, {});
    expect(result.opened).toBe(true);
    expect(result.command_sent).toBe('npm run dev');
  });

  test('open_terminal tracks opens within a single API request', async () => {
    const context = { terminal_panel_count: 4, max_terminal_panels: 6 };
    const first = await terminalTool.execute({ command: 'ls' }, context);
    const second = await terminalTool.execute({ command: 'pwd' }, context);
    const third = await terminalTool.execute({ command: 'whoami' }, context);
    expect(first.opened).toBe(true);
    expect(second.opened).toBe(true);
    expect(third.error).toBe('terminal_panel_limit_reached');
    expect(context._terminal_opens_this_request).toBe(2);
  });

  // T-103 / ZTT-003: open_terminal accepts an optional `name` parameter.
  // When provided, the tool reserves that displayName and returns the
  // canonical { terminalId, displayName, ... } shape so the model can
  // immediately call execute_in_terminal({name: ...}) or
  // summarize_terminal({name: ...}) without re-resolving.
  test('open_terminal({name:"Chase"}) returns the full { terminalId, displayName, workspace } shape', async () => {
    const result = await terminalTool.execute({ name: 'Chase' }, {});
    expect(result.opened).toBe(true);
    expect(result.workspace).toBe(true);
    // Spec ZTT-003 example: terminalId is a fresh p<id> and displayName is
    // the requested name. We don't pin the numeric id because the test
    // counter is per-process and previous tests may have incremented it.
    expect(result.displayName).toBe('Chase');
    expect(typeof result.terminalId).toBe('string');
    expect(result.terminalId).toMatch(/^p\d+$/);
  });

  test('open_terminal({name:"Maverick"}) still returns a valid shape when name is not in the default pool', async () => {
    // "Maverick" is not in the pool; pool.acquire falls back to "Panel-N".
    // The shape must still expose terminalId + displayName.
    const result = await terminalTool.execute({ name: 'Maverick' }, {});
    expect(result.opened).toBe(true);
    expect(typeof result.terminalId).toBe('string');
    expect(result.terminalId.length).toBeGreaterThan(0);
    expect(typeof result.displayName).toBe('string');
    expect(result.displayName.length).toBeGreaterThan(0);
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
    expect(result.processes).toEqual([
      { terminalId: 'p1', displayName: 'Alex' },
      { terminalId: 'p2', displayName: 'Avery' },
    ]);
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

  // T-101 / ZTT-002: list_terminals MUST fall back to nameFromId(terminalId)
  // for any entry missing displayName so the model never sees undefined.
  test('augments each entry missing displayName with nameFromId(terminalId) (ZTT-002)', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        processes: [
          { terminalId: 'p1' }, // missing displayName → Alex
          { terminalId: 'p2' }, // missing displayName → Avery
          { terminalId: 'p7', displayName: 'Chase' }, // already has one → keep it
        ],
      }),
    }));
    const result = await listTerminalsTool.execute({}, {});
    // The first two get pool-derived names; the third is preserved as-is.
    const byId = Object.fromEntries(result.processes.map((p) => [p.terminalId, p]));
    expect(byId.p1.displayName).toBe('Alex');
    expect(byId.p2.displayName).toBe('Avery');
    expect(byId.p7.displayName).toBe('Chase');
    // No undefined leaked anywhere.
    for (const p of result.processes) {
      expect(typeof p.displayName).toBe('string');
      expect(p.displayName.length).toBeGreaterThan(0);
    }
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

  // T-104 / ZTT-004: review_terminal_output also accepts `name` as an
  // alternative to `session_id`. The lookup is the same resolver path.
  test('review_terminal_output({name:"Chase"}) resolves and GETs the right capture endpoint', async () => {
    const calls = [];
    mockFetch(async (url) => {
      calls.push({ url });
      if (typeof url === 'string' && url.includes('/api/terminal/processes')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            processes: [{ terminalId: 'p7', displayName: 'Chase' }],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ output: 'tail\n', session_id: 'p7' }),
      };
    });
    const result = await reviewTerminalTool.execute({ name: 'Chase' }, {});
    const cap = calls.find(
      (c) => typeof c.url === 'string' && c.url.includes('/api/terminal/session/p7/capture')
    );
    expect(cap).toBeDefined();
    expect(result.output).toBe('tail\n');
    expect(result.session_id).toBe('p7');
  });

  test('review_terminal_output with both name and session_id set: Spanish error, NO HTTP call', async () => {
    const calls = [];
    mockFetch(async (...args) => {
      calls.push(args);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const result = await reviewTerminalTool.execute({ name: 'Chase', session_id: 'p2' }, {});
    expect(calls).toHaveLength(0);
    expect(result.error).toBe('both_name_and_session');
    expect(result.message).toBe('no podés pasar name y session_id a la vez.');
  });

  test('blocks duplicate review on same session_id without new input', async () => {
    const ctx = { _zed_review_guard: {} };
    mockFetch(async (url) => ({
      ok: true,
      status: 200,
      json: async () => ({ output: 'same', session_id: 'p1' }),
    }));
    const first = await reviewTerminalTool.execute({ session_id: 'p1' }, ctx);
    expect(first.output).toBe('same');
    const second = await reviewTerminalTool.execute({ session_id: 'p1' }, ctx);
    expect(second.error).toBe('no_new_output_since_last_review');
  });
});
