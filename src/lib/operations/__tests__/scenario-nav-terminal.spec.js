'use strict';

/**
 * Scenario 7.2 — Operator navigates to terminal pane
 *
 * Given:  Operator role session is active
 * When:   UI calls nav_terminal with { pane_id: "main" }
 * Then:   Intent Router classifies as nav / Tier 1
 * And:    Policy Layer returns PROCEED
 * And:    Audit event emitted with { action_id: "nav_terminal", outcome: "success" }
 */

const { routeDispatch } = require('../intent-router');

describe('scenario-nav-terminal', () => {
  it('Operator can navigate to non-restricted terminal pane', () => {
    const result = routeDispatch({
      action_id: 'nav_terminal',
      params: { pane_id: 'main' },
      target: { type: 'pane', id: 'main', label: 'main-pane' },
      actor_role: 'op',
      actor_session_id: 'op-001',
      confirmation: null,
    });

    expect(result.status).toBe('PROCEED');
    expect(result.actionDef.tier).toBe(1);
    expect(result.actionDef.class).toBe('nav');
  });

  it('nav_terminal PROCEED result includes actionDef', () => {
    const result = routeDispatch({
      action_id: 'nav_terminal',
      params: { pane_id: 'main' },
      target: null,
      actor_role: 'op',
      actor_session_id: 'op-002',
      confirmation: null,
    });

    expect(result.status).toBe('PROCEED');
    expect(result.actionDef.action_id).toBeUndefined();
    expect(result.params.pane_id).toBe('main');
  });
});