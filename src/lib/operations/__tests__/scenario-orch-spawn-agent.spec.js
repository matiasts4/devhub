'use strict';

/**
 * Scenario 7.5 — Director executes agent spawn (Tier 3)
 *
 * Given:  Director role session is active
 * When:   UI calls orch_spawn_agent with { session_id: "abc-123", agent_type: "worker" }
 * Then:   Intent Router classifies as orchestrate / Tier 3
 * And:   Policy Layer returns CONFIRM_REQUIRED
 * When:   User types rationale and confirms, re-dispatch proceeds
 */

const { routeDispatch } = require('../intent-router');

describe('scenario-orch-spawn-agent', () => {
  it('Director orch_spawn_agent without confirmation returns CONFIRM_REQUIRED', () => {
    const result = routeDispatch({
      action_id: 'orch_spawn_agent',
      params: { session_id: 'abc-123', agent_type: 'worker' },
      target: { type: 'session', id: 'abc-123', label: 'session-abc-123' },
      actor_role: 'dir',
      actor_session_id: 'dir-001',
      confirmation: null,
    });

    expect(result.status).toBe('CONFIRM_REQUIRED');
    expect(result.actionDef.tier).toBe(3);
    expect(result.actionDef.class).toBe('orchestrate');
  });

  it('Director orch_spawn_agent with confirmation returns PROCEED', () => {
    const result = routeDispatch({
      action_id: 'orch_spawn_agent',
      params: { session_id: 'abc-123', agent_type: 'worker' },
      target: { type: 'session', id: 'abc-123', label: 'session-abc-123' },
      actor_role: 'dir',
      actor_session_id: 'dir-001',
      confirmation: {
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        rationale: 'Spawning worker to process background tasks',
      },
    });

    expect(result.status).toBe('PROCEED');
    expect(result.params.agent_type).toBe('worker');
  });

  it('Director orch_spawn_agent with minimal rationale proceeds', () => {
    const result = routeDispatch({
      action_id: 'orch_spawn_agent',
      params: { session_id: 'abc-123', agent_type: 'worker' },
      target: null,
      actor_role: 'dir',
      actor_session_id: 'dir-002',
      confirmation: { confirmed: true, confirmed_at: new Date().toISOString(), rationale: 'test' },
    });

    expect(result.status).toBe('PROCEED');
  });

  it('sys role orch_spawn_agent also requires confirmation (bypasses confirm, not audit)', () => {
    const result = routeDispatch({
      action_id: 'orch_spawn_agent',
      params: { session_id: 'abc-123', agent_type: 'worker' },
      target: null,
      actor_role: 'sys',
      actor_session_id: 'sys-001',
      confirmation: null,
    });

    // sys bypasses confirmation gate — PROCEED without conf
    expect(result.status).toBe('PROCEED');
  });
});