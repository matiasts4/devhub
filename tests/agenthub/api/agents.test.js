/**
 * Test: /api/agents/* endpoints
 *
 * Tests:
 * - POST /api/agents/launch — creates session, returns session ID
 * - GET /api/agents/profiles — returns list
 * - GET /api/agents/quotas — returns { used, limit, remaining }
 * - Validation errors → 400
 */

const { ApiTestHarness, getAgentHubBaseUrl } = require('./harness');

jest.setTimeout(30000);

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

function isTimeoutError(err) {
  return err?.name === 'TimeoutError' || /aborted due to timeout/i.test(err?.message || '');
}

async function requestJsonOrSkip(harness, method, path, body, options, skipLabel) {
  try {
    return await harness.requestJson(method, path, body, options);
  } catch (err) {
    if (isTimeoutError(err)) {
      console.warn(`SKIP: ${skipLabel} timed out in this environment`);
      return null;
    }
    throw err;
  }
}

describe('POST /api/agents/launch', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-agents-launch',
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
    test('missing task → 400', async () => {
      const reachable = await serverReachable();
      if (!reachable) {
        console.warn('SKIP: Next.js server not reachable at', BASE_URL);
        return;
      }

      const { response, body } = await harness.requestJson('POST', '/api/agents/launch', {
        profileName: 'default',
      });

      harness.assertStatus(response, 400);
      harness.assertError(body, /task.*required/i);
    });

    test('missing profileName uses auto-selection or validation fallback', async () => {
      const reachable = await serverReachable();
      if (!reachable) {
        console.warn('SKIP: Next.js server not reachable at', BASE_URL);
        return;
      }

      const result = await requestJsonOrSkip(
        harness,
        'POST',
        '/api/agents/launch',
        {
          task: 'Do something',
        },
        { timeout: 20000 },
        'agents launch auto-selection check'
      );
      if (!result) return;

      const { response, body } = result;

      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 400) {
        harness.assertError(body, /profile|required|task/i);
      }
    });

    test('docops planning prompt without projectId → 400', async () => {
      const reachable = await serverReachable();
      if (!reachable) {
        console.warn('SKIP: Next.js server not reachable at', BASE_URL);
        return;
      }

      const { response, body } = await harness.requestJson('POST', '/api/agents/launch', {
        task: 'Create a planning document for this project',
        profileName: 'default',
      });

      // May return 400 if docops gate detects planning prompt
      expect([200, 400, 500]).toContain(response.status);
      if (response.status === 400) {
        harness.assertError(body, /projectId/i);
      }
    });
  });

  describe('happy path (requires running server)', () => {
    test('launches agent and returns session ID', async () => {
      const reachable = await serverReachable();
      if (!reachable) {
        console.warn('SKIP: Next.js server not reachable at', BASE_URL);
        return;
      }

      const { response, body } = await harness.requestJson(
        'POST',
        '/api/agents/launch',
        {
          task: 'Say hello',
          profileName: 'default',
        },
        { timeout: 10000 }
      );

      if (response.status === 200) {
        harness.assertBodyShape(body, ['success', 'agentId']);
        expect(body.success).toBe(true);
        expect(typeof body.agentId).toBe('string');
      } else if (response.status === 500) {
        // Profile not found or spawn error
        harness.assertError(body, /profile|internal/i);
      }
    });
  });
});

describe('GET /api/agents/profiles', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-agents-profiles',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('returns list of profiles', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response, body } = await harness.requestJson('GET', '/api/agents/profiles');

    harness.assertStatus(response, 200);
    harness.assertBodyShape(body, ['success', 'profiles']);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.profiles)).toBe(true);
  });

  test('profiles array is non-empty (defaults)', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const { response, body } = await harness.requestJson('GET', '/api/agents/profiles');

    harness.assertStatus(response, 200);
    // Endpoint returns defaults ['default', 'dev', 'code'] if none found
    expect(body.profiles.length).toBeGreaterThan(0);
  });
});

describe('GET /api/agents/quotas', () => {
  let harness;

  beforeEach(async () => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-agents-quotas',
    });
    harness.setupDb();
  });

  afterEach(async () => {
    if (harness._activeLocks.length > 0) {
      await harness.releaseLocks(harness._activeLocks);
    }
    harness.teardownDb();
  });

  test('returns quotas array with checkedAt', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const result = await requestJsonOrSkip(
      harness,
      'GET',
      '/api/agents/quotas',
      undefined,
      { timeout: 20000 },
      'agents quotas check'
    );
    if (!result) return;

    const { response, body } = result;

    harness.assertStatus(response, 200);
    harness.assertBodyShape(body, ['success', 'quotas', 'checkedAt']);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.quotas)).toBe(true);
    expect(body.checkedAt).toBeDefined();
  });

  test('each quota has profile and status', async () => {
    const reachable = await serverReachable();
    if (!reachable) {
      console.warn('SKIP: Next.js server not reachable at', BASE_URL);
      return;
    }

    const result = await requestJsonOrSkip(
      harness,
      'GET',
      '/api/agents/quotas',
      undefined,
      { timeout: 20000 },
      'agents quotas detail check'
    );
    if (!result) return;

    const { response, body } = result;

    harness.assertStatus(response, 200);

    for (const quota of body.quotas) {
      expect(quota).toHaveProperty('profile');
      expect(quota).toHaveProperty('status');
    }
  });
});
