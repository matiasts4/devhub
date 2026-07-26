const mockScanQoderSessions = jest.fn();

jest.mock('@/lib/agentSessions/sessionDirScanners', () => ({
  scanQoderSessions: mockScanQoderSessions,
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, opts) => ({ _data: data, _status: opts?.status || 200 })),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/qoder/sessions', () => {
  test('returns a normalized success envelope', async () => {
    mockScanQoderSessions.mockResolvedValue({
      sessions: [
        {
          provider: 'qoder',
          sessionId: 'q-1',
          title: 'Qoder chat',
          cwd: 'D:/devhub',
          updatedAt: '2026-07-20T10:00:00.000Z',
          resumeCommand: 'qodercli --resume q-1',
          durable: true,
        },
      ],
    });

    const { GET } = await import('./route.js');
    const response = await GET({ url: 'http://localhost/api/qoder/sessions' });

    expect(response._status).toBe(200);
    expect(response._data.provider).toBe('qoder');
    expect(response._data.status).toBe('success');
    expect(response._data.sessions).toHaveLength(1);
    expect(response._data.sessions[0].resumeCommand).toBe('qodercli --resume q-1');
  });

  test('returns an empty envelope when the CLI listing fails or has no sessions', async () => {
    mockScanQoderSessions.mockResolvedValue({ sessions: [] });

    const { GET } = await import('./route.js');
    const response = await GET({ url: 'http://localhost/api/qoder/sessions' });

    expect(response._status).toBe(200);
    expect(response._data).toEqual({ provider: 'qoder', status: 'empty', sessions: [] });
  });
});
