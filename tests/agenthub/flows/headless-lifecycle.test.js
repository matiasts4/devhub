/**
 * Flow Tests — Headless Agent Lifecycle
 *
 * Flow: launch → verify session → verify traces → abort
 */

const { TestHarness } = require('../harness');
const { FlowVerifier } = require('../flow-verifier');
const { seedProject, seedSession } = require('../fixtures');

describe('Flow: Headless Agent Lifecycle', () => {
  let harness;
  let verifier;

  beforeEach(async () => {
    harness = new TestHarness({ dbPath: ':memory:', lockOwner: 'flow-headless' });
    harness.setupDb();
    seedProject(harness.db, { id: 'test-proj-flow', name: 'Flow Test Project' });
    verifier = new FlowVerifier(harness);
  });

  afterEach(async () => {
    harness.teardownDb();
  });

  test.skip('requires live Next.js server and fetch support', async () => {
    const serverReachable = await fetch(`${verifier.baseUrl}/api/agenthub/opencode/status`)
      .then(() => true)
      .catch(() => false);

    if (!serverReachable) {
      console.log('⚠️  Next.js server not reachable — skipping flow test');
      return;
    }

    const result = await verifier.execute({
      name: 'headless-lifecycle',
      timeout: 60000,
      onFailure: 'abort',
      locks: [{ type: 'flow', key: 'headless-lifecycle' }],
      steps: [
        {
          name: 'launch',
          action: 'api',
          method: 'POST',
          path: '/api/agenthub/headless',
          body: {
            prompt: 'Test prompt for flow verification',
            project_id: 'test-proj-flow',
          },
          assert: { status: 200 },
          timeout: 15000,
        },
        {
          name: 'verify-session',
          action: 'assert',
          type: 'db.rowExists',
          table: 'agent_hub_sessions',
          where: { project_id: 'test-proj-flow' },
        },
        {
          name: 'check-status',
          action: 'api',
          method: 'GET',
          path: '/api/agenthub/opencode/status',
          assert: { status: 200 },
          timeout: 10000,
        },
        {
          name: 'abort',
          action: 'api',
          method: 'POST',
          path: '/api/agenthub/sessions/$launch.sessionId/abort',
          timeout: 10000,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.passedSteps).toBe(result.totalSteps);
  });

  test('flow aborts on first failure', async () => {
    const result = await verifier.execute({
      name: 'headless-fail-fast',
      timeout: 30000,
      onFailure: 'abort',
      steps: [
        {
          name: 'bad-request',
          action: 'api',
          method: 'POST',
          path: '/api/agenthub/headless',
          body: {}, // Missing required fields
          assert: { status: 400 },
        },
        {
          name: 'should-not-run',
          action: 'assert',
          type: 'db.rowExists',
          table: 'nonexistent_table',
        },
      ],
    });

    // First step expects 400 — if server returns 200, it fails the assertion
    // Either way, the flow should not run step 2
    const shouldNotRun = result.steps.find((s) => s.name === 'should-not-run');
    expect(shouldNotRun).toBeUndefined();
  });
});
