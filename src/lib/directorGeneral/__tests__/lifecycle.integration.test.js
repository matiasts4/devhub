// Integration test: mission lifecycle — state transition contract
// Verifies the contract between bridge functions and the Director API.
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init = {}) => ({ status: init.status ?? 200, json: async () => body }),
  },
}));

function makeMockFetch(response, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
  });
}

describe('DG mission lifecycle — state transition contract', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('submitMissionRequest POSTs correct payload to /api/agenthub/missions', async () => {
    // Import AFTER resetModules so mock is fresh
    const { clearActiveMission, submitMissionRequest } = require('../bridge');
    clearActiveMission();
    const mockFetch = makeMockFetch({ missionId: 'lifecycle-1', status: 'pending' });

    const result = await submitMissionRequest(
      { action: 'launch-swarm', params: { team: 'feature' }, humanReadableSummary: 'Test.' },
      { fetchImpl: mockFetch }
    );

    expect(result).toMatchObject({ status: 'pending' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agenthub/missions'),
      expect.objectContaining({ method: 'POST' })
    );
    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.type).toBe('director-general-mission-request');
    expect(body.initiator).toBe('director-general');
    expect(body.target).toBe('swarm-director');
    expect(body.authority).toBe('operator');
  });

  test('director-offline returns director-offline without calling /status', async () => {
    const { clearActiveMission, submitMissionRequest } = require('../bridge');
    clearActiveMission();
    const mockFetch = makeMockFetch({ status: 'director-offline' });

    const result = await submitMissionRequest(
      { action: 'launch-swarm', params: {}, humanReadableSummary: 'Test.' },
      { fetchImpl: mockFetch }
    );

    expect(result).toMatchObject({ status: 'director-offline' });
    const statusCalls = mockFetch.mock.calls.filter(([url]) => url.includes('/status'));
    expect(statusCalls).toHaveLength(0);
  });

  test('getMissionStatus parses freshness=stale when updatedAt > 5s old', async () => {
    const { getMissionStatus } = require('../bridge');
    const staleTime = Date.now() - 10_000;
    const mockFetch = makeMockFetch({ missionId: 's-1', status: 'in-progress', updatedAt: staleTime });

    const result = await getMissionStatus('s-1', { fetchImpl: mockFetch });

    expect(result.freshness).toBe('stale');
    expect(result.status).toBe('in-progress');
  });

  test('getMissionStatus parses freshness=just_now when updatedAt is recent', async () => {
    const { getMissionStatus } = require('../bridge');
    const recentTime = Date.now() - 1_000;
    const mockFetch = makeMockFetch({ missionId: 's-2', status: 'in-progress', updatedAt: recentTime });

    const result = await getMissionStatus('s-2', { fetchImpl: mockFetch });

    expect(result.freshness).toBe('just_now');
  });

  test('postApprovalReply sends type=director-general-approval-reply to reply endpoint', async () => {
    const { postApprovalReply } = require('../bridge');
    const mockFetch = makeMockFetch({ success: true });

    await postApprovalReply('m-1', 'appr-1', 'approved', { fetchImpl: mockFetch });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/agenthub/missions/m-1/reply');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.type).toBe('director-general-approval-reply');
    expect(body.decision).toBe('approved');
    expect(body.decidedBy).toBe('operator');
  });

  test('postApprovalReply sends rejected decision correctly', async () => {
    const { postApprovalReply } = require('../bridge');
    const mockFetch = makeMockFetch({ success: true });

    await postApprovalReply('m-1', 'appr-1', 'rejected', { fetchImpl: mockFetch });

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.decision).toBe('rejected');
    expect(body.type).toBe('director-general-approval-reply');
  });

  test('getMissionTimeline returns rows from GET /timeline', async () => {
    const { getMissionTimeline } = require('../bridge');
    const rows = [
      { id: 'r1', missionId: 'm-1', action: 'mission-request', status: 'pending' },
      { id: 'r2', missionId: 'm-1', action: 'status-poll', status: 'in-progress' },
    ];
    const mockFetch = makeMockFetch({ missionId: 'm-1', rows });

    const result = await getMissionTimeline('m-1', { fetchImpl: mockFetch });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agenthub/missions/m-1/timeline'),
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.rows).toHaveLength(2);
  });

  test('postApprovalReply throws APPROVAL_EXPIRED on 409 Conflict', async () => {
    const { postApprovalReply } = require('../bridge');
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'La aprobación expiró. Volvé a intentar.' }),
    });

    await expect(
      postApprovalReply('m-1', 'appr-1', 'approved', { fetchImpl: mockFetch })
    ).rejects.toMatchObject({
      code: 'APPROVAL_EXPIRED',
      status: 409,
    });
  });
});
