function buildControlRoomInput(overrides = {}) {
  return {
    project: { id: 'project-1', name: 'DevHub' },
    supervisor: {
      supervisor_state: 'lease_active',
      active_agents: 1,
      max_agents: 5,
      queue_depth: 2,
      authority: 'authoritative',
      freshness: 'current',
      evidence_ref: 'evidence://supervisor/header',
      agents: [
        {
          agent_id: 'worker-1',
          task_id: 'task-1',
          lease_expires_at: '2026-05-19T07:30:00.000Z',
          workspace_id: 'ws-1',
          run_id: 'run-1',
          supervisor_state: 'awaiting_approval',
          evidence_ref: 'evidence://supervisor/task-1',
        },
      ],
      approvals: [
        {
          task_id: 'task-1',
          workspace_id: 'ws-1',
          run_id: 'run-1',
          status: 'pending',
          reason_class: 'approval_required',
          evidence_ref: 'evidence://approval/task-1',
        },
      ],
      errors: [
        {
          code: 'missing-evidence',
          message: 'Workspace evidence gap',
          source: 'workspace',
        },
      ],
    },
    workspaces: [
      {
        id: 'ws-1',
        agent_id: 'worker-1',
        current_task_id: 'task-1',
        status: 'paused',
        branch_name: 'feat/sw-5-1a',
        evidence_ref: 'evidence://workspace/ws-1',
      },
    ],
    runs: [
      {
        run_id: 'run-1',
        workspace_id: 'ws-1',
        status: 'running',
        evidence_ref: 'evidence://run/run-1',
      },
    ],
    artifacts: [
      {
        artifact_id: 'artifact-1',
        run_id: 'run-1',
        kind: 'qa.result',
        seq: 3,
        evidence_ref: 'evidence://artifact/artifact-1',
      },
    ],
    diagnostics: {
      telegram: {
        status: 'healthy',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://telegram/status',
      },
      mcp: {
        status: 'stale',
        authority: 'inferred',
        freshness: 'stale',
        evidence_ref: 'evidence://mcp/status',
      },
    },
    liveHints: {
      queue: { active_agents: 9, authority: 'cached' },
      agents: [{ agent_id: 'worker-1', status: 'running', authority: 'cached' }],
    },
    ...overrides,
  };
}

module.exports = {
  buildControlRoomInput,
};
