/**
 * @jest-environment node
 */

jest.mock('@/lib/db/localDb', () => ({
  getDb: jest.fn(),
}));

const { getDb } = require('@/lib/db/localDb');
const { listAgentRunsTool, getAgentRunTool } = require('../tools/agentRuns');

describe('agentRuns tools', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      prepare: jest.fn().mockReturnThis(),
      all: jest.fn(),
      get: jest.fn(),
    };
    getDb.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('list_agent_runs filters by task_id', async () => {
    mockDb.all.mockReturnValue([{ run_id: 'r1', status: 'running' }]);
    const result = await listAgentRunsTool.execute({ task_id: 't1' });
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].run_id).toBe('r1');
  });

  test('get_agent_run returns run details', async () => {
    mockDb.get.mockReturnValue({ run_id: 'r1', status: 'succeeded' });
    const result = await getAgentRunTool.execute({ run_id: 'r1' });
    expect(result.run.status).toBe('succeeded');
  });

  test('get_agent_run returns not_found', async () => {
    mockDb.get.mockReturnValue(null);
    const result = await getAgentRunTool.execute({ run_id: 'missing' });
    expect(result.error).toBe('not_found');
  });

  test('get_agent_run requires run_id', async () => {
    const result = await getAgentRunTool.execute({});
    expect(result.error).toBe('missing required parameter: run_id');
  });
});
