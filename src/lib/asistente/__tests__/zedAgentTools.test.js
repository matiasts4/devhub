/**
 * @jest-environment node
 */

jest.mock('@/lib/db/localDb', () => ({
  getDb: jest.fn(),
}));

const { getDb } = require('@/lib/db/localDb');
const { registerZedAgentTool, heartbeatZedAgentTool } = require('../tools/zedAgent');

describe('zedAgent tools', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      prepare: jest.fn().mockReturnThis(),
      get: jest.fn(),
      run: jest.fn(),
    };
    getDb.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('register_zed_agent inserts when not existing', async () => {
    mockDb.get.mockReturnValue(null);
    const result = await registerZedAgentTool.execute({}, {});
    expect(result.success).toBe(true);
    expect(result.agent_id).toBe('zed-assistant');
    expect(mockDb.run).toHaveBeenCalled();
  });

  test('register_zed_agent updates when existing', async () => {
    mockDb.get.mockReturnValue({ agent_id: 'zed-assistant' });
    const result = await registerZedAgentTool.execute({}, { project_id: 'custom-project' });
    expect(result.success).toBe(true);
    expect(result.registered).toBe(false);
    expect(mockDb.run).toHaveBeenCalled();
  });

  test('heartbeat_zed_agent updates status and current_task_id', async () => {
    mockDb.get.mockReturnValue({ agent_id: 'zed-assistant' });
    const result = await heartbeatZedAgentTool.execute({
      status: 'working',
      current_task_id: 'task-123',
    });
    expect(result.success).toBe(true);
    expect(result.status).toBe('working');
    expect(result.current_task_id).toBe('task-123');
  });
});
