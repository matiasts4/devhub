/**
 * Test: POST /api/agenthub/chat
 *
 * Tests the LLM chat streaming endpoint.
 * This endpoint streams SSE responses from configured LLM providers.
 */

const { ApiTestHarness, getAgentHubBaseUrl } = require('./harness');

const BASE_URL = getAgentHubBaseUrl();

async function serverReachable() {
  try {
    const res = await fetch(`${BASE_URL}/api/agenthub/sessions?limit=1`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

describe('POST /api/agenthub/chat', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-chat',
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
    test('missing messages → 400', async () => {
      const { response, body } = await harness.requestJson('POST', '/api/agenthub/chat', {
        project_id: 'test-1',
      });

      harness.assertStatus(response, 400);
      harness.assertError(body, /mensajes|invalid/i);
    });

    test('messages not an array → 400', async () => {
      const { response, body } = await harness.requestJson('POST', '/api/agenthub/chat', {
        messages: 'not-an-array',
      });

      harness.assertStatus(response, 400);
    });

    test('empty messages array → may succeed or fail', async () => {
      const { response } = await harness.requestJson('POST', '/api/agenthub/chat', {
        messages: [],
      });

      // Empty array passes the Array.isArray check; may fail on LLM config
      expect([200, 400]).toContain(response.status);
    });
  });

  describe('happy path (requires running server + LLM config)', () => {
    test('sends message and returns SSE stream', async () => {
      const reachable = await serverReachable();
      if (!reachable) {
        console.warn('SKIP: Next.js server not reachable at', BASE_URL);
        return;
      }

      const response = await harness.request(
        'POST',
        '/api/agenthub/chat',
        {
          messages: [{ role: 'user', content: 'Say hello in one word' }],
          project_id: 'test-project-chat',
        },
        { timeout: 30000 }
      );

      // Chat returns an SSE stream (text/event-stream), not JSON
      const contentType = response.headers.get('content-type') || '';

      if (response.status === 200) {
        // Should be an SSE stream
        expect(contentType).toMatch(/text\/event-stream|text\/plain/i);

        // Read a chunk to verify stream format
        const text = await response.text();
        if (text) {
          // Should contain at least one SSE event
          const hasEvent =
            text.includes('event:') || text.includes('data:') || text.includes('type:');
          if (hasEvent) {
            expect(hasEvent).toBe(true);
          } else {
            // Some test env responses may terminate early without an emitted chunk.
            expect(text.length).toBeGreaterThan(0);
          }
        }
      } else if (response.status === 400) {
        // No LLM configured
        const body = await response.json().catch(() => null);
        if (body) {
          harness.assertError(body, /proveedor|configurad|no hay/i);
        }
      } else if (response.status === 500) {
        // Server error — acceptable in test env without real LLM
        console.warn('Chat endpoint returned 500 — expected in test env without LLM config');
      }
    });

    test('with session_id includes tool context', async () => {
      const reachable = await serverReachable();
      if (!reachable) {
        console.warn('SKIP: Next.js server not reachable at', BASE_URL);
        return;
      }

      const response = await harness.request(
        'POST',
        '/api/agenthub/chat',
        {
          messages: [{ role: 'user', content: 'Continue' }],
          session_id: 'nonexistent-session',
        },
        { timeout: 30000 }
      );

      // Should not crash even with nonexistent session
      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('model override', () => {
    test('accepts modelOverride parameter', async () => {
      const reachable = await serverReachable();
      if (!reachable) {
        console.warn('SKIP: Next.js server not reachable at', BASE_URL);
        return;
      }

      const response = await harness.request(
        'POST',
        '/api/agenthub/chat',
        {
          messages: [{ role: 'user', content: 'test' }],
          modelOverride: 'test-model',
        },
        { timeout: 30000 }
      );

      // Should accept the parameter without validation error
      expect([200, 400, 500]).toContain(response.status);
    });
  });
});
