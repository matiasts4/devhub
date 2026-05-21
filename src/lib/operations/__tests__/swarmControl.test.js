const {
  composeControlRoomSnapshot,
  extractMissionControlPayload,
  persistMissionControlComposerMessage,
  selectDirectorBriefingPreview,
  selectDirectorMissionSummary,
  selectDirectorQueue,
  selectControlRoomHeader,
  selectControlRoomAgents,
  selectControlRoomWorkspaces,
  selectControlRoomRuns,
  selectControlRoomApprovals,
  selectControlRoomMission,
  selectControlRoomAgentProfiles,
  selectControlRoomAgentTeams,
  selectControlRoomTeamMembers,
  selectControlRoomDiagnostics,
  selectControlRoomEvidenceTimeline,
  selectControlRoomErrors,
} = require('../swarmControl');
const {
  buildControlRoomInput,
  buildEvidenceTimelineInput,
} = require('./fixtures/controlRoomSnapshot');

function buildMissionControl(overrides = {}) {
  const baseInput = buildControlRoomInput();

  return selectControlRoomMission(
    composeControlRoomSnapshot(
      buildControlRoomInput({
        mission_control: {
          ...baseInput.mission_control,
          recent_messages: [baseInput.mission_control.latest_message],
          snapshot_at: '2026-05-19T11:01:40.000Z',
          watermark: 'mission-watermark-1',
          ...overrides,
        },
      })
    )
  );
}

