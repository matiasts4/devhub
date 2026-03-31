import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ACTIVE_AGENT_STATUSES,
  countActiveAgents,
  filterActiveAgents,
} from '../../src/lib/agentRegistryTelemetry.js';

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
      { agent_id: 'a1', status: 'working' },
      { agent_id: 'a2', status: 'idle' },
      { agent_id: 'a3', status: 'asking_questions' },
    ];

    assert.strictEqual(countActiveAgents(agents), 2);
    assert.deepStrictEqual(
      filterActiveAgents(agents).map((a) => a.agent_id),
      ['a1', 'a3']
    );
  });
});
