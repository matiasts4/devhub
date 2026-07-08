/**
 * sessions/[terminalId]/route.test.js — TDD tests for single terminal session API route
 */

const mockGetTTYSessionsSnapshot = jest.fn();
const mockEnsureTTYServer = jest.fn(() => Promise.resolve({ port: 4077, wsPath: '/terminal' }));

jest.mock('@/lib/terminal/ttySessionSnapshot', () => ({
  getTTYSessionsSnapshot: mockGetTTYSessionsSnapshot,
}));

jest.mock('@/lib/terminal/ttyServer', () => ({
  ensureTTYServer: mockEnsureTTYServer,
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, opts) => ({ _data: data, _status: opts?.status || 200 })),
  },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
}));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.NODE_ENV = 'test';
});

describe('GET /api/terminal/sessions/[terminalId]', () => {
  it('returns the matching session with lastActivityAt', async () => {
    mockGetTTYSessionsSnapshot.mockReturnValue([
      {
        terminalId: 'term-1',
        mode: 'shell',
        socketCount: 1,
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        cwd: '/home/user/project',
        shell: '/bin/zsh',
        title: null,
        restored: false,
        alive: true,
        opencodeSessionId: null,
      },
      {
        terminalId: 'term-2',
        mode: 'shell',
        socketCount: 0,
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        cwd: '/tmp',
        shell: '/bin/bash',
        title: 'Server',
        restored: false,
        alive: true,
        opencodeSessionId: null,
      },
    ]);

    const { GET } = await import('./route.js');
    await GET({}, { params: Promise.resolve({ terminalId: 'term-2' }) });

    const { NextResponse } = await import('next/server');
    const [data] = NextResponse.json.mock.calls[0];

    expect(data.terminalId).toBe('term-2');
    expect(data.cwd).toBe('/tmp');
    expect(data.lastActivityAt).toBeTruthy();
  });

  it('returns 404 when session is not found', async () => {
    mockGetTTYSessionsSnapshot.mockReturnValue([]);

    const { GET } = await import('./route.js');
    await GET({}, { params: Promise.resolve({ terminalId: 'missing' }) });

    const { NextResponse } = await import('next/server');
    const [data, opts] = NextResponse.json.mock.calls[0];

    expect(data.error).toBe('Session not found');
    expect(opts?.status || 200).toBe(404);
  });

  it('returns 400 when terminalId is missing', async () => {
    const { GET } = await import('./route.js');
    await GET({}, { params: Promise.resolve({ terminalId: '' }) });

    const { NextResponse } = await import('next/server');
    const [data, opts] = NextResponse.json.mock.calls[0];

    expect(data.error).toBe('terminalId is required');
    expect(opts?.status || 200).toBe(400);
  });
});
