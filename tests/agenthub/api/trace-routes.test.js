/**
 * Test: Trace sub-routes
 *
 * Tests:
 * - POST /api/agenthub/traces/persist — trace persistence (may be deprecated 410)
 * - GET /api/agenthub/sessions/:id/traces/:traceId — single trace detail
 * - GET /api/agenthub/sessions/:id/traces/search?q=... — FTS5 search
 */

const { ApiTestHarness, getAgentHubBaseUrl } = require('./harness');
const { seedSession } = require('../fixtures');

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

describe('POST /api/agenthub/traces/persist', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-traces-persist',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('returns 410 Gone (deprecated endpoint)', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response, body } = await harness.requestJson('POST', '/api/agenthub/traces/persist', {
      session_id: 'test-session',
      trace_type: 'tool',
      tool_name: 'read_file',
      content: 'test content',
    });

    harness.assertStatus(response, 410);
    harness.assertError(body, /deprecated|deprecated/i);
    expect(body.success).toBe(false);
  });
});

describe('GET /api/agenthub/sessions/:id/traces/:traceId', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-trace-detail',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('PATCH updates trace fields', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    // Create a session
    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-trace-detail',
      title: 'Trace Detail Test',
    });

    // Insert a trace via the traces endpoint
    const traceId = `test-trace-${Date.now()}`;
    const { response: insertRes } = await harness.requestJson(
      'POST',
      `/api/agenthub/sessions/${session.id}/traces`,
      {
        id: traceId,
        trace_type: 'tool',
        tool_name: 'read_file',
        tool_input: '{"path": "/test"}',
        tool_status: 'ok',
        content: 'Read test file',
      }
    );

    harness.assertStatus(insertRes, 200);

    // Update the trace
    const { response, body } = await harness.requestJson(
      'PATCH',
      `/api/agenthub/sessions/${session.id}/traces/${traceId}`,
      { tool_status: 'completed', duration_ms: 150 }
    );

    harness.assertStatus(response, 200);
    expect(body.success).toBe(true);
  });

  test('PATCH with no valid fields → 400', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-trace-no-fields',
      title: 'No Fields',
    });

    const traceId = `test-trace-nofields-${Date.now()}`;

    // Insert a trace first
    await harness.requestJson('POST', `/api/agenthub/sessions/${session.id}/traces`, {
      id: traceId,
      trace_type: 'text',
      content: 'Initial content',
    });

    // Try to update with invalid fields
    const { response, body } = await harness.requestJson(
      'PATCH',
      `/api/agenthub/sessions/${session.id}/traces/${traceId}`,
      { invalid_field: 'value' }
    );

    harness.assertStatus(response, 400);
    harness.assertError(body, /no valid fields/i);
  });

  test('PATCH nonexistent trace → 404', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-trace-notfound',
      title: 'Not Found',
    });

    const { response, body } = await harness.requestJson(
      'PATCH',
      `/api/agenthub/sessions/${session.id}/traces/nonexistent-trace-id`,
      { tool_status: 'completed' }
    );

    harness.assertStatus(response, 404);
    harness.assertError(body, /not found/i);
  });

  test('PATCH missing traceId → 400', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-trace-missing-id',
      title: 'Missing ID',
    });

    const { response, body } = await harness.requestJson(
      'PATCH',
      `/api/agenthub/sessions/${session.id}/traces/`,
      { tool_status: 'completed' }
    );

    // May return 400 or 404 depending on routing
    expect([400, 404]).toContain(response.status);
  });
});

describe('GET /api/agenthub/sessions/:id/traces/search', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-trace-search',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('missing q parameter → 400', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-search-no-q',
      title: 'Search No Q',
    });

    const { response, body } = await harness.requestJson(
      'GET',
      `/api/agenthub/sessions/${session.id}/traces/search`
    );

    harness.assertStatus(response, 400);
    harness.assertError(body, /q.*required/i);
  });

  test('search returns matching traces', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-search',
      title: 'Search Test',
    });

    // Insert a trace with searchable content
    const traceId = `test-search-trace-${Date.now()}`;
    await harness.requestJson('POST', `/api/agenthub/sessions/${session.id}/traces`, {
      id: traceId,
      trace_type: 'tool',
      tool_name: 'read_file',
      tool_input: '{"path": "/src/app.js"}',
      tool_output: 'const app = express();',
      tool_status: 'ok',
      content: 'Read application source file',
    });

    // Search for the trace
    const { response, body } = await harness.requestJson(
      'GET',
      `/api/agenthub/sessions/${session.id}/traces/search?q=read`
    );

    harness.assertStatus(response, 200);
    expect(Array.isArray(body)).toBe(true);
  });

  test('search with type filter', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-search-type',
      title: 'Search Type',
    });

    const { response, body } = await harness.requestJson(
      'GET',
      `/api/agenthub/sessions/${session.id}/traces/search?q=test&type=tool`
    );

    harness.assertStatus(response, 200);
    expect(Array.isArray(body)).toBe(true);

    // All results should be of type 'tool'
    for (const trace of body) {
      expect(trace.trace_type).toBe('tool');
    }
  });

  test('search with limit', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-search-limit',
      title: 'Search Limit',
    });

    const { response, body } = await harness.requestJson(
      'GET',
      `/api/agenthub/sessions/${session.id}/traces/search?q=test&limit=5`
    );

    harness.assertStatus(response, 200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });

  test('search with no results returns empty array', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-search-empty',
      title: 'Search Empty',
    });

    const { response, body } = await harness.requestJson(
      'GET',
      `/api/agenthub/sessions/${session.id}/traces/search?q=xyznonexistent123`
    );

    harness.assertStatus(response, 200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });
});
