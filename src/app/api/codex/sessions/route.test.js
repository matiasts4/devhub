const mockScanCodexSessions = jest.fn();

jest.mock('@/lib/agentSessions/sessionDirScanners', () => ({
  scanCodexSessions: mockScanCodexSessions,
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, opts) => ({ _data: data, _status: opts?.status || 200 })),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/codex/sessions', () => {
  test('returns a normalized success envelope', async () => {
    mockScanCodexSessions.mockReturnValue({
      sessions: [
        {
          provider: 'codex',
          sessionId: 'codex-1',
          title: 'codex-1',
          cwd: 'D:/devhub',
          updatedAt: '2026-07-25T10:00:00.000Z',
          resumeCommand: 'codex resume codex-1',
          durable: true,
        },
      ],
    });

    const { GET } = await import('./route.js');
    const response = await GET({ url: 'http://localhost/api/codex/sessions' });

    expect(response._status).toBe(200);
    expect(response._data.provider).toBe('codex');
    expect(response._data.status).toBe('success');
    expect(response._data.sessions).toHaveLength(1);
    expect(response._data.sessions[0].resumeCommand).toBe('codex resume codex-1');
  });

  test('returns an empty envelope when there are no sessions', async () => {
    mockScanCodexSessions.mockReturnValue({ sessions: [] });

    const { GET } = await import('./route.js');
    const response = await GET({ url: 'http://localhost/api/codex/sessions' });

    expect(response._status).toBe(200);
    expect(response._data).toEqual({ provider: 'codex', status: 'empty', sessions: [] });
  });
});
