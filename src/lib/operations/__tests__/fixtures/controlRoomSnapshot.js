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
    agent_profiles: [],
    agent_teams: [],
    team_members: [],
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
    mission_control: {
      mission: {
        mission_id: 'mission-1',
        project_id: 'project-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        status: 'active',
        title: 'Misión Director',
        summary: 'Coordinar la ejecución y QA',
        evidence_ref: 'evidence://mission/mission-1',
      },
      participants: [
        {
          participant_id: 'participant-1',
          agent_id: 'agent-director',
          role_in_mission: 'director',
          status: 'active',
          joined_at: '2026-05-19T11:00:00.000Z',
        },
        {
          participant_id: 'participant-2',
          agent_id: 'agent-worker-1',
          role_in_mission: 'executor',
          status: 'active',
          joined_at: '2026-05-19T11:00:05.000Z',
        },
      ],
      latest_message: {
        message_id: 'message-1',
        sender_agent_id: 'agent-director',
        message_kind: 'handoff',
        body_summary: 'Tomá la ejecución del workspace principal',
        created_at: '2026-05-19T11:01:00.000Z',
        evidence_ref: 'evidence://mission-message/message-1',
      },
      pending_deliveries: [
        {
          delivery_id: 'delivery-1',
          recipient_agent_id: 'agent-worker-1',
          channel: 'telegram',
          status: 'retry_pending',
          last_error: 'adapter timeout',
          last_attempt_at: '2026-05-19T11:01:30.000Z',
          evidence_ref: 'evidence://delivery/delivery-1',
        },
      ],
      presence: {
        active: [
          {
            presence_id: 'presence-1',
            agent_id: 'agent-director',
            runtime_surface: 'agenthub',
            presence_state: 'online',
            effective_state: 'online',
            last_seen_at: '2026-05-19T11:01:40.000Z',
            expires_at: '2026-05-19T11:03:40.000Z',
            evidence_ref: 'evidence://presence/presence-1',
          },
        ],
        stale: [
          {
            presence_id: 'presence-2',
            agent_id: 'agent-worker-1',
            runtime_surface: 'agenthub',
            presence_state: 'busy',
            effective_state: 'stale',
            last_seen_at: '2026-05-19T10:58:00.000Z',
            expires_at: '2026-05-19T11:00:00.000Z',
            evidence_ref: 'evidence://presence/presence-2',
          },
        ],
        offline: [
          {
            presence_id: 'presence-3',
            agent_id: 'agent-reviewer-1',
            runtime_surface: 'telegram',
            presence_state: 'offline',
            effective_state: 'offline',
            last_seen_at: '2026-05-19T11:01:00.000Z',
            expires_at: '2026-05-19T11:03:00.000Z',
            evidence_ref: 'evidence://presence/presence-3',
          },
        ],
      },
    },
    ...overrides,
  };
}

module.exports = {
  buildControlRoomInput,
};
