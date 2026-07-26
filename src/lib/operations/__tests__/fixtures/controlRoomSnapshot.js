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
          checkpoint_key: 'checkpoint-task-1',
          task_id: 'task-1',
          workspace_id: 'ws-1',
          run_id: 'run-1',
          status: 'pending',
          reason_class: 'approval_required',
          decision_note: null,
          decided_at: null,
          authority: 'authoritative',
          freshness: 'current',
          linked_supervisor_state: 'awaiting_approval',
          linked_supervisor_outcome: 'wait',
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
          channel: 'webchat',
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
            runtime_surface: 'webchat',
            presence_state: 'offline',
            effective_state: 'offline',
            last_seen_at: '2026-05-19T11:01:00.000Z',
            expires_at: '2026-05-19T11:03:00.000Z',
            evidence_ref: 'evidence://presence/presence-3',
          },
        ],
      },
    },
    evidence_timeline: buildEvidenceTimelineInput(),
    ...overrides,
  };
}

function buildEvidenceTimelineInput() {
  return [
    {
      item_id: 'artifact-1',
      kind: 'artifact',
      occurred_at: '2026-05-19T11:01:40.000Z',
      authority: 'authoritative',
      freshness: 'current',
      summary: 'QA artifact captured',
      linked_ids: {
        mission_id: 'mission-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        artifact_id: 'artifact-1',
      },
      evidence_ref: 'evidence://artifact/artifact-1',
      secondary_session_evidence: [
        {
          source: 'agent_trace',
          observed_at: '2026-05-19T11:01:42.000Z',
          summary: 'Terminal showed QA completion locally',
          authority: 'cached',
        },
      ],
    },
    {
      item_id: 'message-1',
      kind: 'mission_message',
      occurred_at: '2026-05-19T11:01:00.000Z',
      authority: 'authoritative',
      freshness: 'current',
      summary: 'Tomá la ejecución del workspace principal',
      linked_ids: {
        mission_id: 'mission-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
      },
      evidence_ref: 'evidence://mission-message/message-1',
    },
    {
      item_id: 'approval-task-1',
      kind: 'approval_checkpoint',
      occurred_at: '2026-05-19T11:01:40.000Z',
      authority: 'authoritative',
      freshness: 'current',
      summary: 'Approval required for task-1',
      linked_ids: {
        mission_id: 'mission-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        approval_checkpoint_key: 'task-1:run-1',
      },
      evidence_ref: 'evidence://approval/task-1',
    },
    {
      item_id: 'session-trace-1',
      kind: 'session_trace',
      occurred_at: '2026-05-19T11:02:10.000Z',
      authority: 'cached',
      freshness: 'current',
      summary: 'Unlinked session trace should stay secondary only',
      linked_ids: {},
      evidence_ref: 'session://trace/1',
    },
  ];
}

module.exports = {
  buildEvidenceTimelineInput,
  buildControlRoomInput,
};
