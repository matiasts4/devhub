'use strict';

/**
 * Scenario 7.4 — Operator modifies session name (Tier 2)
 *
 * Given:  Operator role session is active
 * When:   UI calls mut_session_name with { session_id: "abc-123", name: "debug-session" }
 * Then:   Intent Router classifies as mutate / Tier 2
 * And:   Policy Layer returns CONFIRM_REQUIRED
 * When:   Confirmation receipt provided, re-dispatch proceeds
 */

const { routeDispatch } = require('../intent-router');

describe('scenario-mut-session-name', () => {
  it('Operator mut_session_name without confirmation returns CONFIRM_REQUIRED', () => {
    const result = routeDispatch({
      action_id: 'mut_session_name',
      params: { session_id: 'abc-123', name: 'debug-session' },
      target: { type: 'session', id: 'abc-123', label: 'session-abc-123' },
      actor_role: 'op',
      actor_session_id: 'op-001',
      confirmation: null,
    });

    expect(result.status).toBe('CONFIRM_REQUIRED');
    expect(result.actionDef.tier).toBe(2);
    expect(result.actionDef.class).toBe('mutate');
  });

  it('Operator mut_session_name with confirmation returns PROCEED', () => {
    const result = routeDispatch({
      action_id: 'mut_session_name',
      params: { session_id: 'abc-123', name: 'debug-session' },
      target: { type: 'session', id: 'abc-123', label: 'session-abc-123' },
      actor_role: 'op',
      actor_session_id: 'op-001',
      confirmation: { confirmed: true, confirmed_at: new Date().toISOString() },
    });

    expect(result.status).toBe('PROCEED');
    expect(result.actionDef).toBeDefined();
    expect(result.params.name).toBe('debug-session');
  });

  it('Director mut_session_name without confirmation also returns CONFIRM_REQUIRED', () => {
    const result = routeDispatch({
      action_id: 'mut_session_name',
      params: { session_id: 'abc-123', name: 'debug-session' },
      target: null,
      actor_role: 'dir',
      actor_session_id: 'dir-001',
      confirmation: null,
    });

    expect(result.status).toBe('CONFIRM_REQUIRED');
  });
});
