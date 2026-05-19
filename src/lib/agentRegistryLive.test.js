const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAgentDisplayMeta,
  getAgentExecutionContext,
  getAgentLaunchMetadata,
  getAgentRegistryLiveSnapshot,
  resolveAgentToPanelId,
} = require('./agentRegistryLive.js');

const FRESH_HEARTBEAT = new Date().toISOString();
const STALE_HEARTBEAT = new Date(Date.now() - 120000).toISOString(); // 2 min ago

test('counts agents with active statuses as live', () => {
  const snapshot = getAgentRegistryLiveSnapshot({
    agents: [
      { agent_id: 'a', status: 'working', last_heartbeat: FRESH_HEARTBEAT },
      { agent_id: 'b', status: 'idle', last_heartbeat: STALE_HEARTBEAT },
    ],
  });

  assert.equal(snapshot.activeAgentsCount, 1);
  assert.deepEqual(
    snapshot.activeAgents.map((a) => a.agent_id),
    ['a']
  );
});

test('includes agents with live terminal sessions even if idle', () => {
  const snapshot = getAgentRegistryLiveSnapshot({
    agents: [{ agent_id: 'a', status: 'idle', last_heartbeat: STALE_HEARTBEAT }],
    liveSessions: { panel1: { alive: true } },
    agentRuns: { a: { panelId: 'panel1' } },
  });

  assert.equal(snapshot.activeAgentsCount, 1);
});

test('prefers workspace_id when resolving launch metadata from observer-only runs', () => {
  const launch = getAgentLaunchMetadata(
    {
      agent_id: 'agent-1',
      current_task_id: 'task-1',
      workspace_id: 'ws-1',
    },
    {
      'ws-1': { panelId: 'panel-ws', selectedAgent: 'worker-alpha', reportedStatus: 'paused' },
      'task-1': { panelId: 'panel-task', selectedAgent: 'worker-beta', reportedStatus: 'active' },
    }
  );

  assert.equal(launch.panelId, 'panel-ws');
  assert.equal(launch.selectedAgent, 'worker-alpha');
  assert.equal('reportedStatus' in launch, false);
});

test('resolveAgentToPanelId uses workspace_id before task mirrors', () => {
  const panelId = resolveAgentToPanelId(
    {
      agent_id: 'agent-2',
      current_task_id: 'task-2',
      workspace_id: 'ws-2',
    },
    {
      'ws-2': { panelId: 'panel-2' },
      'task-2': { panelId: 'panel-task-2' },
    }
  );

  assert.equal(panelId, 'panel-2');
});

test('drops executor-reported status from observer-only launch metadata', () => {
  const launch = getAgentLaunchMetadata(
    {
      agent_id: 'agent-3',
      current_task_id: 'task-3',
      workspace_id: 'ws-3',
    },
    {
      'ws-3': {
        panelId: 'panel-3',
        selectedAgent: 'worker-gamma',
        workspaceStatus: 'conflicted',
        evidenceRef: 'evidence://workspace-3',
        reportedStatus: 'active',
      },
    }
  );

  assert.equal(launch.workspaceStatus, 'conflicted');
  assert.equal(launch.evidenceRef, 'evidence://workspace-3');
  assert.equal('reportedStatus' in launch, false);
});

test('exposes durable run projections without promoting observer status to truth', () => {
  const launch = getAgentLaunchMetadata(
    {
      agent_id: 'agent-5',
      current_task_id: 'task-5',
      workspace_id: 'ws-5',
    },
    {
      'ws-5': {
        panelId: 'panel-5',
        selectedAgent: 'worker-delta',
        run_status: 'failed',
        terminal_reason_class: 'qa_blocked',
        latest_artifact_evidence_ref: 'artifact://run-5/qa/2',
        latest_artifact_summary: 'QA blocked after retries',
        artifact_count: 2,
        reportedStatus: 'active',
      },
    }
  );

  assert.equal(launch.runStatus, 'failed');
  assert.equal(launch.terminalReasonClass, 'qa_blocked');
  assert.equal(launch.latestArtifactEvidenceRef, 'artifact://run-5/qa/2');
  assert.equal(launch.latestArtifactSummary, 'QA blocked after retries');
  assert.equal(launch.artifactCount, 2);
  assert.equal('reportedStatus' in launch, false);
});

test('uses durable artifact summary for display metadata when no prompt summary exists', () => {
  const display = getAgentDisplayMeta(
    {
      agent_id: 'agent-6',
      workspace_id: 'ws-6',
    },
    {
      agentRuns: {
        'ws-6': {
          selectedAgent: 'worker-epsilon',
          latest_artifact_summary: 'Workspace drift detected',
        },
      },
    }
  );

  assert.equal(display.label, 'WORKER / Ejecución');
  assert.equal(display.summary, 'Workspace drift detected');
});

