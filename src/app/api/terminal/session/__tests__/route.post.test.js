// T-016: POST /api/terminal/session must create a new PTY session and
// return { id, port, wsPath } — the same shape the open_terminal tool
// expects at terminal.js:67-76. Previous behavior: the endpoint only
// exported GET (returns port/wsPath) and DELETE (close), so a POST got
// 405 Method Not Allowed.
//
// Mocks ttyServer to keep the test hermetic: no real PTY spawn, no real
// WS server. Verifies (a) ensureTTYServer is called with the right cwd,
// (b) createSession is called with the right shell, (c) the response
// shape is { id, port, wsPath }.

const mockCreateSession = jest.fn();
const mockEnsureTTYServer = jest.fn();
const mockPushSessionInput = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status || 200 })),
  },
}));

jest.mock('@/lib/terminal/ttyServer', () => ({
  ensureTTYServer: (...args) => mockEnsureTTYServer(...args),
  createSession: (...args) => mockCreateSession(...args),
  pushSessionInput: (...args) => mockPushSessionInput(...args),
}));

const { NextResponse } = require('next/server');

describe('POST /api/terminal/session (T-016)', () => {
  let originalShell;
  let POST;

  beforeEach(() => {
    jest.clearAllMocks();
    originalShell = process.env.SHELL;
    process.env.SHELL = '/bin/bash';
    NextResponse.json.mockImplementation((body, init) => ({ body, status: init?.status || 200 }));
    mockEnsureTTYServer.mockResolvedValue({ port: 4001, wsPath: '/terminal' });
    mockCreateSession.mockReturnValue({ id: 'sess-new-1' });
    mockPushSessionInput.mockReturnValue(true);
    // Re-require after mocks are set so the module picks up the fresh refs.
    jest.isolateModules(() => {
      POST = require('../route.js').POST;
    });
  });

  afterEach(() => {
    if (originalShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = originalShell;
  });

  test('returns { id, port, wsPath } from createSession + ensureTTYServer', async () => {
    const request = {
      json: async () => ({ cwd: '/tmp/devhub-x', program: '/bin/zsh' }),
    };
    const response = await POST(request);

    expect(mockEnsureTTYServer).toHaveBeenCalledWith('/tmp/devhub-x');
    expect(mockCreateSession).toHaveBeenCalledWith({
      cwd: '/tmp/devhub-x',
      shell: '/bin/zsh',
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 'sess-new-1', port: 4001, wsPath: '/terminal' });
  });

  test('falls back to process.env.SHELL when program is not provided', async () => {
    const request = {
      json: async () => ({ cwd: '/tmp/devhub-y' }),
    };
    await POST(request);
    expect(mockCreateSession).toHaveBeenCalledWith({
      cwd: '/tmp/devhub-y',
      shell: '/bin/bash',
    });
  });

  test('falls back to "bash" when neither program nor process.env.SHELL is set', async () => {
    delete process.env.SHELL;
    const request = { json: async () => ({}) };
    await POST(request);
    expect(mockCreateSession).toHaveBeenCalledWith({
      cwd: undefined,
      shell: 'bash',
    });
  });

  test('returns 500 with structured error when createSession throws', async () => {
    mockCreateSession.mockImplementationOnce(() => {
      throw new Error('PTY spawn failed');
    });
    const request = { json: async () => ({ cwd: '/tmp/x' }) };
    const response = await POST(request);
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/PTY spawn failed|No se pudo/i);
  });

  test('returns 500 when ensureTTYServer throws', async () => {
    mockEnsureTTYServer.mockRejectedValueOnce(new Error('ws bind failed'));
    const request = { json: async () => ({ cwd: '/tmp/x' }) };
    const response = await POST(request);
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/ws bind failed|No se pudo/i);
  });

  test('handles malformed JSON body gracefully (empty body → cwd undefined, shell default)', async () => {
    const request = {
      json: async () => {
        throw new Error('bad json');
      },
    };
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('sess-new-1');
    expect(response.body.port).toBe(4001);
  });
});
