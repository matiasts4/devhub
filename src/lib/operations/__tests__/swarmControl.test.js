const {
  composeControlRoomSnapshot,
  createSwarmLaunchDraft,
  deriveSwarmLaunchPreview,
  extractMissionControlPayload,
  persistMissionControlComposerMessage,
  selectSwarmControlPrimarySurface,
  selectSwarmLaunchCatalog,
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
  buildRoleAgentProfile,
  buildSwarmLaunchModels,
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

function buildIdleSnapshot(overrides = {}) {
  return composeControlRoomSnapshot(
    buildControlRoomInput({
      supervisor: {
        ...buildControlRoomInput().supervisor,
        supervisor_state: 'idle',
        active_agents: 0,
        queue_depth: 0,
        approvals: [],
        agents: [],
      },
      director_queue: {
        authority: 'authoritative',
        freshness: 'current',
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
      },
      mission_control: null,
      evidence_timeline: [],
      ...overrides,
    })
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
        checkpoint_key: 'checkpoint-task-1',
        task_id: 'task-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        status: 'pending',
        reason_class: 'approval_required',
        decision_note: null,
        decided_at: null,
        linked_supervisor_state: 'awaiting_approval',
        linked_supervisor_outcome: 'wait',
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

  test('normalizes enriched approval identity and gating fields from authoritative snapshot input', () => {
    const snapshot = composeControlRoomSnapshot({
      supervisor: {
        supervisor_state: 'awaiting_approval',
        approvals: [
          {
            checkpoint_key: 'checkpoint-88a',
            task_id: 'task-88a',
            workspace_id: 'ws-88a',
            run_id: 'run-88a',
            status: 'pending',
            reason_class: 'approval_required',
            decision_note: 'Director needs more evidence',
            decided_at: '2026-05-21T10:00:00.000Z',
            freshness: 'current',
            authority: 'authoritative',
            evidence_ref: 'evidence://approval/checkpoint-88a',
            linked_supervisor_state: 'awaiting_approval',
            linked_supervisor_outcome: 'wait',
          },
        ],
      },
    });

    expect(selectControlRoomApprovals(snapshot)).toEqual([
      {
        checkpoint_key: 'checkpoint-88a',
        task_id: 'task-88a',
        workspace_id: 'ws-88a',
        run_id: 'run-88a',
        status: 'pending',
        reason_class: 'approval_required',
        decision_note: 'Director needs more evidence',
        decided_at: '2026-05-21T10:00:00.000Z',
        linked_supervisor_state: 'awaiting_approval',
        linked_supervisor_outcome: 'wait',
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://approval/checkpoint-88a',
        evidence_refs: ['evidence://approval/checkpoint-88a'],
        missing_source: null,
      },
    ]);
  });

  test('normalizes checkpoint gate summaries from director queue items without inventing extra authority', () => {
    const snapshot = composeControlRoomSnapshot({
      director_queue: {
        authority: 'authoritative',
        freshness: 'current',
        items: [
          {
            id: 'task-gate-1',
            title: 'Cerrar checkpoint local',
            status: 'blocked',
            position: 1,
            priority: 'high',
            blocked_reason: 'missing-git-checkpoint',
            checkpoint_gate: {
              status: 'blocked',
              code: 'missing-git-checkpoint',
              message: 'Falta comentario [git:checkpoint] para este handoff.',
              remediation:
                'Agregá [git:checkpoint] con commit=<sha|none>, docs=[...], checks=[...] y worktree=<clean|dirty-excluded>.',
            },
          },
          {
            id: 'task-gate-2',
            title: 'Cerrar task con checkpoint',
            status: 'pending',
            position: 2,
            priority: 'medium',
            checkpoint_gate: {
              status: 'accepted',
              code: 'checkpoint-accepted',
              checkpoint: {
                commit: 'abc1234',
                worktree: 'clean',
              },
            },
          },
        ],
      },
    });

    expect(selectDirectorQueue(snapshot).items).toEqual([
      expect.objectContaining({
        id: 'task-gate-1',
        blocked_reason: 'missing-git-checkpoint',
        checkpoint_gate: expect.objectContaining({
          code: 'missing-git-checkpoint',
          status: 'blocked',
        }),
      }),
      expect.objectContaining({
        id: 'task-gate-2',
        checkpoint_gate: expect.objectContaining({
          code: 'checkpoint-accepted',
          checkpoint: expect.objectContaining({ commit: 'abc1234', worktree: 'clean' }),
        }),
      }),
    ]);
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
      runtime: expect.objectContaining({
        status: 'unavailable',
        missing_source: 'runtime diagnostics snapshot',
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

  test('selectSwarmControlPrimarySurface returns an active tower with durable CTA priority when the snapshot has a live swarm', () => {
    const snapshot = composeControlRoomSnapshot(buildControlRoomInput());

    expect(selectSwarmControlPrimarySurface(snapshot)).toEqual(
      expect.objectContaining({
        mode: 'active',
        hero: expect.objectContaining({
          title: 'Misión Director',
          status: 'active',
          authority: 'authoritative',
          freshness: 'current',
          primaryCta: {
            kind: 'anchor',
            target: 'director-queue',
            label: 'Continuar desde cola durable',
            disabled: false,
            reason: null,
          },
          stats: {
            activeAgents: 1,
            queueDepth: 2,
            pendingApprovals: 1,
            pendingDeliveries: 1,
          },
        }),
      })
    );
  });

  test('maps runtime quota-blocked anomaly into director roster status in active topology', () => {
    const snapshot = composeControlRoomSnapshot(
      buildControlRoomInput({
        supervisor: {
          ...buildControlRoomInput().supervisor,
          agents: [
            {
              agent_id: 'agent-director',
              task_id: 'task-director',
              workspace_id: 'ws-director',
              run_id: 'run-director',
              supervisor_state: 'active',
              evidence_ref: 'evidence://supervisor/director',
            },
            {
              agent_id: 'agent-worker-1',
              task_id: 'task-worker',
              workspace_id: 'ws-worker',
              run_id: 'run-worker',
              supervisor_state: 'active',
              evidence_ref: 'evidence://supervisor/worker',
            },
          ],
        },
        mission_control: {
          ...buildControlRoomInput().mission_control,
          participants: [
            {
              participant_id: 'participant-director',
              agent_id: 'agent-director',
              role_in_mission: 'director',
              status: 'active',
            },
            {
              participant_id: 'participant-worker',
              agent_id: 'agent-worker-1',
              role_in_mission: 'executor',
              status: 'active',
            },
          ],
        },
        diagnostics: {
          ...buildControlRoomInput().diagnostics,
          runtime: {
            status: 'degraded',
            authority: 'authoritative',
            freshness: 'current',
            metrics: {
              quota_blocked: true,
              orphaned_processes: 0,
              stale_registry_agents: 0,
            },
            evidence_ref: 'evidence://runtime/quota',
          },
        },
      })
    );

    const surface = selectSwarmControlPrimarySurface(snapshot);
    const director = surface.hero.roster.find((member) => member.isDirector);

    expect(surface.mode).toBe('active');
    expect(director.status).toBe('quota-blocked');
  });

  test('maps idle-vs-live mismatch to stale-registry status in active roster', () => {
    const snapshot = composeControlRoomSnapshot(
      buildControlRoomInput({
        supervisor: {
          ...buildControlRoomInput().supervisor,
          agents: [
            {
              agent_id: 'agent-director',
              task_id: 'task-director',
              workspace_id: 'ws-director',
              run_id: 'run-director',
              supervisor_state: 'active',
              evidence_ref: 'evidence://supervisor/director',
            },
            {
              agent_id: 'agent-worker-1',
              task_id: 'task-worker',
              workspace_id: 'ws-worker',
              run_id: 'run-worker',
              supervisor_state: 'idle',
              evidence_ref: 'evidence://supervisor/worker',
            },
          ],
        },
        liveHints: {
          agents: [{ agent_id: 'agent-worker-1', status: 'running', authority: 'cached' }],
        },
        mission_control: {
          ...buildControlRoomInput().mission_control,
          participants: [
            {
              participant_id: 'participant-director',
              agent_id: 'agent-director',
              role_in_mission: 'director',
              status: 'active',
            },
            {
              participant_id: 'participant-worker',
              agent_id: 'agent-worker-1',
              role_in_mission: 'executor',
              status: 'active',
            },
          ],
        },
      })
    );

    const surface = selectSwarmControlPrimarySurface(snapshot);
    const worker = surface.hero.roster.find((member) => member.id === 'agent-worker-1');

    expect(surface.mode).toBe('active');
    expect(worker.status).toBe('stale-registry');
  });

  test('selectSwarmControlPrimarySurface flips launch payload input into active mode when launch returns top-level durable slices', () => {
    const snapshot = composeControlRoomSnapshot({
      project: { id: 'project-1', name: 'DevHub' },
      supervisor: {
        supervisor_state: 'lease_active',
        active_agents: 3,
        max_agents: 3,
        queue_depth: 0,
        authority: 'authoritative',
        freshness: 'current',
        evidence_ref: 'evidence://presence/director',
        agents: [
          {
            agent_id: 'launch-director',
            task_id: 'launch:director',
            workspace_id: 'ws-director',
            run_id: 'run-director',
            supervisor_state: 'lease_active',
            evidence_ref: 'evidence://presence/director',
          },
        ],
        approvals: [],
      },
      mission_control: {
        mission: {
          mission_id: 'launch-1',
          status: 'active',
          title: 'Lanzar Arranque limpio guiado',
        },
        participants: [
          {
            participant_id: 'p1',
            agent_id: 'launch-director',
            role_in_mission: 'director',
            status: 'active',
          },
          {
            participant_id: 'p2',
            agent_id: 'launch-analyst',
            role_in_mission: 'executor',
            status: 'active',
          },
        ],
        latest_message: {
          message_id: 'message-1',
          body_summary: 'Definir topología inicial y dejar listo el primer launch snapshot-first.',
          created_at: '2026-05-21T10:00:00.000Z',
        },
        pending_deliveries: [],
        presence: {
          active: [
            {
              presence_id: 'presence-1',
              agent_id: 'launch-analyst',
              effective_state: 'online',
              last_seen_at: '2026-05-21T10:00:00.000Z',
              evidence_ref: 'evidence://presence/analyst',
            },
          ],
          stale: [],
          offline: [],
        },
      },
      workspaces: [
        {
          id: 'ws-director',
          agent_id: 'launch-director',
          current_task_id: 'launch:director',
          status: 'ready',
          branch_name: 'swarm/launch-1/director',
          evidence_ref: 'evidence://workspace/ws-director',
        },
      ],
      runs: [
        {
          run_id: 'run-director',
          workspace_id: 'ws-director',
          task_id: 'launch:director',
          status: 'running',
          evidence_ref: 'evidence://run/run-director',
        },
      ],
      artifacts: [],
      evidence_timeline: [],
      director_queue: {
        authority: 'authoritative',
        freshness: 'current',
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
      },
    });

    expect(selectSwarmControlPrimarySurface(snapshot)).toEqual(
      expect.objectContaining({
        mode: 'active',
        hero: expect.objectContaining({
          title: 'Lanzar Arranque limpio guiado',
          status: 'active',
          stats: expect.objectContaining({ activeAgents: 3 }),
        }),
      })
    );
  });

  test('exposes degraded launch identity health when agent/run/workspace linkage is inconsistent', () => {
    const snapshot = composeControlRoomSnapshot(
      buildControlRoomInput({
        supervisor: {
          ...buildControlRoomInput().supervisor,
          agents: [
            {
              agent_id: 'agent-director',
              task_id: 'task-director',
              workspace_id: 'ws-missing',
              run_id: 'run-missing',
              supervisor_state: 'active',
              evidence_ref: 'evidence://supervisor/director',
            },
          ],
        },
        diagnostics: {
          ...buildControlRoomInput().diagnostics,
          runtime: {
            status: 'degraded',
            authority: 'authoritative',
            freshness: 'current',
            metrics: {
              orphaned_processes: 1,
            },
            evidence_ref: 'evidence://runtime/orphan',
          },
        },
        mission_control: {
          ...buildControlRoomInput().mission_control,
          participants: [
            {
              participant_id: 'participant-director',
              agent_id: 'agent-director',
              role_in_mission: 'director',
              status: 'active',
            },
          ],
        },
      })
    );

    const surface = selectSwarmControlPrimarySurface(snapshot);

    expect(surface.mode).toBe('active');
    expect(surface.hero.identityHealth).toEqual(
      expect.objectContaining({
        status: 'degraded',
        issueCount: expect.any(Number),
      })
    );
    expect(surface.hero.identityHealth.issues[0]).toContain('agent agent-director');
  });

  test('selectSwarmControlPrimarySurface exposes a disabled CTA reason when an active swarm has no durable next focus', () => {
    const snapshot = composeControlRoomSnapshot(
      buildControlRoomInput({
        supervisor: {
          ...buildControlRoomInput().supervisor,
          active_agents: 1,
          queue_depth: 0,
          approvals: [],
          agents: [],
        },
        director_queue: {
          authority: 'authoritative',
          freshness: 'current',
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
        },
        mission_control: null,
      })
    );

    expect(selectSwarmControlPrimarySurface(snapshot)).toEqual(
      expect.objectContaining({
        mode: 'active',
        hero: expect.objectContaining({
          primaryCta: expect.objectContaining({
            disabled: true,
            reason: 'No hay foco durable inmediato en este snapshot.',
          }),
        }),
      })
    );
  });

  test('selectSwarmControlPrimarySurface returns an idle launchpad when no active swarm exists', () => {
    const snapshot = buildIdleSnapshot();

    expect(selectSwarmControlPrimarySurface(snapshot)).toEqual(
      expect.objectContaining({
        mode: 'idle',
        hero: expect.objectContaining({
          title: 'Lanzá un swarm nuevo',
          status: 'idle',
          primaryCta: {
            kind: 'anchor',
            target: 'launchpad-templates',
            label: 'Elegir plantilla recomendada',
            disabled: false,
            reason: null,
          },
          stats: {
            activeAgents: 0,
            queueDepth: 0,
            pendingApprovals: 0,
            pendingDeliveries: 0,
          },
        }),
      })
    );
  });

  test('selectSwarmLaunchCatalog recommends approvals-first recovery before clean-start templates', () => {
    const snapshot = composeControlRoomSnapshot(buildControlRoomInput());
    const catalog = selectSwarmLaunchCatalog(snapshot);

    expect(catalog).toEqual(
      expect.objectContaining({
        authority: 'local-catalog',
        recommended_template_id: 'approval-recovery',
      })
    );
    expect(catalog.templates[0]).toEqual(
      expect.objectContaining({
        id: 'approval-recovery',
        readiness: 'ready-now',
      })
    );
    expect(catalog.templates[1]).toEqual(
      expect.objectContaining({
        id: 'queue-restart',
      })
    );
  });

  test('selectSwarmLaunchCatalog falls back to a clean-start recommendation when the control room is idle', () => {
    const catalog = selectSwarmLaunchCatalog(buildIdleSnapshot());

    expect(catalog.recommended_template_id).toBe('clean-slate');
    expect(catalog.templates[0]).toEqual(
      expect.objectContaining({
        id: 'clean-slate',
        readiness: 'ready-now',
      })
    );
    expect(catalog.swarm_types).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'delivery-swarm',
          defaults_preview: expect.arrayContaining(['handoff-first', 'checkpoint-safe']),
        }),
      ])
    );
  });

  test('createSwarmLaunchDraft seeds launch defaults from the recommended template and project path', () => {
    const catalog = selectSwarmLaunchCatalog(buildIdleSnapshot());

    expect(
      createSwarmLaunchDraft({
        catalog,
        project: { id: 'project-1', local_path: '/home/matias/ArxonLabs/devhub' },
      })
    ).toEqual({
      mode: 'template',
      category: 'delivery',
      templateId: 'clean-slate',
      swarmTypeId: 'delivery-swarm',
      teamId: 'feature-delivery-team',
      providerId: 'github-copilot/gpt-5.4-mini',
      workspacePath: '/home/matias/ArxonLabs/devhub',
      rolePrograms: {
        director: 'opencode',
        coder: 'opencode',
        auditor: 'opencode',
        devops: 'opencode',
        architect: 'opencode',
      },
      roleModels: {
        director: 'opencode-go/deepseek-v4-flash',
        coder: 'opencode-go/deepseek-v4-flash',
        auditor: 'opencode-go/deepseek-v4-flash',
        devops: 'opencode-go/deepseek-v4-flash',
        architect: 'opencode-go/deepseek-v4-flash',
      },
      mission:
        'Lanzar un swarm de feature delivery con Director, Coder, Auditor, DevOps y Architect; validar que cada terminal abra en el workspace correcto y dejar evidencia de handoff.',
    });
  });

  test('selectSwarmLaunchCatalog exposes supported launch clients from existing runtime options', () => {
    const catalog = selectSwarmLaunchCatalog(buildIdleSnapshot());

    expect(catalog.programs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'opencode', label: 'OpenCode' }),
        expect.objectContaining({ id: 'codex', label: 'Codex' }),
        expect.objectContaining({ id: 'hermes', label: 'Hermes' }),
      ])
    );
  });

  test('deriveSwarmLaunchPreview returns summary lines and topology for the current draft', () => {
    const catalog = selectSwarmLaunchCatalog(buildIdleSnapshot());
    const preview = deriveSwarmLaunchPreview({
      catalog,
      draft: {
        mode: 'custom',
        category: 'recovery',
        templateId: 'approval-recovery',
        swarmTypeId: 'recovery-swarm',
        teamId: 'amber-recovery-cell',
        providerId: 'claude-opus-4-20250514',
        workspacePath: '/tmp/devhub-recovery',
        rolePrograms: {
          director: 'codex',
          recovery_ops: 'opencode',
          evidence: 'opencode',
          qa: 'hermes',
        },
        mission: 'Recuperar approvals y normalizar workspaces antes del próximo handoff.',
      },
    });

    expect(preview).toEqual(
      expect.objectContaining({
        modeLabel: 'Custom team',
        launchLabel: 'Lanzar Recovery swarm',
        isReady: true,
        topology: expect.objectContaining({
          label: 'Director → Recovery Ops → Evidence → QA',
          roles: expect.arrayContaining(['Director', 'Recovery Ops', 'Evidence', 'QA']),
        }),
        summaryLines: expect.arrayContaining([
          'Custom team · Recovery',
          'Resolver aprobaciones y destrabar · Recovery swarm',
          'Amber Recovery Cell · Claude Opus 4',
          '/tmp/devhub-recovery',
          'Recuperar approvals y normalizar workspaces antes del próximo handoff.',
        ]),
        rolePrograms: [
          expect.objectContaining({
            role: 'Director',
            program_id: 'codex',
            program_label: 'Codex',
          }),
          expect.objectContaining({
            role: 'Recovery Ops',
            program_id: 'opencode',
            program_label: 'OpenCode',
          }),
          expect.objectContaining({
            role: 'Evidence',
            program_id: 'opencode',
            program_label: 'OpenCode',
          }),
          expect.objectContaining({ role: 'QA', program_id: 'hermes', program_label: 'Hermes' }),
        ],
      })
    );
  });
});

