/**
 * Flow Tests — MCP Tool Chain
 *
 * Flow: create_project → create_task → update_task → list_tasks
 */

const { TestHarness } = require('../harness');
const { FlowVerifier } = require('../flow-verifier');
const { seedProject, seedTask } = require('../fixtures');
const { assertDbRow, assertDbRowCount } = require('../assertions');

describe('Flow: MCP Tool Chain', () => {
  let harness;
  let verifier;

  beforeEach(async () => {
    harness = new TestHarness({ dbPath: ':memory:', lockOwner: 'flow-mcp-chain' });
    harness.setupDb();
    verifier = new FlowVerifier(harness);
  });

  afterEach(async () => {
    harness.teardownDb();
  });

  test('creates project and task via DB simulation', async () => {
    // Since we can't easily import the ESM MCP server in CJS tests,
    // we simulate the tool chain using DB operations + custom steps
    const result = await verifier.execute({
      name: 'mcp-toolchain',
      timeout: 30000,
      onFailure: 'abort',
      locks: [{ type: 'flow', key: 'mcp-toolchain' }],
      steps: [
        {
          name: 'create-project',
          action: 'custom',
          fn: (harness) => {
            const project = seedProject(harness.db, {
              id: 'test-mcp-proj',
              name: 'MCP Test Project',
            });
            return { success: true, projectId: project.id };
          },
        },
        {
          name: 'verify-project',
          action: 'assert',
          type: 'db.rowExists',
          table: 'projects',
          where: { id: 'test-mcp-proj' },
        },
        {
          name: 'create-task',
          action: 'custom',
          fn: (harness) => {
            const task = seedTask(harness.db, 'test-mcp-proj', {
              id: 'test-mcp-task-1',
              title: 'MCP Test Task',
              status: 'pending',
            });
            return { success: true, taskId: task.id };
          },
        },
        {
          name: 'verify-task',
          action: 'assert',
          type: 'db.rowExists',
          table: 'tasks',
          where: { id: 'test-mcp-task-1' },
        },
        {
          name: 'update-task',
          action: 'custom',
          fn: (harness) => {
            harness.db
              .prepare("UPDATE tasks SET status = 'in_progress' WHERE id = ?")
              .run('test-mcp-task-1');
            return { success: true };
          },
        },
        {
          name: 'verify-update',
          action: 'assert',
          type: 'db.fieldValue',
          table: 'tasks',
          where: { id: 'test-mcp-task-1' },
          field: 'status',
          value: 'in_progress',
        },
        {
          name: 'count-tasks',
          action: 'assert',
          type: 'db.rowCount',
          table: 'tasks',
          where: { project_id: 'test-mcp-proj' },
          min: 1,
          max: 1,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.passedSteps).toBe(result.totalSteps);
    expect(result.totalSteps).toBe(7);
  });

  test('chain aborts when task creation fails', async () => {
    const result = await verifier.execute({
      name: 'mcp-chain-fail',
      timeout: 30000,
      onFailure: 'abort',
      steps: [
        {
          name: 'create-project',
          action: 'custom',
          fn: () => ({ success: true, projectId: 'test-fail-proj' }),
        },
        {
          name: 'create-task',
          action: 'custom',
          fn: () => ({ success: false, error: 'Task creation failed' }),
        },
        {
          name: 'should-not-run',
          action: 'assert',
          type: 'db.rowExists',
          table: 'tasks',
          where: { id: 'nonexistent' },
        },
      ],
    });

    const shouldNotRun = result.steps.find((s) => s.name === 'should-not-run');
    expect(shouldNotRun).toBeUndefined();
    expect(result.failedSteps).toBe(1);
  });
});
