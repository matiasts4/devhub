jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status || 200 })),
  },
}));

const mockAgentSelect = jest.fn();
const mockAgentUpdate = jest.fn();
const mockTaskUpdate = jest.fn();
const mockPrepareAgentWorkspaceLease = jest.fn();

jest.mock('@/lib/db/localDb', () => ({
  getDb: jest.fn(() => ({
    tables: {
      agent_registry: {
        select: (...args) => mockAgentSelect(...args),
        update: (...args) => mockAgentUpdate(...args),
      },
      tasks: {
        update: (...args) => mockTaskUpdate(...args),
      },
    },
  })),
  prepareAgentWorkspaceLease: (...args) => mockPrepareAgentWorkspaceLease(...args),
}));

const { NextResponse } = require('next/server');

describe('POST /api/agent/execute', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    NextResponse.json.mockImplementation((body, init) => ({ body, status: init?.status || 200 }));
    mockAgentSelect.mockReturnValue([{ agent_id: 'agent-1', nombre: 'Agent One' }]);
    mockAgentUpdate.mockImplementation(() => ({}));
    mockTaskUpdate.mockImplementation((_data, where) => {
      const taskId = where?.[0]?.[2];
      if (taskId === 'missing-task') return null;
      return { id: taskId, project_id: 'project-1', status: 'in_progress' };
    });
    mockPrepareAgentWorkspaceLease.mockImplementation((_db, input) => ({
      created: true,
      reused: false,
      ack: {
        workspace_id: `workspace-${input.task_id}-${input.agent_id}`,
        task_id: input.task_id,
        agent_id: input.agent_id,
        requested_base_ref: 'f814998dd05cb491caf8637bf570dbd74b539090',
        reservation_token: 'rsv-execute-1',
        correlation_id: 'corr-execute-1',
        status: 'provisioning',
        accepted_at: '2026-05-18T22:20:00.000Z',
      },
    }));
  });

  test('requests workspace preparation handshake and does not execute git', async () => {
    const { POST } = require('./route.js');

    const response = await POST({
      json: async () => ({ task_id: 'task-1234', agent_id: 'agent-1' }),
    });

    expect(mockPrepareAgentWorkspaceLease).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        task_id: 'task-1234',
        agent_id: 'agent-1',
        requested_base_ref: 'f814998dd05cb491caf8637bf570dbd74b539090',
      }),
      expect.any(Object)
    );
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.workspace_id).toBe('workspace-task-1234-agent-1');
    expect(response.body.correlation_id).toBe('corr-execute-1');
    expect(response.body.message).toMatch(/workspace preparation/i);
  });

  test('returns 404 when task is missing', async () => {
    const { POST } = require('./route.js');

    const response = await POST({
      json: async () => ({ task_id: 'missing-task', agent_id: 'agent-1' }),
    });

    expect(mockPrepareAgentWorkspaceLease).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });
});
