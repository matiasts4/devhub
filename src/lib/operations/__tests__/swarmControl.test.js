const {
  composeControlRoomSnapshot,
  selectControlRoomHeader,
  selectControlRoomAgents,
  selectControlRoomWorkspaces,
  selectControlRoomRuns,
  selectControlRoomApprovals,
  selectControlRoomDiagnostics,
  selectControlRoomErrors,
} = require('../swarmControl');
const { buildControlRoomInput } = require('./fixtures/controlRoomSnapshot');

describe('composeControlRoomSnapshot', () => {
  test('prefers durable supervisor authority over live hints and exposes panel selectors', () => {
    const snapshot = composeControlRoomSnapshot(buildControlRoomInput());

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
          }
        ]
      },
      liveHints: {
        agents: [
          {
            agent_id: 'worker-1',
            status: 'idle',
            authority: 'cached',
          }
        ]
      }
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
});