test('does not treat executor-reported status as durable liveness truth', () => {
  const snapshot = getAgentRegistryLiveSnapshot({
    agents: [
      {
        agent_id: 'agent-4',
        status: 'idle',
        last_heartbeat: STALE_HEARTBEAT,
        workspace_id: 'ws-4',
      },
    ],
    agentRuns: {
      'ws-4': { reportedStatus: 'active' },
    },
  });

  assert.equal(snapshot.activeAgentsCount, 0);
});

test('does not keep terminal durable runs live just because the panel is still open', () => {
  const snapshot = getAgentRegistryLiveSnapshot({
    agents: [
      {
        agent_id: 'agent-7',
        status: 'idle',
        last_heartbeat: STALE_HEARTBEAT,
        workspace_id: 'ws-7',
      },
    ],
    liveSessions: { panel7: { alive: true } },
    agentRuns: {
      'ws-7': { panelId: 'panel7', run_status: 'succeeded' },
    },
  });

  assert.equal(snapshot.activeAgentsCount, 0);
});

test('prefers durable run completion over stale registry execution context', () => {
  const context = getAgentExecutionContext(
    {
      agent_id: 'agent-8',
      status: 'working',
      last_heartbeat: STALE_HEARTBEAT,
      workspace_id: 'ws-8',
    },
    {
      agentRuns: {
        'ws-8': { run_status: 'succeeded' },
      },
    }
  );

  assert.equal(context.label, 'COMPLETADO');
});

test('maps blocked durable run projections to blocked execution context', () => {
  const context = getAgentExecutionContext(
    {
      agent_id: 'agent-9',
      status: 'working',
      last_heartbeat: FRESH_HEARTBEAT,
      workspace_id: 'ws-9',
    },
    {
      agentRuns: {
        'ws-9': { run_status: 'failed', terminal_reason_class: 'qa_blocked' },
      },
    }
  );

  assert.equal(context.label, 'BLOQUEADO');
});

test('projects normalized supervisor snapshots from MCP-style observer runs', () => {
  const launch = getAgentLaunchMetadata(
    {
      agent_id: 'agent-10',
      current_task_id: 'task-10',
      workspace_id: 'ws-10',
    },
    {
      'ws-10': {
        supervisor_snapshot: {
          supervisor_state: 'awaiting_approval',
          outcome: 'request_approval',
          reason_class: 'approval_required',
          task_retry_count: 1,
          attempt_count: 2,
          unchanged_failure_count: 0,
          approval_request_count: 3,
          orphan_recovery_count: 0,
          evidence_ref: 'evidence://supervisor/task-10',
          updated_at: '2026-05-19T06:40:00.000Z',
        },
      },
    }
  );

  assert.deepEqual(launch.supervisor, {
    supervisor_state: 'awaiting_approval',
    outcome: 'request_approval',
    reason_class: 'approval_required',
    task_retry_count: 1,
    attempt_count: 2,
    unchanged_failure_count: 0,
    approval_request_count: 3,
    orphan_recovery_count: 0,
    workspace_id: null,
    run_id: null,
    evidence_ref: 'evidence://supervisor/task-10',
    updated_at: '2026-05-19T06:40:00.000Z',
  });
});

test('normalizes legacy supervisor mirrors without leaking approval internals', () => {
  const launch = getAgentLaunchMetadata(
    {
      agent_id: 'agent-11',
      current_task_id: 'task-11',
      workspace_id: 'ws-11',
    },
    {
      'ws-11': {
        supervisor: {
          supervisorState: 'recovering_orphan',
          outcome: 'recover_orphan',
          reasonClass: 'stale_lease',
          taskRetryCount: 0,
          attemptCount: 4,
          unchangedFailureCount: 1,
          approvalRequestCount: 0,
          orphanRecoveryCount: 2,
          workspaceId: 'ws-11',
          runId: 'run-11',
          evidenceRef: 'evidence://supervisor/task-11',
          updatedAt: '2026-05-19T06:41:00.000Z',
          approval_checkpoint: { status: 'pending' },
        },
      },
    }
  );

  assert.deepEqual(launch.supervisor, {
    supervisor_state: 'recovering_orphan',
    outcome: 'recover_orphan',
    reason_class: 'stale_lease',
    task_retry_count: 0,
    attempt_count: 4,
    unchanged_failure_count: 1,
    approval_request_count: 0,
    orphan_recovery_count: 2,
    workspace_id: 'ws-11',
    run_id: 'run-11',
    evidence_ref: 'evidence://supervisor/task-11',
    updated_at: '2026-05-19T06:41:00.000Z',
  });
  assert.equal('approval_checkpoint' in launch.supervisor, false);
});
