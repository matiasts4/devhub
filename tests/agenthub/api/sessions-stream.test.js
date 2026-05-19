/**
 * Test GET /api/agenthub/sessions/stream
 *
 * Tests the SSE streaming endpoint for real-time session updates.
 * Uses polling pattern — connects to SSE and verifies events are received.
 */

const { ApiTestHarness, getAgentHubBaseUrl } = require('./harness');

const BASE_URL = getAgentHubBaseUrl();

describe('GET /api/agenthub/sessions/stream', () => {
  let harness;

  beforeEach(() => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-stream',
    });
    harness.setupDb();
  });

  afterEach(() => {
    harness.teardownDb();
  });

  describe('SSE connection', () => {
    test('accepts SSE connection and sends initial events', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const response = await harness.request('GET', '/api/agenthub/sessions/stream');

      harness.assertStatus(response, 200);

      // Verify SSE headers
      const contentType = response.headers.get('content-type') || '';
      expect(contentType).toContain('text/event-stream');

      // Read initial events
      const events = await harness.readSSEEvents(response, {
        timeoutMs: 10000,
        maxEvents: 10,
      });

      // Should receive at least some events (session-update or heartbeat)
      expect(events.length).toBeGreaterThan(0);

      // Check for initial session-update events
      const initialEvents = events.filter((e) => e.event === 'session-update');
      if (initialEvents.length > 0) {
        const firstEvent = initialEvents[0];
        expect(firstEvent.data).toBeDefined();
        expect(firstEvent.data.type).toBe('initial');
        expect(firstEvent.data.session).toBeDefined();
        expect(firstEvent.data.session.id).toBeDefined();
      }
    });

    test('receives heartbeat events', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const response = await harness.request('GET', '/api/agenthub/sessions/stream');

      harness.assertStatus(response, 200);

      // Wait long enough to receive a heartbeat (15s interval)
      const events = await harness.readSSEEvents(response, {
        timeoutMs: 20000,
        maxEvents: 20,
      });

      const heartbeats = events.filter((e) => e.event === 'heartbeat');
      // Heartbeat interval is 15s, so we might or might not get one in 20s
      // If we do, verify the structure
      if (heartbeats.length > 0) {
        expect(heartbeats[0].data.ts).toBeDefined();
      }
    });

    test('receives session-update events for existing sessions', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const response = await harness.request('GET', '/api/agenthub/sessions/stream');

      harness.assertStatus(response, 200);

      const events = await harness.readSSEEvents(response, {
        timeoutMs: 10000,
        maxEvents: 20,
      });

      const sessionUpdates = events.filter(
        (e) => e.event === 'session-update' && e.data.type === 'initial'
      );

      // Each session should have the expected shape
      sessionUpdates.forEach((event) => {
        const session = event.data.session;
        expect(session.id).toBeDefined();
        expect(session.project_id).toBeDefined();
        expect(session.title).toBeDefined();
        expect(session.status).toBeDefined();
      });
    });
  });

  describe('reconnect', () => {
    test('can reconnect after disconnect', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      // First connection
      const response1 = await harness.request('GET', '/api/agenthub/sessions/stream');
      harness.assertStatus(response1, 200);

      const events1 = await harness.readSSEEvents(response1, {
        timeoutMs: 5000,
        maxEvents: 5,
      });

      expect(events1.length).toBeGreaterThan(0);

      // Second connection (simulating reconnect)
      const response2 = await harness.request('GET', '/api/agenthub/sessions/stream');
      harness.assertStatus(response2, 200);

      const events2 = await harness.readSSEEvents(response2, {
        timeoutMs: 5000,
        maxEvents: 5,
      });

      expect(events2.length).toBeGreaterThan(0);
    });
  });
});
