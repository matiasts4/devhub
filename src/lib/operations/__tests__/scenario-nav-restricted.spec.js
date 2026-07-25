'use strict';

/**
 * Scenario 7.3 — Operator attempts navigation to restricted pane
 *
 * Given:  Operator role session is active
 * And:    Target pane is marked restricted (credential-panel)
 * When:   UI calls nav_terminal with { pane_id: "credential-panel" }
 * Then:   Intent Router returns NAVIGATE_RESTRICTED
 * And:    Audit event emitted with { action_id: "nav_terminal", outcome: "denied", error_detail: "restricted pane" }
 */

const { routeDispatch } = require('../intent-router');

describe('scenario-nav-restricted', () => {
  it('Operator navigation to restricted pane returns NAVIGATE_RESTRICTED', () => {
    const result = routeDispatch({
      action_id: 'nav_terminal',
      params: { pane_id: 'credential-panel' },
      target: { type: 'pane', id: 'credential-panel', label: 'credential-panel' },
      actor_role: 'op',
      actor_session_id: 'op-001',
      confirmation: null,
    });

    expect(result.status).toBe('NAVIGATE_RESTRICTED');
    expect(result.error_detail).toBe('restricted pane');
  });

  it('Director also blocked by restricted pane check', () => {
    const result = routeDispatch({
      action_id: 'nav_terminal',
      params: { pane_id: 'secret-overlay' },
      target: { type: 'pane', id: 'secret-overlay', label: 'secret-overlay' },
      actor_role: 'dir',
      actor_session_id: 'dir-001',
      confirmation: null,
    });

    expect(result.status).toBe('NAVIGATE_RESTRICTED');
  });

  it('Non-restricted nav pane proceeds normally for any role', () => {
    const result = routeDispatch({
      action_id: 'nav_terminal',
      params: { pane_id: 'main-terminal' },
      target: null,
      actor_role: 'op',
      actor_session_id: 'op-001',
      confirmation: null,
    });

    expect(result.status).toBe('PROCEED');
  });
});