describe('composeControlRoomSnapshot', () => {
  test('prefers durable supervisor authority over live hints and exposes panel selectors', () => {
    const baseInput = buildControlRoomInput();
    const snapshot = composeControlRoomSnapshot({
      ...baseInput,
      mission_control: {
        ...baseInput.mission_control,
        recent_messages: [baseInput.mission_control.latest_message],
        snapshot_at: '2026-05-19T11:01:40.000Z',
        watermark: 'mission-watermark-1',
      },
    });

    expect(selectControlRoomHeader(snapshot)).toMatchObject({
      workspace_label: 'DevHub',
      supervisor_state: 'lease_active',
      active: 1,
      max: 5,
      queue_depth: 2,
      authority: 'authoritative',
      freshness: 'current',
    });
    expect(selectControlRoomHeader(snapshot).evidence_refs).toEqual(
      expect.arrayContaining([
        'evidence://supervisor/header',
        'evidence://workspace/ws-1',
        'evidence://run/run-1',
      ])
    );

    expect(selectControlRoomAgents(snapshot)).toEqual([
      expect.objectContaining({
        agent_id: 'worker-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        supervisor_state: 'awaiting_approval',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://supervisor/task-1',
        live_hint: expect.objectContaining({ status: 'running', authority: 'cached' }),
      }),
    ]);

    expect(selectControlRoomWorkspaces(snapshot)).toEqual([
      expect.objectContaining({
        workspace_id: 'ws-1',
        agent_id: 'worker-1',
        task_id: 'task-1',
        status: 'paused',
        branch_name: 'feat/sw-5-1a',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://workspace/ws-1',
      }),
    ]);

    expect(selectControlRoomRuns(snapshot)).toEqual([
      expect.objectContaining({
        run_id: 'run-1',
        workspace_id: 'ws-1',
        status: 'running',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://run/run-1',
        latest_artifact: expect.objectContaining({
          artifact_id: 'artifact-1',
          evidence_ref: 'evidence://artifact/artifact-1',
        }),
      }),
    ]);

    expect(selectControlRoomApprovals(snapshot)).toEqual([
      expect.objectContaining({
        task_id: 'task-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        status: 'pending',
        reason_class: 'approval_required',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://approval/task-1',
      }),
    ]);

    expect(selectControlRoomMission(snapshot)).toEqual(
      expect.objectContaining({
        mission: expect.objectContaining({
          mission_id: 'mission-1',
          title: 'Misión Director',
          status: 'active',
          summary: 'Coordinar la ejecución y QA',
        }),
        participants: [
          expect.objectContaining({ agent_id: 'agent-director', role_in_mission: 'director' }),
          expect.objectContaining({ agent_id: 'agent-worker-1', role_in_mission: 'executor' }),
        ],
        recent_messages: [
          expect.objectContaining({
            message_id: 'message-1',
            body_summary: 'Tomá la ejecución del workspace principal',
          }),
        ],
        pending_deliveries: [
          expect.objectContaining({
            recipient_agent_id: 'agent-worker-1',
            status: 'retry_pending',
            channel: 'telegram',
          }),
        ],
        snapshot_at: '2026-05-19T11:01:40.000Z',
        watermark: 'mission-watermark-1',
        latest_message: expect.objectContaining({
          message_id: 'message-1',
          body_summary: 'Tomá la ejecución del workspace principal',
        }),
        presence: {
          active: [expect.objectContaining({ agent_id: 'agent-director' })],
          stale: [expect.objectContaining({ agent_id: 'agent-worker-1' })],
          offline: [expect.objectContaining({ agent_id: 'agent-reviewer-1' })],
        },
      })
    );

    expect(selectControlRoomDiagnostics(snapshot)).toMatchObject({
      telegram: expect.objectContaining({
        status: 'healthy',
        authority: 'authoritative',
        freshness: 'current',
      }),
      mcp: expect.objectContaining({
        status: 'stale',
        authority: 'inferred',
        freshness: 'stale',
      }),
    });

    expect(selectControlRoomErrors(snapshot)).toEqual([
      expect.objectContaining({
        code: 'missing-evidence',
        source: 'workspace',
      }),
    ]);
  });

  test('maps stale, degraded, unavailable, and approval-pending states from the durable snapshot', () => {
    const snapshot = composeControlRoomSnapshot({
      project: { id: 'project-1', name: 'DevHub' },
      supervisor: {
        supervisor_state: 'awaiting_approval',
        active_agents: 3,
        max_agents: 5,
        queue_depth: 4,
        authority: 'authoritative',
        freshness: 'stale',
        evidence_ref: 'evidence://supervisor/stale-header',
        approvals: [
          {
            task_id: 'task-risky',
            workspace_id: 'ws-risky',
            run_id: 'run-risky',
            status: 'pending',
            reason_class: 'approval_required',
          },
        ],
      },
      workspaces: [
        {
          id: 'ws-risky',
          agent_id: 'worker-3',
          current_task_id: 'task-risky',
          status: 'paused',
          branch_name: 'feat/risky',
        },
      ],
      runs: [
        {
          run_id: 'run-risky',
          workspace_id: 'ws-risky',
          status: 'succeeded',
        },
      ],
      diagnostics: {
        mcp: {
          status: 'degraded',
          authority: 'authoritative',
          freshness: 'degraded',
        },
      },
    });

    expect(selectControlRoomHeader(snapshot)).toMatchObject({
      active: 3,
      max: 5,
      queue_depth: 4,
      freshness: 'stale',
    });

    expect(selectControlRoomRuns(snapshot)).toEqual([
      expect.objectContaining({
        run_id: 'run-risky',
        freshness: 'degraded',
        outcome_applied: false,
        approval_gate: expect.objectContaining({
          status: 'pending',
          reason_class: 'approval_required',
          evidence_ref: null,
          freshness: 'degraded',
        }),
      }),
    ]);

    expect(selectControlRoomApprovals(snapshot)).toEqual([
      expect.objectContaining({
        task_id: 'task-risky',
        status: 'pending',
        freshness: 'degraded',
        evidence_ref: null,
        missing_source: 'approval evidence',
      }),
    ]);

    expect(selectControlRoomDiagnostics(snapshot)).toMatchObject({
      telegram: expect.objectContaining({
        status: 'unavailable',
        authority: 'unavailable',
        freshness: 'unavailable',
        missing_source: 'telegram snapshot',
      }),
      mcp: expect.objectContaining({
        status: 'degraded',
        freshness: 'degraded',
      }),
    });
  });

  test('marks workspace rows degraded when durable records exist without evidence', () => {
    const snapshot = composeControlRoomSnapshot({
      workspaces: [
        {
          id: 'ws-no-evidence',
          agent_id: 'worker-2',
          current_task_id: 'task-2',
          status: 'active',
          branch_name: 'feat/no-evidence',
        },
      ],
    });

    expect(selectControlRoomWorkspaces(snapshot)).toEqual([
      expect.objectContaining({
        workspace_id: 'ws-no-evidence',
        authority: 'authoritative',
        freshness: 'degraded',
        evidence_ref: null,
      }),
    ]);
  });

  test('returns stable empty slices when selectors receive an incomplete snapshot', () => {
    const snapshot = composeControlRoomSnapshot();

    expect(selectControlRoomHeader(snapshot)).toMatchObject({
      workspace_label: 'Workspace Control Room',
      active: 0,
      max: 0,
      queue_depth: 0,
      authority: 'unavailable',
      freshness: 'unavailable',
      missing_source: 'supervisor snapshot',
    });
    expect(selectControlRoomAgents(snapshot)).toEqual([]);
    expect(selectControlRoomWorkspaces(snapshot)).toEqual([]);
    expect(selectControlRoomRuns(snapshot)).toEqual([]);
    expect(selectControlRoomApprovals(snapshot)).toEqual([]);
    expect(selectControlRoomAgentProfiles(snapshot)).toEqual([]);
    expect(selectControlRoomAgentTeams(snapshot)).toEqual([]);
    expect(selectControlRoomTeamMembers(snapshot)).toEqual([]);
    expect(selectControlRoomDiagnostics(snapshot)).toEqual({
      telegram: expect.objectContaining({
        status: 'unavailable',
        missing_source: 'telegram snapshot',
      }),
      mcp: expect.objectContaining({
        status: 'unavailable',
        missing_source: 'mcp snapshot',
      }),
      process: expect.objectContaining({
        status: 'unavailable',
        missing_source: 'process snapshot',
      }),
      session_stream: expect.objectContaining({
        status: 'unavailable',
        missing_source: 'session stream snapshot',
      }),
    });
    expect(selectControlRoomErrors(snapshot)).toEqual([]);
    expect(selectControlRoomMission(snapshot)).toEqual({
      mission: null,
      participants: [],
      recent_messages: [],
      latest_message: null,
      pending_deliveries: [],
      snapshot_at: null,
      watermark: null,
      presence: {
        active: [],
        stale: [],
        offline: [],
      },
    });
  });

  test('regression: SSE caches, agent_registry, and live hints cannot override durable snapshot truth', () => {
    const snapshot = composeControlRoomSnapshot({
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
            workspace_id: 'ws-1',
            run_id: 'run-1',
            supervisor_state: 'awaiting_approval',
            authority: 'authoritative',
            freshness: 'current',
            evidence_ref: 'evidence://supervisor/task-1',
          },
        ],
      },
      liveHints: {
        agents: [
          {
            agent_id: 'worker-1',
            status: 'idle',
            authority: 'cached',
          },
        ],
      },
    });

    const agent = selectControlRoomAgents(snapshot)[0];
    expect(agent.supervisor_state).toBe('awaiting_approval');
    expect(agent.authority).toBe('authoritative');
    expect(agent.freshness).toBe('current');
    expect(agent.evidence_ref).toBe('evidence://supervisor/task-1');
    expect(agent.live_hint).toMatchObject({
      status: 'idle',
      authority: 'cached',
    });
  });

  test('passes through optional coordination slices in normalized form without affecting existing control room data', () => {
    const snapshot = composeControlRoomSnapshot(
      buildControlRoomInput({
        agent_profiles: [
          {
            id: 'profile-1',
            agent_id: 'worker-1',
            key: 'director',
            label: 'Director',
            authority: 'authoritative',
            freshness: 'current',
            evidence_ref: 'evidence://agent-profile/profile-1',
          },
        ],
        agent_teams: [
          {
            id: 'team-1',
            key: 'core',
            label: 'Core Team',
            authority: 'authoritative',
            freshness: 'current',
            evidence_ref: 'evidence://agent-team/team-1',
          },
        ],
        team_members: [
          {
            id: 'member-1',
            team_id: 'team-1',
            agent_id: 'worker-1',
            agent_profile_id: 'profile-1',
            role: 'lead',
            authority: 'authoritative',
            freshness: 'current',
            evidence_ref: 'evidence://team-member/member-1',
          },
        ],
      })
    );

    expect(selectControlRoomHeader(snapshot)).toMatchObject({
      workspace_label: 'DevHub',
      authority: 'authoritative',
    });
    expect(selectControlRoomAgentProfiles(snapshot)).toEqual([
      expect.objectContaining({
        agent_profile_id: 'profile-1',
        agent_id: 'worker-1',
        key: 'director',
        label: 'Director',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://agent-profile/profile-1',
      }),
    ]);
    expect(selectControlRoomAgentTeams(snapshot)).toEqual([
      expect.objectContaining({
        team_id: 'team-1',
        key: 'core',
        label: 'Core Team',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://agent-team/team-1',
      }),
    ]);
    expect(selectControlRoomTeamMembers(snapshot)).toEqual([
      expect.objectContaining({
        team_member_id: 'member-1',
        team_id: 'team-1',
        agent_id: 'worker-1',
        agent_profile_id: 'profile-1',
        role: 'lead',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://team-member/member-1',
      }),
    ]);
  });

  test('extracts normalized mission control payload from local composer responses', () => {
    const missionControl = extractMissionControlPayload({
      control_room_snapshot_input: {
        mission_control: {
          mission: {
            mission_id: 'mission-2',
            title: 'Misión local',
            status: 'active',
          },
          participants: [
            {
              participant_id: 'participant-1',
              agent_id: 'agent-worker-1',
              role_in_mission: 'executor',
              status: 'active',
            },
          ],
          latest_message: {
            message_id: 'message-2',
            sender_agent_id: 'agent-director',
            message_kind: 'directive',
            body_summary: 'Revisá el snapshot local',
            created_at: '2026-05-19T12:00:00.000Z',
          },
          pending_deliveries: [
            {
              delivery_id: 'delivery-2',
              recipient_agent_id: 'agent-worker-1',
              channel: 'local_snapshot',
              status: 'pending',
            },
          ],
          snapshot_at: '2026-05-19T12:00:30.000Z',
          watermark: 'mission-watermark-2',
          presence: {
            active: [],
            stale: [],
            offline: [],
          },
        },
      },
    });

    expect(missionControl).toEqual(
      expect.objectContaining({
        mission: expect.objectContaining({
          mission_id: 'mission-2',
          title: 'Misión local',
        }),
        recent_messages: [
          expect.objectContaining({
            body_summary: 'Revisá el snapshot local',
            message_kind: 'directive',
          }),
        ],
        pending_deliveries: [
          expect.objectContaining({
            recipient_agent_id: 'agent-worker-1',
            channel: 'local_snapshot',
            status: 'pending',
          }),
        ],
        latest_message: expect.objectContaining({
          body_summary: 'Revisá el snapshot local',
          message_kind: 'directive',
        }),
        snapshot_at: '2026-05-19T12:00:30.000Z',
        watermark: 'mission-watermark-2',
      })
    );
  });

  test('keeps additive mission_control fields and preserves latest_message fallback for legacy payloads', () => {
    const missionControl = extractMissionControlPayload({
      control_room_snapshot_input: {
        mission_control: {
          mission: {
            mission_id: 'mission-legacy',
            title: 'Misión legacy',
            status: 'active',
          },
          latest_message: {
            message_id: 'message-legacy',
            sender_agent_id: 'agent-director',
            message_kind: 'directive',
            body_summary: 'Compat payload legacy',
            created_at: '2026-05-19T13:00:00.000Z',
          },
          pending_deliveries: [],
          snapshot_at: '2026-05-19T13:00:30.000Z',
          watermark: 'legacy-watermark',
          presence: {
            active: [],
            stale: [],
            offline: [],
          },
        },
      },
    });

    expect(missionControl).toEqual(
      expect.objectContaining({
        recent_messages: [
          expect.objectContaining({
            message_id: 'message-legacy',
            body_summary: 'Compat payload legacy',
          }),
        ],
        latest_message: expect.objectContaining({
          message_id: 'message-legacy',
          body_summary: 'Compat payload legacy',
        }),
        snapshot_at: '2026-05-19T13:00:30.000Z',
        watermark: 'legacy-watermark',
      })
    );
  });

  test('selectDirectorMissionSummary derives mission counts from existing mission_control slices', () => {
    const snapshot = composeControlRoomSnapshot(buildControlRoomInput());

    expect(selectDirectorMissionSummary(snapshot)).toEqual({
      title: 'Misión Director',
      status: 'active',
      participantCount: 2,
      pendingDeliveryCount: 1,
      latestMessageSummary: 'Tomá la ejecución del workspace principal',
      activePresenceCount: 1,
      stalePresenceCount: 1,
      offlinePresenceCount: 1,
      snapshotAt: null,
      watermark: null,
    });
  });

  test('selectDirectorMissionSummary preserves latest_message fallback when recent_messages came from legacy payloads', () => {
    const snapshot = composeControlRoomSnapshot(
      buildControlRoomInput({
        mission_control: {
          mission: {
            mission_id: 'mission-legacy',
            title: 'Misión legacy',
            status: 'active',
          },
          latest_message: {
            message_id: 'message-legacy',
            sender_agent_id: 'agent-director',
            message_kind: 'directive',
            body_summary: 'Compat payload legacy',
            created_at: '2026-05-19T13:00:00.000Z',
          },
          pending_deliveries: [],
          presence: {
            active: [],
            stale: [],
            offline: [],
          },
        },
      })
    );

    expect(selectDirectorMissionSummary(snapshot)).toMatchObject({
      title: 'Misión legacy',
      latestMessageSummary: 'Compat payload legacy',
    });
  });

  test('selectDirectorMissionSummary returns stable empty output when mission_control is missing', () => {
    const snapshot = composeControlRoomSnapshot({ mission_control: null });

    expect(selectDirectorMissionSummary(snapshot)).toEqual({
      title: null,
      status: 'unknown',
      participantCount: 0,
      pendingDeliveryCount: 0,
      latestMessageSummary: null,
      activePresenceCount: 0,
      stalePresenceCount: 0,
      offlinePresenceCount: 0,
      snapshotAt: null,
      watermark: null,
    });
  });

  test('normalizes director_queue order and blocked semantics from durable queue truth', () => {
    const snapshot = composeControlRoomSnapshot(
      buildControlRoomInput({
        director_queue: {
          authority: 'authoritative',
          freshness: 'current',
          items: [
            {
              id: 'task-blocked',
              title: 'Blocked first from durable queue',
              status: 'pending',
              blocked: true,
              priority: 'high',
              blocked_reason: 'dep-1',
              supervisor: {
                supervisor_state: 'awaiting_approval',
                reason_class: 'blocked_dependency',
              },
            },
            {
              id: 'task-ready',
              title: 'Ready second from durable queue',
              status: 'pending',
              priority: 'medium',
              blocked_reason: null,
              supervisor: {
                supervisor_state: 'dispatch_pending',
                reason_class: null,
              },
            },
          ],
        },
      })
    );

    expect(selectDirectorQueue(snapshot)).toEqual({
      authority: 'authoritative',
      freshness: 'current',
      items: [
        {
          id: 'task-blocked',
          title: 'Blocked first from durable queue',
          status: 'blocked',
          position: 1,
          priority: 'high',
          blocked_reason: 'dep-1',
          supervisor: {
            supervisor_state: 'awaiting_approval',
            reason_class: 'blocked_dependency',
          },
        },
        {
          id: 'task-ready',
          title: 'Ready second from durable queue',
          status: 'pending',
          position: 2,
          priority: 'medium',
          blocked_reason: null,
          supervisor: {
            supervisor_state: 'dispatch_pending',
            reason_class: null,
          },
        },
      ],
      handoff: {
        status: 'idle',
        recipient_agent_id: null,
        message: null,
        task: null,
        workspace: null,
        run: null,
        artifact: null,
        supervisor: null,
      },
    });
  });

  test('keeps durable empty director_queue state and degraded freshness without inventing handoff truth', () => {
    const snapshot = composeControlRoomSnapshot({
      director_queue: {
        authority: 'authoritative',
        freshness: 'degraded',
        items: [],
      },
    });

    expect(selectDirectorQueue(snapshot)).toEqual({
      authority: 'authoritative',
      freshness: 'degraded',
      items: [],
      handoff: {
        status: 'idle',
        recipient_agent_id: null,
        message: null,
        task: null,
        workspace: null,
        run: null,
        artifact: null,
        supervisor: null,
      },
    });
  });

  test('selectControlRoomEvidenceTimeline returns deterministic durable order with stable tie-breakers', () => {
    const input = buildEvidenceTimelineInput();
    const shuffled = [input[2], input[3], input[1], input[0]];
    const snapshot = composeControlRoomSnapshot({
      ...buildControlRoomInput(),
      evidence_timeline: shuffled,
    });

    expect(selectControlRoomEvidenceTimeline(snapshot)).toEqual([
      expect.objectContaining({
        item_id: 'approval-task-1',
        kind: 'approval_checkpoint',
        occurred_at: '2026-05-19T11:01:40.000Z',
      }),
      expect.objectContaining({
        item_id: 'artifact-1',
        kind: 'artifact',
        occurred_at: '2026-05-19T11:01:40.000Z',
      }),
      expect.objectContaining({
        item_id: 'message-1',
        kind: 'mission_message',
        occurred_at: '2026-05-19T11:01:00.000Z',
      }),
    ]);
  });

  test('selectControlRoomEvidenceTimeline returns stable empty state for missing or empty durable input', () => {
    expect(selectControlRoomEvidenceTimeline(composeControlRoomSnapshot())).toEqual([]);
    expect(
      selectControlRoomEvidenceTimeline(
        composeControlRoomSnapshot({
          ...buildControlRoomInput(),
          evidence_timeline: [],
        })
      )
    ).toEqual([]);
  });

  test('selectControlRoomEvidenceTimeline keeps durable truth primary and labels linked session evidence as secondary', () => {
    const snapshot = composeControlRoomSnapshot({
      ...buildControlRoomInput(),
      evidence_timeline: buildEvidenceTimelineInput(),
    });

    expect(selectControlRoomEvidenceTimeline(snapshot)).toEqual([
      expect.objectContaining({
        item_id: 'approval-task-1',
        kind: 'approval_checkpoint',
        secondary_session_evidence: [],
      }),
      expect.objectContaining({
        item_id: 'artifact-1',
        kind: 'artifact',
        authority: 'authoritative',
        evidence_ref: 'evidence://artifact/artifact-1',
        secondary_session_evidence: [
          {
            source: 'agent_trace',
            observed_at: '2026-05-19T11:01:42.000Z',
            summary: 'Terminal showed QA completion locally',
            authority: 'secondary',
            label: 'Secondary session evidence',
          },
        ],
      }),
      expect.objectContaining({
        item_id: 'message-1',
        kind: 'mission_message',
        secondary_session_evidence: [],
      }),
    ]);
  });

  test('selectControlRoomEvidenceTimeline keeps rows with missing linked evidence explicit instead of dropping them', () => {
    const snapshot = composeControlRoomSnapshot({
      ...buildControlRoomInput(),
      evidence_timeline: [
        {
          item_id: 'artifact-missing-link',
          kind: 'artifact',
          occurred_at: '2026-05-19T11:03:00.000Z',
          authority: 'authoritative',
          freshness: 'degraded',
          summary: 'Artifact durable sin row enlazada',
          linked_ids: {
            mission_id: 'mission-1',
            task_id: 'task-1',
            workspace_id: 'ws-1',
            run_id: 'run-1',
          },
          missing_source: 'artifact evidence',
        },
      ],
    });

    expect(selectControlRoomEvidenceTimeline(snapshot)).toEqual([
      expect.objectContaining({
        item_id: 'artifact-missing-link',
        kind: 'artifact',
        freshness: 'degraded',
        evidence_ref: null,
        missing_source: 'artifact evidence',
        linked_ids: expect.objectContaining({
          run_id: 'run-1',
          artifact_id: null,
        }),
      }),
    ]);
  });

  test('selectDirectorBriefingPreview returns deterministic preview text from mission_control only', () => {
    const missionControl = buildMissionControl({
      ignored_queue: {
        items: [{ title: 'NOPE' }],
      },
      approvals: [{ reason_class: 'approval_required' }],
    });

    const first = selectDirectorBriefingPreview(missionControl, ['agent-worker-1']);
    const second = selectDirectorBriefingPreview(missionControl, ['agent-worker-1']);

    expect(first).toEqual(second);
    expect(first).toEqual({
      state: 'ready',
      recipientIds: ['agent-worker-1'],
      lines: [
        'Mission: Misión Director',
        'Status: active',
        'Summary: Coordinar la ejecución y QA',
        'Recipients: agent-worker-1',
        'Latest message: Tomá la ejecución del workspace principal',
        'Pending deliveries: 1',
        'Presence: active 1 · stale 1 · offline 1',
        'Snapshot: 2026-05-19T11:01:40.000Z',
        'Watermark: mission-watermark-1',
      ],
      previewText: [
        'Mission: Misión Director',
        'Status: active',
        'Summary: Coordinar la ejecución y QA',
        'Recipients: agent-worker-1',
        'Latest message: Tomá la ejecución del workspace principal',
        'Pending deliveries: 1',
        'Presence: active 1 · stale 1 · offline 1',
        'Snapshot: 2026-05-19T11:01:40.000Z',
        'Watermark: mission-watermark-1',
      ].join('\n'),
    });
    expect(first.previewText).not.toContain('approval_required');
    expect(first.previewText).not.toContain('NOPE');
  });

  test('selectDirectorBriefingPreview canonicalizes selected recipients by participant order', () => {
    const missionControl = buildMissionControl({
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
          agent_id: 'agent-worker-2',
          role_in_mission: 'reviewer',
          status: 'active',
          joined_at: '2026-05-19T11:00:10.000Z',
        },
        {
          participant_id: 'participant-3',
          agent_id: 'agent-worker-1',
          role_in_mission: 'executor',
          status: 'active',
          joined_at: '2026-05-19T11:00:05.000Z',
        },
      ],
      pending_deliveries: [
        {
          delivery_id: 'delivery-1',
          recipient_agent_id: 'agent-worker-1',
          channel: 'telegram',
          status: 'retry_pending',
        },
        {
          delivery_id: 'delivery-2',
          recipient_agent_id: 'agent-worker-2',
          channel: 'local_snapshot',
          status: 'pending',
        },
      ],
    });

    expect(
      selectDirectorBriefingPreview(missionControl, [
        'agent-worker-1',
        'agent-worker-2',
        'agent-worker-1',
      ])
    ).toMatchObject({
      state: 'ready',
      recipientIds: ['agent-worker-2', 'agent-worker-1'],
      lines: expect.arrayContaining(['Recipients: agent-worker-2, agent-worker-1']),
    });
  });

  test('selectDirectorBriefingPreview degrades safely for missing, empty, and ineligible states', () => {
    expect(selectDirectorBriefingPreview(null, ['agent-worker-1'])).toEqual({
      state: 'empty',
      recipientIds: [],
      lines: [],
      previewText: '',
    });

    expect(selectDirectorBriefingPreview(buildMissionControl(), [])).toEqual({
      state: 'empty',
      recipientIds: [],
      lines: [],
      previewText: '',
    });

    expect(selectDirectorBriefingPreview(buildMissionControl(), ['agent-director'])).toEqual({
      state: 'unavailable',
      recipientIds: [],
      lines: [],
      previewText: '',
    });
  });

  test('posts local composer messages and returns normalized mission control state', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        control_room_snapshot_input: {
          mission_control: {
            mission: {
              mission_id: 'mission-2',
              title: 'Misión local',
              status: 'active',
            },
            participants: [
              {
                participant_id: 'participant-1',
                agent_id: 'agent-worker-1',
                role_in_mission: 'executor',
                status: 'active',
              },
            ],
            latest_message: {
              message_id: 'message-2',
              sender_agent_id: 'agent-director',
              message_kind: 'directive',
              body_summary: 'Revisá el snapshot local',
              created_at: '2026-05-19T12:00:00.000Z',
            },
            pending_deliveries: [
              {
                delivery_id: 'delivery-2',
                recipient_agent_id: 'agent-worker-1',
                channel: 'local_snapshot',
                status: 'pending',
              },
            ],
            presence: {
              active: [],
              stale: [],
              offline: [],
            },
          },
        },
      }),
    });

    const missionControl = await persistMissionControlComposerMessage({
      recipient_agent_ids: ['agent-worker-1'],
      body_summary: 'Revisá el snapshot local',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('/api/agenthub/operations/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_local_mission_message',
        recipient_agent_ids: ['agent-worker-1'],
        body_summary: 'Revisá el snapshot local',
      }),
    });
    expect(missionControl).toEqual(
      expect.objectContaining({
        recent_messages: [expect.objectContaining({ body_summary: 'Revisá el snapshot local' })],
        pending_deliveries: [expect.objectContaining({ status: 'pending' })],
      })
    );
  });
});
