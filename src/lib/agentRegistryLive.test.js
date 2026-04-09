import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgentRegistryLiveSnapshot } from './agentRegistryLive.js';

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
