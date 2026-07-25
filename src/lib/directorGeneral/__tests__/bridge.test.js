// Strict TDD — RED: tests written before implementation
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init = {}) => ({ status: init.status ?? 200, json: async () => body }),
  },
}));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

function makeMockFetch(response, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
  });
}

describe('DG bridge client', () => {
  describe('submitMissionRequest — payload shape', () => {
    test('composes correct payload for director-general-mission-request', async () => {
      const { submitMissionRequest } = require('../bridge');
      const mockFetch = makeMockFetch({ missionId: 'mission-1', status: 'pending' });
      const intent = {
        action: 'launch-swarm',
        params: { team: 'feature-delivery' },
        humanReadableSummary: 'Lanzar feature delivery swarm.',
      };

      await submitMissionRequest(intent, { fetchImpl: mockFetch });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/agenthub/missions');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.type).toBe('director-general-mission-request');
      expect(body.missionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.intent).toEqual(intent);
      expect(body.authority).toBe('operator');
      expect(body.initiator).toBe('director-general');
      expect(body.target).toBe('swarm-director');
      expect(typeof body.requestedAt).toBe('number');
      expect(body.followUpIntervalMs).toBeGreaterThan(0);
    });

    test('generates a valid UUID for missionId', async () => {
      const { submitMissionRequest } = require('../bridge');
      const mockFetch = makeMockFetch({ missionId: 'mission-1' });
      const intent = { action: 'launch-swarm', params: {}, humanReadableSummary: 'Test.' };

      await submitMissionRequest(intent, { fetchImpl: mockFetch });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.missionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe('submitMissionRequest — duplicate guard', () => {
    test('returns error when activeMissionId is non-terminal', async () => {
      const { submitMissionRequest } = require('../bridge');
      const mockFetch = makeMockFetch({ missionId: 'mission-1' });
      const intent = { action: 'launch-swarm', params: {}, humanReadableSummary: 'Test.' };

      // First call succeeds and sets active mission
      await submitMissionRequest(intent, { fetchImpl: mockFetch });

      // Second call should throw duplicate error (active mission still in flight)
      await expect(submitMissionRequest(intent, { fetchImpl: mockFetch })).rejects.toThrow(
        /Hay una misión activa/
      );
    });
  });

  describe('submitMissionRequest — director-offline', () => {
    test('returns director-offline status when Director is unreachable', async () => {
      const { submitMissionRequest } = require('../bridge');
      const mockFetch = makeMockFetch({ status: 'director-offline' });

      const result = await submitMissionRequest(
        { action: 'launch-swarm', params: {}, humanReadableSummary: 'Test.' },
        { fetchImpl: mockFetch }
      );

      expect(result).toMatchObject({ status: 'director-offline' });
    });
  });

  describe('postApprovalReply — payload shape', () => {
    test('sends correct approval reply payload', async () => {
      const { postApprovalReply } = require('../bridge');
      const mockFetch = makeMockFetch({ success: true });
      const now = Date.now();

      await postApprovalReply('mission-1', 'checkpoint-1', 'approved', {
        fetchImpl: mockFetch,
        _now: now,
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/agenthub/missions/mission-1/reply');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.type).toBe('director-general-approval-reply');
      expect(body.missionId).toBe('mission-1');
      expect(body.approvalItemId).toBe('checkpoint-1');
      expect(body.decision).toBe('approved');
      expect(body.decidedBy).toBe('operator');
      expect(typeof body.decidedAt).toBe('number');
      expect(body.authority).toBe('operator');
    });

    test('sends rejected decision correctly', async () => {
      const { postApprovalReply } = require('../bridge');
      const mockFetch = makeMockFetch({ success: true });

      await postApprovalReply('mission-1', 'checkpoint-1', 'rejected', { fetchImpl: mockFetch });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.decision).toBe('rejected');
    });
  });

  describe('getMissionStatus', () => {
    test('fetches current mission status', async () => {
      const { getMissionStatus } = require('../bridge');
      const mockFetch = makeMockFetch({
        missionId: 'mission-1',
        status: 'in-progress',
        updatedAt: Date.now(),
      });

      const result = await getMissionStatus('mission-1', { fetchImpl: mockFetch });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/agenthub/missions/mission-1/status'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result.status).toBe('in-progress');
    });

    test('parses freshness from updatedAt', async () => {
      const { getMissionStatus } = require('../bridge');
      const staleTime = Date.now() - 10_000; // 10 seconds ago = stale (>5s)
      const mockFetch = makeMockFetch({
        missionId: 'mission-1',
        status: 'in-progress',
        updatedAt: staleTime,
      });

      const result = await getMissionStatus('mission-1', { fetchImpl: mockFetch });

      expect(result.freshness).toBe('stale');
    });

    test('parses freshness as just_now when updatedAt is recent', async () => {
      const { getMissionStatus } = require('../bridge');
      const recentTime = Date.now() - 1_000; // 1 second ago = just_now
      const mockFetch = makeMockFetch({
        missionId: 'mission-1',
        status: 'in-progress',
        updatedAt: recentTime,
      });

      const result = await getMissionStatus('mission-1', { fetchImpl: mockFetch });

      expect(result.freshness).toBe('just_now');
    });
  });

  describe('getMissionTimeline', () => {
    test('fetches all timeline rows for a mission', async () => {
      const { getMissionTimeline } = require('../bridge');
      const rows = [
        { id: 'row-1', missionId: 'mission-1', action: 'mission-request', status: 'pending' },
        { id: 'row-2', missionId: 'mission-1', action: 'status-poll', status: 'in-progress' },
      ];
      const mockFetch = makeMockFetch({ missionId: 'mission-1', rows });

      const result = await getMissionTimeline('mission-1', { fetchImpl: mockFetch });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/agenthub/missions/mission-1/timeline'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result.rows).toHaveLength(2);
    });
  });
});
