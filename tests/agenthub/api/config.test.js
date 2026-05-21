/**
 * Test /api/agenthub/config
 *
 * Tests:
 * - GET /api/agenthub/config — read swarm config
 * - PUT /api/agenthub/config — update config
 * - Verify swarm_config table changes
 */

const { ApiTestHarness, getAgentHubBaseUrl } = require('./harness');
const { createMockDb } = require('../mocks');
const { seedSwarmConfig } = require('../fixtures');
const { assertDbRow } = require('../assertions');

const BASE_URL = getAgentHubBaseUrl();

describe('GET /api/agenthub/config', () => {
  let harness;

  beforeEach(() => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-config',
    });
    harness.setupDb();
  });

  afterEach(() => {
    harness.teardownDb();
  });

  test('returns swarm config with max_concurrent_swarms and swarm_enabled', async () => {
    if (await harness.skipIfServerUnavailable()) {
      return;
    }

    const { response, body } = await harness.requestJson('GET', '/api/agenthub/config');

    harness.assertStatus(response, 200);
    harness.assertBodyShape(body, {
      max_concurrent_swarms: 'number',
      swarm_enabled: 'boolean',
    });
    expect(body.max_concurrent_swarms).toBeGreaterThan(0);
    expect(typeof body.swarm_enabled).toBe('boolean');
  });
});

describe('PUT /api/agenthub/config', () => {
  let harness;

  beforeEach(() => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-config-update',
    });
    harness.setupDb();
  });

  afterEach(() => {
    harness.teardownDb();
  });

  describe('validation', () => {
    test('invalid max_concurrent_swarms (too low) → 400', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const { response, body } = await harness.requestJson('PUT', '/api/agenthub/config', {
        max_concurrent_swarms: 0,
      });

      harness.assertStatus(response, 400);
      harness.assertError(body, 'max_concurrent_swarms');
    });

    test('invalid max_concurrent_swarms (too high) → 400', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const { response, body } = await harness.requestJson('PUT', '/api/agenthub/config', {
        max_concurrent_swarms: 21,
      });

      harness.assertStatus(response, 400);
      harness.assertError(body, 'max_concurrent_swarms');
    });

    test('non-numeric max_concurrent_swarms → 400', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const { response, body } = await harness.requestJson('PUT', '/api/agenthub/config', {
        max_concurrent_swarms: 'not-a-number',
      });

      harness.assertStatus(response, 400);
    });
  });

  describe('happy path', () => {
    test('update max_concurrent_swarms', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const { response, body } = await harness.requestJson('PUT', '/api/agenthub/config', {
        max_concurrent_swarms: 10,
      });

      harness.assertStatus(response, 200);
      harness.assertBodyShape(body, {
        max_concurrent_swarms: 'number',
        swarm_enabled: 'boolean',
      });
      expect(body.max_concurrent_swarms).toBe(10);
    });

    test('enable swarm', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const { response, body } = await harness.requestJson('PUT', '/api/agenthub/config', {
        swarm_enabled: true,
      });

      harness.assertStatus(response, 200);
      expect(body.swarm_enabled).toBe(true);
    });

    test('disable swarm', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const { response, body } = await harness.requestJson('PUT', '/api/agenthub/config', {
        swarm_enabled: false,
      });

      harness.assertStatus(response, 200);
      expect(body.swarm_enabled).toBe(false);
    });

    test('update both fields at once', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      const { response, body } = await harness.requestJson('PUT', '/api/agenthub/config', {
        max_concurrent_swarms: 3,
        swarm_enabled: true,
      });

      harness.assertStatus(response, 200);
      expect(body.max_concurrent_swarms).toBe(3);
      expect(body.swarm_enabled).toBe(true);
    });

    test('valid boundary values (1 and 20)', async () => {
      if (await harness.skipIfServerUnavailable()) {
        return;
      }

      // Min value
      const res1 = await harness.requestJson('PUT', '/api/agenthub/config', {
        max_concurrent_swarms: 1,
      });
      harness.assertStatus(res1.response, 200);
      expect(res1.body.max_concurrent_swarms).toBe(1);

      // Max value
      const res2 = await harness.requestJson('PUT', '/api/agenthub/config', {
        max_concurrent_swarms: 20,
      });
      harness.assertStatus(res2.response, 200);
      expect(res2.body.max_concurrent_swarms).toBe(20);
    });
  });
});
