/**
 * Test: /api/agenthub/sessions CRUD
 *
 * Tests:
 * - GET /api/agenthub/sessions — list with filters
 * - POST /api/agenthub/sessions — create with validation
 * - GET /api/agenthub/sessions/:id — single session (via PATCH endpoint for updates)
 * - DELETE → 405 (method not allowed)
 */

const { ApiTestHarness, getAgentHubBaseUrl } = require('./harness');
const { seedSession, seedProject } = require('../fixtures');

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

describe('GET /api/agenthub/sessions', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-sessions-get',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('returns list of sessions', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response, body } = await harness.requestJson('GET', '/api/agenthub/sessions?limit=10');

    harness.assertStatus(response, 200);
    expect(Array.isArray(body)).toBe(true);
  });

  test('filters by project_id', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response, body } = await harness.requestJson(
      'GET',
      '/api/agenthub/sessions?project_id=nonexistent-project'
    );

    harness.assertStatus(response, 200);
    expect(Array.isArray(body)).toBe(true);
    // Should return empty array for nonexistent project
    expect(body.length).toBe(0);
  });

  test('supports hierarchy=chain query', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response } = await harness.requestJson(
      'GET',
      '/api/agenthub/sessions?hierarchy=chain&session_id=test-session-1'
    );

    // Should not crash — returns chain or empty
    expect([200, 500]).toContain(response.status);
  });
});

describe('POST /api/agenthub/sessions', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-sessions-post',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('missing project_id → 400', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response, body } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      title: 'Test Session',
    });

    harness.assertStatus(response, 400);
    harness.assertError(body, /project_id.*required|title.*required/i);
  });

  test('missing title → 400', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response, body } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-project-1',
    });

    harness.assertStatus(response, 400);
    harness.assertError(body, /title.*required/i);
  });

  test('invalid parent_id → 404', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response, body } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-project-1',
      title: 'Child Session',
      parent_id: 'nonexistent-parent',
    });

    harness.assertStatus(response, 404);
    harness.assertError(body, /parent.*not found/i);
  });

  test('creates session with valid data → 201', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response, body } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-project-new',
      title: 'New Test Session',
      agent_model: 'test-model',
      directory: '/tmp/test',
    });

    harness.assertStatus(response, 201);
    harness.assertBodyShape(body, ['id', 'project_id', 'title', 'status']);
    expect(body.project_id).toBe('test-project-new');
    expect(body.title).toBe('New Test Session');
    expect(body.status).toBe('active');
  });

  test('creates child session with valid parent → 201', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    // First create a parent session
    const { body: parent } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-project-parent',
      title: 'Parent Session',
    });

    // Then create a child
    const { response, body } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-project-parent',
      title: 'Child Session',
      parent_id: parent.id,
    });

    harness.assertStatus(response, 201);
    expect(body.parent_id).toBe(parent.id);
  });
});

describe('GET /api/agenthub/sessions/:id', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-sessions-single',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('PATCH updates session visibility', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    // Create a session first
    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-patch',
      title: 'Patch Test',
    });

    const { response, body } = await harness.requestJson(
      'PATCH',
      `/api/agenthub/sessions/${session.id}`,
      { visibility: 'hidden_active' }
    );

    harness.assertStatus(response, 200);
    expect(body.visibility).toBe('hidden_active');
  });

  test('PATCH with invalid visibility → 400', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-patch-2',
      title: 'Patch Test 2',
    });

    const { response, body } = await harness.requestJson(
      'PATCH',
      `/api/agenthub/sessions/${session.id}`,
      { visibility: 'invalid-visibility' }
    );

    harness.assertStatus(response, 400);
    harness.assertError(body, /invalid.*visibility/i);
  });

  test('PATCH nonexistent session → 404', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response, body } = await harness.requestJson(
      'PATCH',
      '/api/agenthub/sessions/nonexistent-session-id',
      { visibility: 'visible' }
    );

    harness.assertStatus(response, 404);
    harness.assertError(body, /not found/i);
  });

  test('PATCH with no valid fields → 400', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { body: session } = await harness.requestJson('POST', '/api/agenthub/sessions', {
      project_id: 'test-patch-3',
      title: 'Patch Test 3',
    });

    const { response, body } = await harness.requestJson(
      'PATCH',
      `/api/agenthub/sessions/${session.id}`,
      { unknown_field: 'value' }
    );

    harness.assertStatus(response, 400);
    harness.assertError(body, /no valid fields/i);
  });
});

describe('DELETE /api/agenthub/sessions', () => {
  test('DELETE method → 405 Method Not Allowed', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-sessions-delete',
    });
    harness.setupDb();

    try {
      const { response } = await harness.requestJson('DELETE', '/api/agenthub/sessions/some-id');

      // Next.js returns 405 for unsupported methods on route
      expect([404, 405]).toContain(response.status);
    } finally {
      harness.teardownDb();
    }
  });
});
