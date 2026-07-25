'use strict';

/**
 * Scenario 7.7 — Observer attempts to navigate (role violation)
 *
 * Given:  Observer role session is active
 * When:   UI calls nav_terminal
 * Then:   Policy Layer returns DENIED (Observer + nav_* = MUST NOT)
 * And:    Audit event emitted with { outcome: "denied", error_detail: "role not permitted for nav_*" }
 */

const { routeDispatch } = require('../intent-router');

describe('scenario-role-nav-denied', () => {
  it('Observer calling nav_terminal returns DENIED', () => {
    const result = routeDispatch({
      action_id: 'nav_terminal',
      params: { pane_id: 'main' },
      target: null,
      actor_role: 'obs',
      actor_session_id: 'obs-001',
      confirmation: null,
    });

    expect(result.status).toBe('DENIED');
    expect(result.error_detail).toBe('role not permitted for nav_*');
  });

  it('Observer calling nav_editor returns DENIED', () => {
    const result = routeDispatch({
      action_id: 'nav_editor',
      params: {},
      target: null,
      actor_role: 'obs',
      actor_session_id: 'obs-002',
      confirmation: null,
    });

    expect(result.status).toBe('DENIED');
  });

  it('Observer calling nav_dock returns DENIED', () => {
    const result = routeDispatch({
      action_id: 'nav_dock',
      params: {},
      target: null,
      actor_role: 'obs',
      actor_session_id: 'obs-003',
      confirmation: null,
    });

    expect(result.status).toBe('DENIED');
  });

  it('Observer can still perform obs_* actions (proceed)', () => {
    const result = routeDispatch({
      action_id: 'obs_log_tail',
      params: { session_id: 'abc-123', lines: 50 },
      target: null,
      actor_role: 'obs',
      actor_session_id: 'obs-001',
      confirmation: null,
    });

    expect(result.status).toBe('PROCEED');
  });

  it('Operator can nav without confirmation (may)', () => {
    const result = routeDispatch({
      action_id: 'nav_terminal',
      params: { pane_id: 'main' },
      target: null,
      actor_role: 'op',
      actor_session_id: 'op-001',
      confirmation: null,
    });

    expect(result.status).toBe('PROCEED');
  });
});
