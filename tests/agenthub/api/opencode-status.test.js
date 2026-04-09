/**
 * Test GET /api/agenthub/opencode/status
 *
 * Tests the OpenCode process status endpoint.
 */

const { ApiTestHarness } = require('./harness');

const BASE_URL = process.env.AGENTHUB_BASE_URL || 'http://localhost:3000';

describe('GET /api/agenthub/opencode/status', () => {
  let harness;

  beforeEach(() => {
    harness = new ApiTestHarness({
      baseUrl: BASE_URL,
      dbPath: ':memory:',
      lockOwner: 'test-opencode-status',
    });
    harness.setupDb();
  });

  afterEach(() => {
    harness.teardownDb();
  });

  test('returns process, concurrency, and queue info', async () => {
    const { response, body } = await harness.requestJson('GET', '/api/agenthub/opencode/status');

    harness.assertStatus(response, 200);
    harness.assertBodyShape(body, {
      process: 'object',
      concurrency: 'object',
      queue: 'object',
    });

    // Process info
    expect(body.process).toHaveProperty('running');
    expect(body.process).toHaveProperty('healthy');
    expect(body.process).toHaveProperty('status');

    // Concurrency info
    expect(body.concurrency).toHaveProperty('active');
    expect(body.concurrency).toHaveProperty('max');
    expect(body.concurrency).toHaveProperty('atLimit');
    expect(typeof body.concurrency.active).toBe('number');
    expect(typeof body.concurrency.max).toBe('number');
    expect(typeof body.concurrency.atLimit).toBe('boolean');

    // Queue info
    expect(body.queue).toHaveProperty('length');
    expect(body.queue).toHaveProperty('estimatedWaitMs');
    expect(typeof body.queue.length).toBe('number');
    expect(typeof body.queue.estimatedWaitMs).toBe('number');
  });

  test('concurrency values are consistent', async () => {
    const { response, body } = await harness.requestJson('GET', '/api/agenthub/opencode/status');

    if (response.status === 200) {
      const { concurrency } = body;
      expect(concurrency.active).toBeGreaterThanOrEqual(0);
      expect(concurrency.max).toBeGreaterThan(0);
      expect(concurrency.atLimit).toBe(concurrency.active >= concurrency.max);
    }
  });
});
