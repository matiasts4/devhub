import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgentRegistryLiveSnapshot } from './agentRegistryLive.js';

test('counts agents with active statuses as live', () => {
  const snapshot = getAgentRegistryLiveSnapshot({
    agents: [
      { agent_id: 'a', status: 'working' },
      { agent_id: 'b', status: 'idle' },
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
    agents: [{ agent_id: 'a', status: 'idle' }],
    liveSessions: { panel1: { alive: true } },
    agentRuns: { a: { panelId: 'panel1' } },
  });

  assert.equal(snapshot.activeAgentsCount, 1);
});
