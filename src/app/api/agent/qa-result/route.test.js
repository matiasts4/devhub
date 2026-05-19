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
const mockGetSupervisorSnapshot = jest.fn();
const mockGetSupervisorApprovalCheckpoint = jest.fn();
const mockUpsertSupervisorApprovalCheckpoint = jest.fn();
const mockUpsertSupervisorSnapshot = jest.fn();

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
  getSupervisorSnapshot: (...args) => mockGetSupervisorSnapshot(...args),
  getSupervisorApprovalCheckpoint: (...args) => mockGetSupervisorApprovalCheckpoint(...args),
  upsertSupervisorApprovalCheckpoint: (...args) => mockUpsertSupervisorApprovalCheckpoint(...args),
  upsertSupervisorSnapshot: (...args) => mockUpsertSupervisorSnapshot(...args),
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
    mockGetSupervisorSnapshot.mockReturnValue({
      task_id: 'task-1',
      supervisor_state: 'awaiting_approval',
      outcome: 'request_approval',
      reason_class: 'approval_required',
      approval_checkpoint_key:
        'task-1|workspace-task-1-agent-1|run-task-1-agent-1|approval_required|evidence://qa-approved-1',
      approval_request_count: 1,
      attempt_count: 0,
      task_retry_count: 0,
      unchanged_failure_count: 0,
      orphan_recovery_count: 0,
      workspace_id: 'workspace-task-1-agent-1',
      run_id: 'run-task-1-agent-1',
      evidence_ref: 'evidence://qa-approved-1',
    });
    mockGetSupervisorApprovalCheckpoint.mockReturnValue({
      checkpoint_key:
        'task-1|workspace-task-1-agent-1|run-task-1-agent-1|approval_required|evidence://qa-approved-1',
      task_id: 'task-1',
      workspace_id: 'workspace-task-1-agent-1',
      run_id: 'run-task-1-agent-1',
      reason_class: 'approval_required',
      evidence_ref: 'evidence://qa-approved-1',
      status: 'pending',
    });
    mockUpsertSupervisorApprovalCheckpoint.mockImplementation((_db, input) => ({
      checkpoint_key:
        'task-1|workspace-task-1-agent-1|run-task-1-agent-1|approval_required|evidence://qa-approved-1',
      requested_at: '2026-05-19T01:00:00.000Z',
      decided_at: input.status === 'pending' ? null : '2026-05-19T01:05:00.000Z',
      ...input,
    }));
    mockUpsertSupervisorSnapshot.mockImplementation((_db, input) => ({
      updated_at: '2026-05-19T01:05:00.000Z',
      created_at: '2026-05-19T01:00:00.000Z',
      ...input,
    }));
  });

  test('records explicit approval decision before cleanup intent when supervisor outcome is request_approval', async () => {
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
    expect(mockUpsertSupervisorApprovalCheckpoint).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        task_id: 'task-1',
        status: 'approved',
        decision_note: expect.stringMatching(/Looks good/),
      })
    );
    expect(mockUpsertSupervisorSnapshot).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        task_id: 'task-1',
        supervisor_state: 'closed',
        outcome: 'close',
        reason_class: 'completed',
      })
    );
    expect(response.status).toBe(200);
    expect(response.body.run_id).toBe('run-task-1-agent-1');
    expect(response.body.message).toMatch(/cleanup intent/i);
  });

  test('rejected approval records explicit human rejection and blocks implicit retry', async () => {
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

    expect(mockTaskUpdate).not.toHaveBeenCalled();
    expect(mockWorkspaceUpdate).not.toHaveBeenCalled();
    expect(mockUpdateAgentRunTerminal).not.toHaveBeenCalled();
    expect(mockUpsertSupervisorApprovalCheckpoint).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        task_id: 'task-1',
        status: 'rejected',
        decision_note: expect.stringMatching(/Need changes/),
      })
    );
    expect(mockUpsertSupervisorSnapshot).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        task_id: 'task-1',
        supervisor_state: 'blocked',
        outcome: 'block',
        reason_class: 'approval_rejected',
      })
    );
    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/approval rejected/i);
  });

  test('rejected approval leaves executor run untouched and persists supervisor blocked state', async () => {
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

    expect(mockUpdateAgentRunTerminal).not.toHaveBeenCalled();
    expect(mockAppendAgentArtifact).not.toHaveBeenCalled();
    expect(mockUpsertSupervisorSnapshot).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        task_id: 'task-1',
        supervisor_state: 'blocked',
        outcome: 'block',
        reason_class: 'approval_rejected',
      })
    );
    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/approval rejected/i);
  });

  test('rejects QA approval when supervisor is not awaiting human approval', async () => {
    mockGetSupervisorSnapshot.mockReturnValue({
      task_id: 'task-1',
      supervisor_state: 'dispatch_pending',
      outcome: 'dispatch',
      reason_class: null,
    });
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

    expect(mockUpsertSupervisorApprovalCheckpoint).not.toHaveBeenCalled();
    expect(mockTaskUpdate).not.toHaveBeenCalled();
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/supervisor/i);
  });
});