describe('buildRoleAgentProfile', () => {
  test('maps director to swarm-director', () => {
    expect(buildRoleAgentProfile('director')).toBe('swarm-director');
  });

  test('maps coder and builder to swarm-coder', () => {
    expect(buildRoleAgentProfile('coder')).toBe('swarm-coder');
    expect(buildRoleAgentProfile('builder')).toBe('swarm-coder');
    expect(buildRoleAgentProfile('devops')).toBe('swarm-coder');
    expect(buildRoleAgentProfile('recovery_ops')).toBe('swarm-coder');
  });

  test('maps qa to swarm-qa', () => {
    expect(buildRoleAgentProfile('qa')).toBe('swarm-qa');
  });

  test('maps auditor and reviewer to swarm-reviewer', () => {
    expect(buildRoleAgentProfile('auditor')).toBe('swarm-reviewer');
    expect(buildRoleAgentProfile('reviewer')).toBe('swarm-reviewer');
  });

  test('maps explorer roles to swarm-explorer', () => {
    expect(buildRoleAgentProfile('architect')).toBe('swarm-explorer');
    expect(buildRoleAgentProfile('scout')).toBe('swarm-explorer');
    expect(buildRoleAgentProfile('analyst')).toBe('swarm-explorer');
    expect(buildRoleAgentProfile('evidence')).toBe('swarm-explorer');
  });

  test('falls back to swarm-coder for unknown roles', () => {
    expect(buildRoleAgentProfile('unknown_role')).toBe('swarm-coder');
    expect(buildRoleAgentProfile('')).toBe('swarm-coder');
    expect(buildRoleAgentProfile(null)).toBe('swarm-coder');
  });
});

describe('buildSwarmLaunchModels', () => {
  test('returns model catalog with expected models', () => {
    const models = buildSwarmLaunchModels();
    expect(models).toHaveLength(4);
    expect(models.map((m) => m.id)).toContain('opencode-go/deepseek-v4-flash');
    expect(models.map((m) => m.id)).toContain('opencode-go/qwen3.6-plus');
    expect(models.map((m) => m.id)).toContain('opencode-go/qwen3.5-plus');
    expect(models.map((m) => m.id)).toContain('opencode/claude-sonnet-4.6');
  });

  test('each model has id, label, summary, and recommended_for', () => {
    const models = buildSwarmLaunchModels();
    models.forEach((model) => {
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('label');
      expect(model).toHaveProperty('summary');
      expect(model).toHaveProperty('recommended_for');
      expect(Array.isArray(model.recommended_for)).toBe(true);
    });
  });

  test('catalog includes models', () => {
    const catalog = selectSwarmLaunchCatalog({});
    expect(catalog.models).toBeDefined();
    expect(catalog.models).toHaveLength(4);
  });
});
