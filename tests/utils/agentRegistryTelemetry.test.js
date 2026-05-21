import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ACTIVE_AGENT_STATUSES,
  countActiveAgents,
  filterActiveAgents,
  isActiveAgent,
} from '../../src/lib/agentRegistryTelemetry.js';

const FRESH_HEARTBEAT = new Date().toISOString();
const STALE_HEARTBEAT = new Date(Date.now() - 120000).toISOString(); // 2 min ago

describe('agent registry telemetry helpers', () => {
  it('detects the live swarm statuses used by the UI', () => {
    assert.deepStrictEqual(ACTIVE_AGENT_STATUSES, [
      'working',
      'running',
      'active',
      'thinking',
      'asking_questions',
    ]);
  });

  it('filters and counts active agents without extra side effects', () => {
    const agents = [
      { agent_id: 'a1', status: 'working', last_heartbeat: FRESH_HEARTBEAT },
      { agent_id: 'a2', status: 'idle', last_heartbeat: STALE_HEARTBEAT },
      { agent_id: 'a3', status: 'asking_questions', last_heartbeat: FRESH_HEARTBEAT },
    ];

    assert.strictEqual(countActiveAgents(agents), 2);
    assert.deepStrictEqual(
      filterActiveAgents(agents).map((a) => a.agent_id),
      ['a1', 'a3']
    );
  });

  it('rejects agents with stale heartbeat even if status is active', () => {
    const agent = { agent_id: 'a', status: 'working', last_heartbeat: STALE_HEARTBEAT };
    assert.strictEqual(isActiveAgent(agent), false);
  });

  it('accepts agents with fresh heartbeat and active status', () => {
    const agent = { agent_id: 'a', status: 'working', last_heartbeat: FRESH_HEARTBEAT };
    assert.strictEqual(isActiveAgent(agent), true);
  });
});
