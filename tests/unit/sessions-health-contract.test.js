const mockGetRecentSessions = jest.fn();
const mockUpdateSessionStatus = jest.fn();
const originalFetch = global.fetch;

jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        json: async () => body,
      };
    },
  },
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockRejectedValue(new Error('missing config')),
}));

jest.mock('@/lib/db/localDb', () => ({
  getRecentSessions: (...args) => mockGetRecentSessions(...args),
  updateSessionStatus: (...args) => mockUpdateSessionStatus(...args),
}));

describe('GET /api/agenthub/sessions/health compatibility contract', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetRecentSessions.mockReset();
    mockUpdateSessionStatus.mockReset();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('returns explicit stale metadata when live checks are unavailable', async () => {
    mockGetRecentSessions.mockReturnValue([
      { id: 'db-1', status: 'running', opencode_session_id: 'oc-1' },
    ]);
    global.fetch.mockRejectedValue(new Error('offline'));

    const { GET } = require('../../src/app/api/agenthub/sessions/health/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('stale');
    expect(body.authority).toBe('cached');
    expect(body.freshness).toBe('stale');
    expect(body.live_check_available).toBe(false);
  });

  test('marks response degraded when stale sessions are found', async () => {
    mockGetRecentSessions.mockReturnValue([
      {
        id: 'db-1',
        title: 'Session',
        status: 'running',
        updated_at: '2026-04-10T17:00:00.000Z',
        opencode_session_id: 'oc-missing',
      },
    ]);
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'oc-other', title: 'Other', time: { updated: '2026-04-10T17:10:00.000Z' } },
      ],
    });

    const { GET } = require('../../src/app/api/agenthub/sessions/health/route');
    const response = await GET();
    const body = await response.json();

    expect(body.status).toBe('degraded');
    expect(body.authority).toBe('authoritative');
    expect(body.stale_sessions).toHaveLength(1);
    expect(mockUpdateSessionStatus).toHaveBeenCalledWith('db-1', 'aborted');
  });
});
