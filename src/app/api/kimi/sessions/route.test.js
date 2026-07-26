const mockScanKimiSessions = jest.fn();

jest.mock('@/lib/agentSessions/sessionDirScanners', () => ({
  scanKimiSessions: mockScanKimiSessions,
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, opts) => ({ _data: data, _status: opts?.status || 200 })),
  },
}));

function createKimiSession(overrides = {}) {
  const sessionId = overrides.sessionId || 'kimi-1';
  return {
    provider: 'kimi',
    sessionId,
    title: `Kimi ${sessionId}`,
    cwd: 'D:/devhub',
    updatedAt: '2026-07-25T10:00:00.000Z',
    resumeCommand: `kimi --session ${sessionId}`,
    durable: true,
    ...overrides,
  };
}

function createRequest(url = 'http://localhost/api/kimi/sessions') {
  return { url };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/kimi/sessions', () => {
  test('returns a normalized success envelope sorted newest first and deduped', async () => {
    mockScanKimiSessions.mockReturnValue({
      sessions: [
        createKimiSession({ sessionId: 'kimi-old', updatedAt: '2026-07-01T10:00:00.000Z' }),
        createKimiSession({ sessionId: 'kimi-new', updatedAt: '2026-07-25T10:00:00.000Z' }),
        createKimiSession({ sessionId: 'kimi-new', title: 'Duplicate' }),
      ],
    });

    const { GET } = await import('./route.js');
    const response = await GET(createRequest());

    expect(response._status).toBe(200);
    expect(response._data.provider).toBe('kimi');
    expect(response._data.status).toBe('success');
    expect(response._data.sessions.map((session) => session.sessionId)).toEqual([
      'kimi-new',
      'kimi-old',
    ]);
    expect(response._data.sessions[0].resumeCommand).toBe('kimi --session kimi-new');
    expect(response._data.error).toBeUndefined();
  });

  test('returns an empty envelope when there are no sessions', async () => {
    mockScanKimiSessions.mockReturnValue({ sessions: [] });

    const { GET } = await import('./route.js');
    const response = await GET(createRequest());

    expect(response._status).toBe(200);
    expect(response._data).toEqual({ provider: 'kimi', status: 'empty', sessions: [] });
  });

  test('drops malformed sessions without failing the listing', async () => {
    mockScanKimiSessions.mockReturnValue({
      sessions: [{ title: 'no id at all' }, null, createKimiSession({ sessionId: 'kimi-ok' })],
    });

    const { GET } = await import('./route.js');
    const response = await GET(createRequest());

    expect(response._data.status).toBe('success');
    expect(response._data.sessions.map((session) => session.sessionId)).toEqual(['kimi-ok']);
  });

  test('passes the cwd filter to the scanner and filters non-matching sessions', async () => {
    mockScanKimiSessions.mockReturnValue({
      sessions: [
        createKimiSession({ sessionId: 'kimi-match', cwd: 'D:/devhub' }),
        createKimiSession({ sessionId: 'kimi-other', cwd: 'D:/other' }),
      ],
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      createRequest(`http://localhost/api/kimi/sessions?cwd=${encodeURIComponent('D:/devhub')}`)
    );

    expect(mockScanKimiSessions).toHaveBeenCalledWith({ cwd: 'D:/devhub', limit: 20 });
    expect(response._data.sessions.map((session) => session.sessionId)).toEqual(['kimi-match']);
  });

  test('caps the listing at 20 sessions', async () => {
    mockScanKimiSessions.mockReturnValue({
      sessions: Array.from({ length: 25 }, (_, index) =>
        createKimiSession({
          sessionId: `kimi-${index}`,
          updatedAt: `2026-07-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
        })
      ),
    });

    const { GET } = await import('./route.js');
    const response = await GET(createRequest());

    expect(response._data.sessions).toHaveLength(20);
    expect(response._data.sessions[0].sessionId).toBe('kimi-24');
  });

  test('maps scanner failures to a 503 error envelope', async () => {
    mockScanKimiSessions.mockImplementation(() => {
      throw new Error('disk exploded');
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { GET } = await import('./route.js');
    const response = await GET(createRequest());

    expect(response._status).toBe(503);
    expect(response._data.provider).toBe('kimi');
    expect(response._data.status).toBe('error');
    expect(response._data.sessions).toEqual([]);
    expect(response._data.error).toEqual({
      code: 'list-failed',
      message: 'kimi session listing failed.',
      retryable: true,
    });
    consoleSpy.mockRestore();
  });
});
