const test = require('node:test');
const assert = require('node:assert/strict');
const {
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
