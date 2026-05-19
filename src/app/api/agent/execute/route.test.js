jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status || 200 })),
  },
}));

const mockAgentSelect = jest.fn();
const mockAgentUpdate = jest.fn();
const mockTaskUpdate = jest.fn();
const mockWorkspaceUpdate = jest.fn();
const mockPrepareAgentWorkspaceLease = jest.fn();
const mockCreateAgentRun = jest.fn();
const mockAppendAgentArtifact = jest.fn();

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
      agent_workspaces: {
        update: (...args) => mockWorkspaceUpdate(...args),
      },
    },
  })),
  prepareAgentWorkspaceLease: (...args) => mockPrepareAgentWorkspaceLease(...args),
  createAgentRun: (...args) => mockCreateAgentRun(...args),
  appendAgentArtifact: (...args) => mockAppendAgentArtifact(...args),
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
    mockWorkspaceUpdate.mockImplementation(() => ({}));
    mockPrepareAgentWorkspaceLease.mockImplementation((_db, input) => ({
      created: true,
      reused: false,
      workspace: {
        id: `workspace-${input.task_id}-${input.agent_id}`,
        workspace_path: `workspace://project-1/workspace-${input.task_id}-${input.agent_id}`,
        observed_branch: null,
        observed_head: null,
        observed_dirty: null,
        base_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
      },
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
    mockCreateAgentRun.mockImplementation((_db, input) => ({
      run_id: `run-${input.task_id}-${input.agent_id}`,
      workspace_id: input.workspace_id,
      task_id: input.task_id,
      agent_id: input.agent_id,
      status: 'running',
    }));
    mockAppendAgentArtifact.mockImplementation((_db, input) => ({
      artifact_id: `artifact-${input.run_id}`,
      run_id: input.run_id,
      seq: 1,
    }));
  });

  test('requests workspace preparation handshake, creates a durable run, and does not execute git', async () => {
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
    expect(mockCreateAgentRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        workspace_id: 'workspace-task-1234-agent-1',
        task_id: 'task-1234',
        agent_id: 'agent-1',
        status: 'running',
      })
    );
    expect(mockAppendAgentArtifact).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        run_id: 'run-task-1234-agent-1',
        phase: 'execute',
        kind: 'decision.note',
        producer: 'devhub',
      })
    );
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith(
      { run_id_or_session_id: 'run-task-1234-agent-1' },
      [['id', '=', 'workspace-task-1234-agent-1']]
    );
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.run_id).toBe('run-task-1234-agent-1');
    expect(response.body.startup_artifact_id).toBe('artifact-run-task-1234-agent-1');
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
    expect(mockCreateAgentRun).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });
});
