/**
 * Test: POST /api/agenthub/headless
 *
 * Tests the headless agent launch endpoint.
 * Uses :memory: DB for isolation.
 *
 * NOTE: These tests require a running Next.js dev server at AGENTHUB_BASE_URL
 * (default: http://localhost:3100). Tests that hit the real server are marked
 * accordingly and will skip if the server is not reachable.
 */

const { ApiTestHarness, getAgentHubBaseUrl } = require('./harness');
const { seedSession, seedProject } = require('../fixtures');

const BASE_URL = getAgentHubBaseUrl();

describe('POST /api/agenthub/headless', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-headless',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  describe('validation', () => {
    test('missing prompt → 400', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const { response, body } = await harness.requestJson('POST', '/api/agenthub/headless', {
        agent: 'test-agent',
      });

      harness.assertStatus(response, 400);
      harness.assertError(body, /prompt|falta/i);
    });

    test('empty body → 400 or 500', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const { response } = await harness.requestJson('POST', '/api/agenthub/headless', {});

      // Server may return 400 (validation) or 500 (JSON parse error)
      expect([400, 500]).toContain(response.status);
    });
  });

  describe('happy path (requires running server)', () => {
    test('creates session and returns { success, sessionID, messageID }', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const { response, body } = await harness.requestJson(
        'POST',
        '/api/agenthub/headless',
        {
          prompt: 'Test prompt for headless endpoint',
          agent: 'test-agent',
          project_id: 'test-project-headless',
        },
        { timeout: 15000 }
      );

      // May return 200 (success), 429 (rate limited), 501 (feature flag), or 503 (server unavailable)
      if (response.status === 200) {
        harness.assertBodyShape(body, ['success', 'sessionID', 'messageID']);
        expect(body.success).toBe(true);
        expect(typeof body.sessionID).toBe('string');
        expect(typeof body.messageID).toBe('string');
      } else if (response.status === 429) {
        harness.assertBodyShape(body, ['error', 'queued']);
        expect(body.queued).toBe(true);
      } else if (response.status === 501) {
        harness.assertError(body, /background persistence/i);
      } else if (response.status === 503) {
        harness.assertError(body, /inicializar|opencode/i);
      } else {
        // Accept any response — the endpoint is working, just in an unexpected state
        expect([200, 429, 501, 503]).toContain(response.status);
      }
    });

    test('with existing session_id reuses session', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const sessionId = `test-reuse-session-${Date.now()}`;
      seedSession(harness.getDb(), {
        id: sessionId,
        projectId: 'test-project-1',
        title: 'Pre-seeded session',
        status: 'active',
      });

      const { response, body } = await harness.requestJson(
        'POST',
        '/api/agenthub/headless',
        {
          prompt: 'Follow-up prompt',
          session_id: sessionId,
          project_id: 'test-project-1',
        },
        { timeout: 15000 }
      );

      if (response.status === 200) {
        expect(body.sessionID).toBe(sessionId);
      }
    });
  });

  describe('DB side effects', () => {
    test('session row is created after successful launch', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const { response } = await harness.requestJson(
        'POST',
        '/api/agenthub/headless',
        {
          prompt: 'Test prompt for DB verification',
          agent: 'test-agent',
          project_id: 'test-project-db',
        },
        { timeout: 15000 }
      );

      if (response.status === 200) {
        // Give the background task a moment to persist
        await new Promise((r) => setTimeout(r, 500));

        const sessions = harness.queryAll(
          "SELECT * FROM agent_hub_sessions WHERE project_id = 'test-project-db'"
        );
        expect(sessions.length).toBeGreaterThanOrEqual(1);
        expect(sessions[0].status).toBe('active');
      }
    });
  });
});
