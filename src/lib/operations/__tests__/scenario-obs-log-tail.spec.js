'use strict';

/**
 * Scenario 7.1 — Observer reads logs
 *
 * Given: Observer role session is active
 * When:  UI calls obs_log_tail with { session_id: "abc-123", lines: 50 }
 * Then:  Intent Router classifies as observe / Tier 0
 * And:   Policy Layer returns PROCEED
 * And:   Adapter Boundary redacts no params (no secrets in log tail)
 * And:   Audit event emitted with { action_id: "obs_log_tail", outcome: "success" }
 */

const { routeDispatch } = require('../intent-router');

describe('scenario-obs-log-tail', () => {
  it('Observer can execute obs_log_tail — returns PROCEED', () => {
    const result = routeDispatch({
      action_id: 'obs_log_tail',
      params: { session_id: 'abc-123', lines: 50 },
      target: { type: 'session', id: 'abc-123', label: 'session-abc-123' },
      actor_role: 'obs',
      actor_session_id: 'obs-001',
      confirmation: null,
    });

    expect(result.status).toBe('PROCEED');
    expect(result.actionDef.action_id).toBeUndefined(); // actionDef is the def, not wrapper
    expect(result.actionDef.tier).toBe(0);
    expect(result.actionDef.class).toBe('observe');
  });

  it('PROCEED result includes actionDef and params', () => {
    const result = routeDispatch({
      action_id: 'obs_log_tail',
      params: { session_id: 'abc-123', lines: 50 },
      target: { type: 'session', id: 'abc-123', label: 'session-abc-123' },
      actor_role: 'obs',
      actor_session_id: 'obs-001',
      confirmation: null,
    });

    expect(result.status).toBe('PROCEED');
    expect(result.actionDef).toBeDefined();
    expect(result.params).toBeDefined();
    expect(result.params.session_id).toBe('abc-123');
  });
});