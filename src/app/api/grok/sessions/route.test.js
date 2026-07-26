const mockScanGrokSessions = jest.fn();

jest.mock('@/lib/agentSessions/sessionDirScanners', () => ({
  scanGrokSessions: mockScanGrokSessions,
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, opts) => ({ _data: data, _status: opts?.status || 200 })),
  },
}));

function createGrokSession(overrides = {}) {
  const sessionId = overrides.sessionId || 'grok-1';
  return {
    provider: 'grok',
    sessionId,
    title: `Grok ${sessionId}`,
    cwd: 'D:\\devhub',
    updatedAt: '2026-06-28T00:45:02.231Z',
    resumeCommand: `grok --resume ${sessionId}`,
    durable: true,
    ...overrides,
  };
}

function createRequest(url = 'http://localhost/api/grok/sessions') {
  return { url };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/grok/sessions', () => {
  test('returns a normalized success envelope sorted newest first and deduped', async () => {
    mockScanGrokSessions.mockReturnValue({
      sessions: [
        createGrokSession({ sessionId: 'grok-old', updatedAt: '2026-06-20T10:00:00.000Z' }),
        createGrokSession({ sessionId: 'grok-new', updatedAt: '2026-06-28T00:45:02.231Z' }),
        createGrokSession({ sessionId: 'grok-new', title: 'Duplicate' }),
      ],
    });

    const { GET } = await import('./route.js');
    const response = await GET(createRequest());

    expect(response._status).toBe(200);
    expect(response._data.provider).toBe('grok');
    expect(response._data.status).toBe('success');
    expect(response._data.sessions.map((session) => session.sessionId)).toEqual([
      'grok-new',
      'grok-old',
    ]);
    expect(response._data.sessions[0].resumeCommand).toBe('grok --resume grok-new');
    expect(response._data.error).toBeUndefined();
  });

  test('returns an empty envelope when there are no sessions', async () => {
    mockScanGrokSessions.mockReturnValue({ sessions: [] });

    const { GET } = await import('./route.js');
    const response = await GET(createRequest());

    expect(response._status).toBe(200);
    expect(response._data).toEqual({ provider: 'grok', status: 'empty', sessions: [] });
  });

  test('drops malformed sessions without failing the listing', async () => {
    mockScanGrokSessions.mockReturnValue({
      sessions: [{ session_summary: 'no id' }, undefined, createGrokSession({ sessionId: 'g-ok' })],
    });

    const { GET } = await import('./route.js');
    const response = await GET(createRequest());

    expect(response._data.status).toBe('success');
    expect(response._data.sessions.map((session) => session.sessionId)).toEqual(['g-ok']);
  });

  test('matches the cwd filter against backslash-normalized directories', async () => {
    mockScanGrokSessions.mockReturnValue({
      sessions: [
        createGrokSession({ sessionId: 'grok-match', cwd: 'D:\\devhub' }),
        createGrokSession({ sessionId: 'grok-other', cwd: 'D:\\veloce' }),
      ],
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      createRequest(`http://localhost/api/grok/sessions?cwd=${encodeURIComponent('D:/devhub')}`)
    );

    expect(mockScanGrokSessions).toHaveBeenCalledWith({ cwd: 'D:/devhub', limit: 20 });
    expect(response._data.sessions.map((session) => session.sessionId)).toEqual(['grok-match']);
  });

  test('caps the listing at 20 sessions', async () => {
    mockScanGrokSessions.mockReturnValue({
      sessions: Array.from({ length: 25 }, (_, index) =>
        createGrokSession({
          sessionId: `grok-${index}`,
          updatedAt: `2026-06-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
        })
      ),
    });

    const { GET } = await import('./route.js');
    const response = await GET(createRequest());

    expect(response._data.sessions).toHaveLength(20);
    expect(response._data.sessions[0].sessionId).toBe('grok-24');
  });

  test('maps scanner failures to a 503 error envelope', async () => {
    mockScanGrokSessions.mockImplementation(() => {
      throw new Error('disk exploded');
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { GET } = await import('./route.js');
    const response = await GET(createRequest());

    expect(response._status).toBe(503);
    expect(response._data.provider).toBe('grok');
    expect(response._data.status).toBe('error');
    expect(response._data.sessions).toEqual([]);
    expect(response._data.error).toEqual({
      code: 'list-failed',
      message: 'grok session listing failed.',
      retryable: true,
    });
    consoleSpy.mockRestore();
  });
});
