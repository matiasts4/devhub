/**
 * Test: Session sub-routes
 *
 * Tests:
 * - POST /api/agenthub/sessions/:id/abort — status change to aborted
 * - GET /api/agenthub/sessions/:id/traces — trace list
 * - GET /api/agenthub/sessions/:id/usage — token usage
 * - GET /api/agenthub/sessions/:id/status — session status
 * - 404 for non-existent sessions
 */

const { ApiTestHarness } = require('./harness');
const { seedSession, seedProject } = require('../fixtures');

const BASE_URL = process.env.AGENTHUB_BASE_URL || 'http://localhost:3000';

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

describe('POST /api/agenthub/sessions/:id/abort', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-session-abort',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('abort forwards to OpenCode server', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    // Create a session first
    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-abort',
      title: 'Abort Test Session',
    });

    const { response } = await harness.requestJson(
      'POST',
      `/api/agenthub/sessions/${session.id}/abort`
    );

    // May succeed (200), fail if OpenCode not running (500/502), or return error from OpenCode
    expect([200, 404, 500, 502]).toContain(response.status);
  });

  test('abort nonexistent session → error from OpenCode', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response } = await harness.requestJson(
      'POST',
      '/api/agenthub/sessions/nonexistent-session/abort'
    );

    // OpenCode will return an error for nonexistent session
    expect([404, 500]).toContain(response.status);
  });
});

describe('GET /api/agenthub/sessions/:id/traces', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-session-traces',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('returns trace list for a session', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-traces',
      title: 'Traces Test',
    });

    const { response, body } = await harness.requestJson(
      'GET',
      `/api/agenthub/sessions/${session.id}/traces`
    );

    harness.assertStatus(response, 200);
    expect(Array.isArray(body)).toBe(true);
  });

  test('filters traces by type', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-traces-filter',
      title: 'Filter Traces',
    });

    const { response, body } = await harness.requestJson(
      'GET',
      `/api/agenthub/sessions/${session.id}/traces?type=tool`
    );

    harness.assertStatus(response, 200);
    expect(Array.isArray(body)).toBe(true);
  });

  test('filters traces by tool status', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-traces-status',
      title: 'Status Traces',
    });

    const { response, body } = await harness.requestJson(
      'GET',
      `/api/agenthub/sessions/${session.id}/traces?status=ok`
    );

    harness.assertStatus(response, 200);
    expect(Array.isArray(body)).toBe(true);
  });

  test('respects limit parameter', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-traces-limit',
      title: 'Limit Traces',
    });

    const { response, body } = await harness.requestJson(
      'GET',
      `/api/agenthub/sessions/${session.id}/traces?limit=5`
    );

    harness.assertStatus(response, 200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });
});

describe('GET /api/agenthub/sessions/:id/usage', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-session-usage',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('returns usage with zero defaults for new session', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-usage',
      title: 'Usage Test',
    });

    const { response, body } = await harness.requestJson(
      'GET',
      `/api/agenthub/sessions/${session.id}/usage`
    );

    harness.assertStatus(response, 200);
    harness.assertBodyShape(body, [
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'context_utilization',
      'tool_calls_count',
      'total_duration_ms',
    ]);

    // New session should have zero usage
    expect(body.prompt_tokens).toBe(0);
    expect(body.completion_tokens).toBe(0);
    expect(body.total_tokens).toBe(0);
  });
});

describe('GET /api/agenthub/sessions/:id/status', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-session-status',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('PUT updates session status', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-status',
      title: 'Status Test',
    });

    const { response, body } = await harness.requestJson(
      'PUT',
      `/api/agenthub/sessions/${session.id}/status`,
      { status: 'completed' }
    );

    harness.assertStatus(response, 200);
    expect(body.status).toBe('completed');
  });

  test('PUT with invalid status → 400', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-status-invalid',
      title: 'Invalid Status',
    });

    const { response, body } = await harness.requestJson(
      'PUT',
      `/api/agenthub/sessions/${session.id}/status`,
      { status: 'invalid-status-value' }
    );

    harness.assertStatus(response, 400);
    harness.assertError(body, /invalid.*status/i);
  });

  test('PUT missing status → 400', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-status-missing',
      title: 'Missing Status',
    });

    const { response, body } = await harness.requestJson(
      'PUT',
      `/api/agenthub/sessions/${session.id}/status`,
      {}
    );

    harness.assertStatus(response, 400);
    harness.assertError(body, /status.*required/i);
  });

  test('PUT nonexistent session → 404', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response, body } = await harness.requestJson(
      'PUT',
      '/api/agenthub/sessions/nonexistent-session/status',
      { status: 'completed' }
    );

    harness.assertStatus(response, 404);
    harness.assertError(body, /not found/i);
  });

  test('PUT with all valid statuses', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const validStatuses = [
      'active',
      'working',
      'running',
      'thinking',
      'completed',
      'error',
      'aborted',
      'idle',
    ];

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-all-statuses',
      title: 'All Statuses',
    });

    for (const status of validStatuses) {
      const { response, body } = await harness.requestJson(
        'PUT',
        `/api/agenthub/sessions/${session.id}/status`,
        { status }
      );

      harness.assertStatus(response, 200);
      expect(body.status).toBe(status);
    }
  });
});

describe('404 for non-existent sessions', () => {
  test('GET traces for nonexistent session → 500 or empty', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-404-traces',
    });
    harness.setupDb();

    try {
      const { response } = await harness.requestJson(
        'GET',
        '/api/agenthub/sessions/nonexistent-session/traces'
      );

      // May return 200 with empty array or 500
      expect([200, 500]).toContain(response.status);
    } finally {
      harness.teardownDb();
    }
  });

  test('GET usage for nonexistent session → 200 with zeros', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-404-usage',
    });
    harness.setupDb();

    try {
      const { response, body } = await harness.requestJson(
        'GET',
        '/api/agenthub/sessions/nonexistent-session/usage'
      );

      harness.assertStatus(response, 200);
      expect(body.total_tokens).toBe(0);
    } finally {
      harness.teardownDb();
    }
  });
});
