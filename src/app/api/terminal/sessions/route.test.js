/**
 * sessions/route.test.js — TDD tests for sessions API route
 * Tests that restored and cwd fields are included in response.
 */

const mockGetTTYSessionsSnapshot = jest.fn();
const mockEnsureTTYServer = jest.fn(() => Promise.resolve({ port: 4077, wsPath: '/terminal' }));

jest.mock('@/lib/terminal/ttyServer', () => ({
  getTTYSessionsSnapshot: mockGetTTYSessionsSnapshot,
  ensureTTYServer: mockEnsureTTYServer,
}));

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, opts) => ({ _data: data, _status: opts?.status || 200 })),
  },
}));

// Mock fs to avoid sidecar port file reads
jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
}));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  // Ensure we're in test/dev env
  process.env.NODE_ENV = 'test';
});

describe('GET /api/terminal/sessions', () => {
  it('includes restored and cwd fields in each session entry', async () => {
    mockGetTTYSessionsSnapshot.mockReturnValue([
      {
        terminalId: 'term-1',
        mode: 'shell',
        socketCount: 1,
        createdAt: new Date().toISOString(),
        lastActivityAt: Date.now(),
        lastSeenAt: new Date().toISOString(),
        cwd: '/home/user/project',
        shell: '/bin/zsh',
        title: null,
        restored: true,
        alive: true,
        opencodeSessionId: null,
      },
      {
        terminalId: 'term-2',
        mode: 'shell',
        socketCount: 0,
        createdAt: new Date().toISOString(),
        lastActivityAt: Date.now(),
        lastSeenAt: new Date().toISOString(),
        cwd: '/tmp',
        shell: '/bin/bash',
        title: 'Server',
        restored: false,
        alive: true,
        opencodeSessionId: null,
      },
    ]);

    // Re-import after mocks are set
    const { GET } = await import('./route.js');
    const response = await GET();

    const { NextResponse } = await import('next/server');
    const [data] = NextResponse.json.mock.calls[0];

    expect(data.sessions).toHaveLength(2);

    const restored = data.sessions.find((s) => s.terminalId === 'term-1');
    expect(restored.restored).toBe(true);
    expect(restored.cwd).toBe('/home/user/project');

    const fresh = data.sessions.find((s) => s.terminalId === 'term-2');
    expect(fresh.restored).toBe(false);
    expect(fresh.cwd).toBe('/tmp');
  });

  it('returns sessions with cwd as non-empty string when present', async () => {
    mockGetTTYSessionsSnapshot.mockReturnValue([
      {
        terminalId: 'term-cwd',
        mode: 'shell',
        socketCount: 1,
        createdAt: new Date().toISOString(),
        lastActivityAt: Date.now(),
        lastSeenAt: new Date().toISOString(),
        cwd: '/home/matias/devhub',
        shell: '/bin/zsh',
        title: null,
        restored: false,
        alive: true,
        opencodeSessionId: null,
      },
    ]);

    const { GET } = await import('./route.js');
    await GET();

    const { NextResponse } = await import('next/server');
    const [data] = NextResponse.json.mock.calls[0];

    expect(data.sessions[0].cwd).toBe('/home/matias/devhub');
    expect(typeof data.sessions[0].restored).toBe('boolean');
  });
});
