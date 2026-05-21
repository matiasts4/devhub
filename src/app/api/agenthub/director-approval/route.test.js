jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        json: async () => body,
      };
    },
  },
}));

describe('POST /api/agenthub/director-approval', () => {
  function createDependencies(overrides = {}) {
    const db = {
      tables: {
        tasks: {
          single: jest.fn().mockReturnValue({ id: 'task-1', status: 'pending', retry_count: 0 }),
        },
        agent_workspaces: {
          single: jest.fn().mockReturnValue({
            id: 'ws-1',
            status: 'active',
            observed_dirty: 'clean',
            evidence_ref: 'evidence://workspace/ws-1',
          }),
        },
      },
    };

    return {
      getDb: jest.fn(() => db),
      getSupervisorSnapshot: jest.fn().mockReturnValue({
        task_id: 'task-1',
        supervisor_state: 'awaiting_approval',
        outcome: 'request_approval',
        reason_class: 'approval_required',
        approval_request_count: 1,
        attempt_count: 0,
        task_retry_count: 0,
        unchanged_failure_count: 0,
        orphan_recovery_count: 0,
        approval_checkpoint_key: 'checkpoint-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        evidence_ref: 'evidence://approval/checkpoint-1',
      }),
      getSupervisorApprovalCheckpoint: jest.fn().mockReturnValue({
        checkpoint_key: 'checkpoint-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        status: 'pending',
        reason_class: 'approval_required',
        evidence_ref: 'evidence://approval/checkpoint-1',
      }),
      getLatestAgentRunForWorkspace: jest.fn().mockReturnValue({
        run_id: 'run-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        status: 'running',
      }),
      getLatestAgentRunForTask: jest.fn().mockReturnValue({
        run_id: 'run-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        status: 'running',
      }),
      listAgentRuns: jest.fn().mockReturnValue([
        {
          run_id: 'run-1',
          task_id: 'task-1',
          workspace_id: 'ws-1',
          status: 'running',
        },
      ]),
      getLatestAgentArtifactForRun: jest.fn().mockReturnValue({
        artifact_id: 'artifact-1',
        run_id: 'run-1',
        evidence_ref: 'evidence://artifact/artifact-1',
      }),
      upsertSupervisorApprovalCheckpoint: jest.fn((_db, input) => ({
        checkpoint_key: input.checkpoint_key,
        task_id: input.task_id,
        workspace_id: input.workspace_id,
        run_id: input.run_id,
        status: input.status,
        reason_class: input.reason_class,
        evidence_ref: input.evidence_ref,
        decision_note: input.decision_note,
        decided_at: input.decided_at,
      })),
      evaluateSupervisorSnapshot: jest.fn().mockReturnValue({
        task_id: 'task-1',
        supervisor_state: 'dispatch_pending',
        outcome: 'dispatch',
        reason_class: null,
        task_retry_count: 0,
        attempt_count: 1,
        unchanged_failure_count: 0,
        approval_request_count: 1,
        orphan_recovery_count: 0,
        workspace_id: 'ws-1',
        run_id: 'run-1',
        evidence_ref: 'evidence://approval/checkpoint-1',
        approval_checkpoint_key: null,
      }),
      upsertSupervisorSnapshot: jest.fn((_db, input) => ({
        ...input,
        updated_at: '2026-05-21T10:00:00.000Z',
      })),
      gatherOperationalHealth: jest.fn().mockResolvedValue({
        control_room_snapshot_input: {
          supervisor: {
            supervisor_state: 'dispatch_pending',
            approvals: [],
          },
        },
      }),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('approves one checkpoint and returns refreshed authoritative snapshot input', async () => {
    const { POST } = require('./route.js');
    const deps = createDependencies();

    const response = await POST(
      {
        json: async () => ({
          task_id: 'task-1',
          checkpoint_key: 'checkpoint-1',
          decision: 'approve',
          workspace_id: 'ws-1',
          run_id: 'run-1',
          evidence_ref: 'evidence://approval/checkpoint-1',
          decision_note: 'Dispatch approved',
        }),
      },
      undefined,
      deps
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(deps.upsertSupervisorApprovalCheckpoint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        checkpoint_key: 'checkpoint-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        status: 'approved',
        decision_note: 'Dispatch approved',
      })
    );
    expect(deps.upsertSupervisorSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        task_id: 'task-1',
        supervisor_state: 'dispatch_pending',
        outcome: 'dispatch',
      })
    );
    expect(deps.gatherOperationalHealth).toHaveBeenCalled();
    expect(payload.control_room_snapshot_input).toEqual({
      supervisor: {
        supervisor_state: 'dispatch_pending',
        approvals: [],
      },
    });
  });

  test('rejects one checkpoint and persists blocked supervisor state', async () => {
    const { POST } = require('./route.js');
    const deps = createDependencies({
      evaluateSupervisorSnapshot: jest.fn().mockReturnValue({
        task_id: 'task-1',
        supervisor_state: 'blocked',
        outcome: 'block',
        reason_class: 'approval_rejected',
        task_retry_count: 0,
        attempt_count: 1,
        unchanged_failure_count: 0,
        approval_request_count: 1,
        orphan_recovery_count: 0,
        workspace_id: 'ws-1',
        run_id: 'run-1',
        evidence_ref: 'evidence://approval/checkpoint-1',
        approval_checkpoint_key: 'checkpoint-1',
      }),
      gatherOperationalHealth: jest.fn().mockResolvedValue({
        control_room_snapshot_input: {
          supervisor: {
            supervisor_state: 'blocked',
            approvals: [],
          },
        },
      }),
    });

    const response = await POST(
      {
        json: async () => ({
          task_id: 'task-1',
          checkpoint_key: 'checkpoint-1',
          decision: 'reject',
          workspace_id: 'ws-1',
          run_id: 'run-1',
          decision_note: 'Rejected by Director',
        }),
      },
      undefined,
      deps
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(deps.upsertSupervisorApprovalCheckpoint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'rejected', decision_note: 'Rejected by Director' })
    );
    expect(deps.upsertSupervisorSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        supervisor_state: 'blocked',
        outcome: 'block',
        reason_class: 'approval_rejected',
      })
    );
    expect(payload.control_room_snapshot_input.supervisor.supervisor_state).toBe('blocked');
  });

  test('returns wait outcome when refreshed supervisor still needs follow-up', async () => {
    const { POST } = require('./route.js');
    const deps = createDependencies({
      evaluateSupervisorSnapshot: jest.fn().mockReturnValue({
        task_id: 'task-1',
        supervisor_state: 'awaiting_evidence',
        outcome: 'wait',
        reason_class: 'dirty_excluded_observed',
        task_retry_count: 0,
        attempt_count: 1,
        unchanged_failure_count: 0,
        approval_request_count: 1,
        orphan_recovery_count: 0,
        workspace_id: 'ws-1',
        run_id: 'run-1',
        evidence_ref: 'evidence://approval/checkpoint-1',
        approval_checkpoint_key: 'checkpoint-1',
      }),
    });

    const response = await POST(
      {
        json: async () => ({
          task_id: 'task-1',
          checkpoint_key: 'checkpoint-1',
          decision: 'approve',
        }),
      },
      undefined,
      deps
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supervisor).toMatchObject({
      supervisor_state: 'awaiting_evidence',
      outcome: 'wait',
      reason_class: 'dirty_excluded_observed',
    });
  });

  test('returns retry outcome when refreshed supervisor remains retry_pending', async () => {
    const { POST } = require('./route.js');
    const deps = createDependencies({
      evaluateSupervisorSnapshot: jest.fn().mockReturnValue({
        task_id: 'task-1',
        supervisor_state: 'retry_pending',
        outcome: 'retry',
        reason_class: 'recoverable_failure',
        task_retry_count: 1,
        attempt_count: 2,
        unchanged_failure_count: 0,
        approval_request_count: 1,
        orphan_recovery_count: 0,
        workspace_id: 'ws-1',
        run_id: 'run-1',
        evidence_ref: 'evidence://approval/checkpoint-1',
        approval_checkpoint_key: 'checkpoint-1',
      }),
    });

    const response = await POST(
      {
        json: async () => ({
          task_id: 'task-1',
          checkpoint_key: 'checkpoint-1',
          decision: 'approve',
        }),
      },
      undefined,
      deps
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supervisor).toMatchObject({
      supervisor_state: 'retry_pending',
      outcome: 'retry',
      reason_class: 'recoverable_failure',
    });
  });

  test('rejects unsupported decisions without mutating durable state', async () => {
    const { POST } = require('./route.js');
    const deps = createDependencies();

    const response = await POST(
      {
        json: async () => ({
          task_id: 'task-1',
          checkpoint_key: 'checkpoint-1',
          decision: 'pause',
        }),
      },
      undefined,
      deps
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/decision/i);
    expect(deps.upsertSupervisorApprovalCheckpoint).not.toHaveBeenCalled();
    expect(deps.upsertSupervisorSnapshot).not.toHaveBeenCalled();
  });

  test('returns conflict when checkpoint is stale or already decided', async () => {
    const { POST } = require('./route.js');
    const deps = createDependencies({
      getSupervisorApprovalCheckpoint: jest.fn().mockReturnValue({
        checkpoint_key: 'checkpoint-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        status: 'approved',
        reason_class: 'approval_required',
      }),
    });

    const response = await POST(
      {
        json: async () => ({
          task_id: 'task-1',
          checkpoint_key: 'checkpoint-1',
          decision: 'approve',
        }),
      },
      undefined,
      deps
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toMatch(/pending/i);
    expect(deps.upsertSupervisorApprovalCheckpoint).not.toHaveBeenCalled();
    expect(deps.upsertSupervisorSnapshot).not.toHaveBeenCalled();
  });

  test('returns conflict when request linkage no longer matches durable truth', async () => {
    const { POST } = require('./route.js');
    const deps = createDependencies();

    const response = await POST(
      {
        json: async () => ({
          task_id: 'task-1',
          checkpoint_key: 'checkpoint-1',
          decision: 'approve',
          workspace_id: 'ws-stale',
          run_id: 'run-1',
        }),
      },
      undefined,
      deps
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toMatch(/linkage/i);
    expect(deps.upsertSupervisorApprovalCheckpoint).not.toHaveBeenCalled();
    expect(deps.upsertSupervisorSnapshot).not.toHaveBeenCalled();
  });
});
