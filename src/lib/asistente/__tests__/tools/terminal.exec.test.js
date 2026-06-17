const { executeInTerminalTool, closeTerminalTool } = require('../../tools/terminal');

const REAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = REAL_FETCH;
  // clearAllMocks (not resetAllMocks) — resetAllMocks wipes the jest.mock(...)
  // factory implementation for closeTerminalSessionById, leaving it returning
  // undefined. clearAllMocks only clears call history, preserving the factory.
  jest.clearAllMocks();
});

function mockFetch(impl) {
  global.fetch = jest.fn(impl);
}

// closeTerminalTool delegates directly to closeTerminalSessionById — we mock
// that module so no real network is touched.
jest.mock('@/lib/terminal/closeTerminalSession', () => ({
  closeTerminalSessionById: jest.fn(async (id) => ({
    success: true,
    sessionId: id,
  })),
}));

const { closeTerminalSessionById } = require('@/lib/terminal/closeTerminalSession');

describe('execute_in_terminal (executeInTerminalTool)', () => {
  test('PUTs body { data: <input> } to /api/terminal/session/:id/input', async () => {
    const calls = [];
    mockFetch(async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ session_id: 'sess-1', sent: true }),
      };
    });

    const result = await executeInTerminalTool.execute(
      { session_id: 'sess-1', input: 'ls -la\n' },
      {}
    );

    // We now also do a best-effort capture after send for observability (recent_output in result when available)
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toMatch(/\/api\/terminal\/session\/sess-1\/input$/);
    expect(calls[0].init.method).toBe('PUT');
    expect(JSON.parse(calls[0].init.body)).toEqual({ data: 'ls -la\n' });
    expect(calls[1].url).toMatch(/\/api\/terminal\/session\/sess-1\/capture$/);
    // The mock capture returned the same {sent:true} (no .output), so no recent_output attached
    expect(result).toEqual({ session_id: 'sess-1', sent: true });
  });

  test('returns missing-parameter error and does NOT call fetch when input is missing', async () => {
    const calls = [];
    mockFetch(async (...args) => {
      calls.push(args);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const result = await executeInTerminalTool.execute({ session_id: 'sess-1' }, {});
    expect(calls).toHaveLength(0);
    expect(result.error).toBe('missing required parameter: input');
  });

  test('blocks destructive execute_in_terminal input', async () => {
    const calls = [];
    mockFetch(async (...args) => {
      calls.push(args);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const result = await executeInTerminalTool.execute(
      { session_id: 'sess-1', input: 'rm -rf .\n' },
      {}
    );
    expect(calls).toHaveLength(0);
    expect(result.error).toBe('command_blocked');
  });

  test('returns missing-parameter error when session_id is missing', async () => {
    const calls = [];
    mockFetch(async (...args) => {
      calls.push(args);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const result = await executeInTerminalTool.execute({ input: 'ls\n' }, {});
    expect(calls).toHaveLength(0);
    expect(result.error).toBe('missing required parameter: session_id');
  });

  // T-104 / ZTT-004: execute_in_terminal accepts `name` as an alternative
  // to `session_id` (mutually exclusive). `name` triggers a resolver lookup
  // over /api/terminal/processes first.
  test('name lookup: execute_in_terminal({name, input}) resolves the name and PUTs to the right session_id', async () => {
    const calls = [];
    mockFetch(async (url, init) => {
      calls.push({ url, init });
      if (typeof url === 'string' && url.includes('/api/terminal/processes')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            processes: [
              { terminalId: 'p7', displayName: 'Chase' },
              { terminalId: 'p2', displayName: 'Nate' },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ session_id: 'p7', sent: true }),
      };
    });
    const result = await executeInTerminalTool.execute({ name: 'Chase', input: 'ls\n' }, {});
    // /processes call first (resolver), then the PUT to p7.
    const putCall = calls.find(
      (c) => typeof c.url === 'string' && c.url.includes('/api/terminal/session/p7/input')
    );
    expect(putCall).toBeDefined();
    expect(putCall.init.method).toBe('PUT');
    expect(JSON.parse(putCall.init.body)).toEqual({ data: 'ls\n' });
    // p2 must NOT have been touched.
    const p2Call = calls.find(
      (c) => typeof c.url === 'string' && c.url.includes('/api/terminal/session/p2/input')
    );
    expect(p2Call).toBeUndefined();
    expect(result.session_id).toBe('p7');
  });

  test('both name and session_id set: Spanish error, NO HTTP call', async () => {
    const calls = [];
    mockFetch(async (...args) => {
      calls.push(args);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const result = await executeInTerminalTool.execute(
      { name: 'Chase', session_id: 'p2', input: 'ls\n' },
      {}
    );
    // No HTTP call at all — we never reach the resolver or the PUT.
    expect(calls).toHaveLength(0);
    expect(result.error).toBe('both_name_and_session');
    expect(result.message).toBe('no podés pasar name y session_id a la vez.');
  });
});

describe('close_terminal (closeTerminalTool)', () => {
  test('closes immediately without confirmation', async () => {
    const calls = [];
    mockFetch(async (...args) => {
      calls.push(args);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const result = await closeTerminalTool.execute({ session_id: 'sess-1' }, {});
    expect(calls).toHaveLength(0);
    expect(closeTerminalSessionById).toHaveBeenCalledWith('sess-1');
    expect(result.success).toBe(true);
    expect(result.session_id).toBe('sess-1');
  });

  test('closes by name immediately', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ processes: [{ terminalId: 'p1', displayName: 'Chase' }] }),
    }));
    const result = await closeTerminalTool.execute(
      { name: 'Chase' },
      { workspace_terminals: [{ terminalId: 'p1', displayName: 'Chase' }] }
    );
    expect(closeTerminalSessionById).toHaveBeenCalledWith('p1');
    expect(result.success).toBe(true);
    expect(result.displayName).toBe('Chase');
  });

  test('missing session_id returns error and does NOT call closeTerminalSessionById', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ processes: [] }) }));
    const result = await closeTerminalTool.execute({}, {});
    expect(result.error).toBe('not_found');
    expect(closeTerminalSessionById).not.toHaveBeenCalled();
  });

  test('implicit single terminal when no name/session_id', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ processes: [] }) }));
    const result = await closeTerminalTool.execute(
      {},
      { workspace_terminals: [{ terminalId: 'p1', displayName: 'Chase' }] }
    );
    expect(closeTerminalSessionById).toHaveBeenCalledWith('p1');
    expect(result.success).toBe(true);
    expect(result.session_id).toBe('p1');
    expect(result.displayName).toBe('Chase');
  });

  test('ambiguous when multiple terminals and no name/session_id', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ processes: [] }) }));
    const result = await closeTerminalTool.execute(
      {},
      {
        workspace_terminals: [
          { terminalId: 'p1', displayName: 'Chase' },
          { terminalId: 'p2', displayName: 'Nova' },
        ],
      }
    );
    expect(result.error).toBe('ambiguous');
    expect(result.message).toMatch(/Chase|Nova/i);
    expect(closeTerminalSessionById).not.toHaveBeenCalled();
  });

  test('not_found by name lists active terminals in message', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ processes: [{ id: 'p1', displayName: 'Chase' }] }),
    }));
    const result = await closeTerminalTool.execute(
      { name: 'Zzzzz' },
      { workspace_terminals: [{ terminalId: 'p1', displayName: 'Chase' }] }
    );
    expect(result.error).toBe('not_found');
    expect(result.message).toMatch(/Chase/);
  });

  test('both name and session_id set on close_terminal: Spanish error, NO HTTP call', async () => {
    const calls = [];
    mockFetch(async (...args) => {
      calls.push(args);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const result = await closeTerminalTool.execute(
      { name: 'Chase', session_id: 'p2', confirm: true },
      {}
    );
    expect(calls).toHaveLength(0);
    expect(closeTerminalSessionById).not.toHaveBeenCalled();
    expect(result.error).toBe('both_name_and_session');
    expect(result.message).toBe('no podés pasar name y session_id a la vez.');
  });
});
