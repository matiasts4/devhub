jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status || 200 })),
  },
}));

const mockTaskSingle = jest.fn();
const mockTaskUpdate = jest.fn();
const mockAgentUpdate = jest.fn();
const mockWorkspaceUpdate = jest.fn();
const mockGetLatestAgentRunForWorkspace = jest.fn();
const mockGetLatestAgentRunForTask = jest.fn();
const mockUpdateAgentRunTerminal = jest.fn();
const mockAppendAgentArtifact = jest.fn();

jest.mock('@/lib/db/localDb', () => ({
  getDb: jest.fn(() => ({
    tables: {
      tasks: {
        single: (...args) => mockTaskSingle(...args),
        update: (...args) => mockTaskUpdate(...args),
      },
      agent_registry: {
        update: (...args) => mockAgentUpdate(...args),
      },
      agent_workspaces: {
        update: (...args) => mockWorkspaceUpdate(...args),
      },
    },
  })),
  getLatestAgentRunForWorkspace: (...args) => mockGetLatestAgentRunForWorkspace(...args),
  getLatestAgentRunForTask: (...args) => mockGetLatestAgentRunForTask(...args),
  updateAgentRunTerminal: (...args) => mockUpdateAgentRunTerminal(...args),
  appendAgentArtifact: (...args) => mockAppendAgentArtifact(...args),
}));

const { NextResponse } = require('next/server');

describe('POST /api/agent/qa-result', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    NextResponse.json.mockImplementation((body, init) => ({ body, status: init?.status || 200 }));
    mockTaskSingle.mockReturnValue({ id: 'task-1', retry_count: 0 });
    mockTaskUpdate.mockImplementation(() => ({}));
    mockAgentUpdate.mockImplementation(() => ({}));
    mockWorkspaceUpdate.mockImplementation(() => ({}));
    mockGetLatestAgentRunForWorkspace.mockReturnValue({ run_id: 'run-task-1-agent-1' });
    mockGetLatestAgentRunForTask.mockReturnValue({ run_id: 'run-task-1-agent-1' });
    mockUpdateAgentRunTerminal.mockImplementation((_db, _runId, updates) => ({
      run_id: 'run-task-1-agent-1',
      ...updates,
    }));
    mockAppendAgentArtifact.mockImplementation((_db, input) => ({
      artifact_id: `artifact-${input.run_id}`,
      run_id: input.run_id,
      seq: 1,
    }));
  });

  test('approves task by recording cleanup intent with opaque executor evidence ref', async () => {
    const { POST } = require('./route.js');

    const response = await POST({
      json: async () => ({
        task_id: 'task-1',
        result: 'approved',
        reasons: ['Looks good'],
        workspace_id: 'workspace-task-1-agent-1',
        evidence_ref: 'evidence://qa-approved-1',
      }),
    });

    expect(mockWorkspaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cleanup_pending',
        last_error: null,
        evidence_ref: 'evidence://qa-approved-1',
      }),
      [['id', '=', 'workspace-task-1-agent-1']]
    );
    expect(mockUpdateAgentRunTerminal).toHaveBeenCalledWith(
      expect.any(Object),
      'run-task-1-agent-1',
      expect.objectContaining({
        status: 'succeeded',
        terminal_reason_class: 'qa_approved',
      })
    );
    expect(mockAppendAgentArtifact).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        run_id: 'run-task-1-agent-1',
        phase: 'qa',
        kind: 'qa.result',
        producer: 'qa',
      })
    );
    expect(response.status).toBe(200);
    expect(response.body.run_id).toBe('run-task-1-agent-1');
    expect(response.body.message).toMatch(/cleanup intent/i);
  });

  test('rejected task keeps retry semantics and pauses workspace intent with opaque evidence', async () => {
    const { POST } = require('./route.js');

    const response = await POST({
      json: async () => ({
        task_id: 'task-1',
        result: 'rejected',
        reasons: ['Need changes'],
        workspace_id: 'workspace-task-1-agent-1',
        evidence_ref: 'evidence://qa-rejected-1',
      }),
    });

    expect(mockTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ retry_count: 1, last_qa_feedback: 'Need changes' }),
      [['id', '=', 'task-1']]
    );
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'paused',
        recovery_reason: 'qa-rejected',
        evidence_ref: 'evidence://qa-rejected-1',
      }),
      [['id', '=', 'workspace-task-1-agent-1']]
    );
    expect(mockUpdateAgentRunTerminal).toHaveBeenCalledWith(
      expect.any(Object),
      'run-task-1-agent-1',
      expect.objectContaining({
        status: 'failed',
        terminal_reason_class: 'qa_rejected',
      })
    );
    expect(response.status).toBe(200);
    expect(response.body.run_id).toBe('run-task-1-agent-1');
  });

  test('blocked task closes the durable run with terminal blocked semantics', async () => {
    mockTaskSingle.mockReturnValue({ id: 'task-1', retry_count: 2 });
    const { POST } = require('./route.js');

    const response = await POST({
      json: async () => ({
        task_id: 'task-1',
        result: 'rejected',
        reasons: ['Still broken'],
        workspace_id: 'workspace-task-1-agent-1',
        evidence_ref: 'evidence://qa-blocked-1',
      }),
    });

    expect(mockUpdateAgentRunTerminal).toHaveBeenCalledWith(
      expect.any(Object),
      'run-task-1-agent-1',
      expect.objectContaining({
        status: 'failed',
        terminal_reason_class: 'qa_blocked',
      })
    );
    expect(mockAppendAgentArtifact).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        evidence_ref: 'evidence://qa-blocked-1',
        summary: expect.stringMatching(/blocked/i),
      })
    );
    expect(response.status).toBe(200);
  });
});
