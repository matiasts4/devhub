// Strict TDD — RED: tests written before implementation
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init = {}) => ({ status: init.status ?? 200, json: async () => body }),
  },
}));

function makeMockFetch(response) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => response,
  });
}

function okResponse(overrides = {}) {
  return {
    missionId: 'mission-1',
    status: 'in-progress',
    authority: 'director',
    freshness: 'just_now',
    updatedAt: Date.now(),
    result: null,
    approvalCheckpoint: null,
    ...overrides,
  };
}

describe('DG polling loop', () => {
  describe('terminal state exits loop', () => {
    test('completed status breaks loop without retry', async () => {
      const { startPolling } = require('../polling');
      const mockFetch = makeMockFetch(okResponse({ status: 'completed' }));
      const onStatus = jest.fn();
      const onFailure = jest.fn();

      const { stop } = startPolling(
        'mission-1',
        { pollIntervalMs: 50, fetchImpl: mockFetch },
        { onStatus, onFailure }
      );
      await new Promise((r) => setTimeout(r, 120));
      stop();

      expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
      expect(onFailure).not.toHaveBeenCalled();
    });

    test('failed status breaks loop without retry', async () => {
      const { startPolling } = require('../polling');
      const mockFetch = makeMockFetch(okResponse({ status: 'failed' }));
      const onStatus = jest.fn();
      const onFailure = jest.fn();

      const { stop } = startPolling(
        'mission-1',
        { pollIntervalMs: 50, fetchImpl: mockFetch },
        { onStatus, onFailure }
      );
      await new Promise((r) => setTimeout(r, 120));
      stop();

      expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
      expect(onFailure).not.toHaveBeenCalled();
    });

    test('rejected status breaks loop without retry', async () => {
      const { startPolling } = require('../polling');
      const mockFetch = makeMockFetch(okResponse({ status: 'rejected' }));
      const onStatus = jest.fn();
      const onFailure = jest.fn();

      const { stop } = startPolling(
        'mission-1',
        { pollIntervalMs: 50, fetchImpl: mockFetch },
        { onStatus, onFailure }
      );
      await new Promise((r) => setTimeout(r, 120));
      stop();

      expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
      expect(onFailure).not.toHaveBeenCalled();
    });
  });

  describe('transient error retry with backoff', () => {
    test('5xx error triggers up to 3 retries with exponential backoff', async () => {
      const { startPolling } = require('../polling');
      const callTimes = [];
      const mockFetch = jest.fn().mockImplementation(() => {
        callTimes.push(Date.now());
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({}),
        });
      });

      const onStatus = jest.fn();
      const onFailure = jest.fn();

      const { stop } = startPolling(
        'mission-1',
        { pollIntervalMs: 30, fetchImpl: mockFetch },
        { onStatus, onFailure }
      );
      await new Promise((r) => setTimeout(r, 600));
      stop();

      // Should have initial poll + 3 retries = 4 total calls
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(4);
      expect(onFailure).toHaveBeenCalled();
    });

    test('4th retry failure calls onFailure and breaks', async () => {
      const { startPolling } = require('../polling');
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const onStatus = jest.fn();
      const onFailure = jest.fn();

      const { stop } = startPolling(
        'mission-1',
        { pollIntervalMs: 20, fetchImpl: mockFetch },
        { onStatus, onFailure }
      );
      await new Promise((r) => setTimeout(r, 400));
      stop();

      expect(onFailure).toHaveBeenCalled();
      expect(onStatus).not.toHaveBeenCalled();
    });
  });

  describe('non-transient error stops immediately', () => {
    test('403 breaks immediately without retry', async () => {
      const { startPolling } = require('../polling');
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({}),
      });

      const onStatus = jest.fn();
      const onFailure = jest.fn();

      const { stop } = startPolling(
        'mission-1',
        { pollIntervalMs: 50, fetchImpl: mockFetch },
        { onStatus, onFailure }
      );
      await new Promise((r) => setTimeout(r, 200));
      stop();

      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(2);
      expect(onFailure).toHaveBeenCalled();
    });

    test('404 breaks immediately without retry', async () => {
      const { startPolling } = require('../polling');
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      const onStatus = jest.fn();
      const onFailure = jest.fn();

      const { stop } = startPolling(
        'mission-1',
        { pollIntervalMs: 50, fetchImpl: mockFetch },
        { onStatus, onFailure }
      );
      await new Promise((r) => setTimeout(r, 200));
      stop();

      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(2);
      expect(onFailure).toHaveBeenCalled();
    });
  });

  describe('director-offline', () => {
    test('director-offline response does not start polling', async () => {
      const { startPolling } = require('../polling');
      const mockFetch = makeMockFetch({ status: 'director-offline' });
      const onStatus = jest.fn();
      const onFailure = jest.fn();

      const { stop } = startPolling(
        'mission-1',
        { pollIntervalMs: 50, fetchImpl: mockFetch },
        { onStatus, onFailure }
      );
      await new Promise((r) => setTimeout(r, 150));
      stop();

      // Should call onFailure immediately, no subsequent polls
      expect(onFailure).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'director-offline' })
      );
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(2);
    });
  });

  describe('approval-required does not break loop', () => {
    test('approval-required emits row but continues polling', async () => {
      const { startPolling } = require('../polling');
      let callCount = 0;
      const mockFetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              okResponse({
                status: 'approval-required',
                approvalCheckpoint: { reason_class: 'approval_required' },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => okResponse({ status: 'completed' }),
        });
      });

      const onStatus = jest.fn();
      const onFailure = jest.fn();

      const { stop } = startPolling(
        'mission-1',
        { pollIntervalMs: 50, fetchImpl: mockFetch },
        { onStatus, onFailure }
      );
      await new Promise((r) => setTimeout(r, 200));
      stop();

      // First call: approval-required (not terminal), second call: completed (terminal)
      expect(onStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approval-required' })
      );
      expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
      expect(onFailure).not.toHaveBeenCalled();
    });
  });

  describe('AbortController', () => {
    test('stop() aborts in-flight request and breaks loop', async () => {
      const { startPolling } = require('../polling');
      let callCount = 0;
      const mockFetch = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: async () => okResponse({ status: 'in-progress' }),
        });
      });

      const onStatus = jest.fn();
      const onFailure = jest.fn();

      const { stop } = startPolling(
        'mission-1',
        { pollIntervalMs: 50, fetchImpl: mockFetch },
        { onStatus, onFailure }
      );
      await new Promise((r) => setTimeout(r, 80));
      stop();
      await new Promise((r) => setTimeout(r, 100));

      const callsAfterStop = callCount;
      await new Promise((r) => setTimeout(r, 200));

      // No new calls after stop
      expect(callCount).toBe(callsAfterStop);
    });
  });

  describe('backoff reset', () => {
    test('successful poll resets backoff to pollIntervalMs', async () => {
      const { startPolling } = require('../polling');
      let callCount = 0;
      const callTimestamps = [];
      const mockFetch = jest.fn().mockImplementation(() => {
        callCount++;
        callTimestamps.push(Date.now());
        return Promise.resolve({
          ok: true,
          json: async () => okResponse({ status: 'in-progress' }),
        });
      });

      const onStatus = jest.fn();
      const onFailure = jest.fn();

      const { stop } = startPolling(
        'mission-1',
        { pollIntervalMs: 50, fetchImpl: mockFetch },
        { onStatus, onFailure }
      );
      await new Promise((r) => setTimeout(r, 250));
      stop();

      // Check intervals between calls are ~50ms (not doubling)
      if (callTimestamps.length >= 3) {
        const interval1 = callTimestamps[1] - callTimestamps[0];
        const interval2 = callTimestamps[2] - callTimestamps[1];
        expect(interval1).toBeLessThan(120);
        expect(interval2).toBeLessThan(120);
      }
    });
  });
});
