'use strict';

/**
 * Scenario 7.6 — Director attempts Tier 4 deferred action
 *
 * Given:  Director role session is active
 * When:   UI calls orch_credential_export (registered as Tier 4)
 * Then:   Intent Router returns DEFERRED
 * And:    Audit event emitted with { outcome: "deferred", error_detail: "POLICY_DENIED: deferred — see operator-action-contract spec" }
 */

const { routeDispatch } = require('../intent-router');

describe('scenario-orch-credential-export', () => {
  it('Director orch_credential_export returns DEFERRED (Tier 4)', () => {
    const result = routeDispatch({
      action_id: 'orch_credential_export',
      params: {},
      target: { type: 'credential', id: 'cred-001', label: 'api-key-main' },
      actor_role: 'dir',
      actor_session_id: 'dir-001',
      confirmation: null,
    });

    expect(result.status).toBe('DEFERRED');
    expect(result.error_detail).toContain('POLICY_DENIED');
    expect(result.error_detail).toContain('operator-action-contract spec');
  });

  it('sys role also returns DEFERRED for Tier 4', () => {
    const result = routeDispatch({
      action_id: 'orch_credential_export',
      params: {},
      target: null,
      actor_role: 'sys',
      actor_session_id: 'sys-001',
      confirmation: null,
    });

    expect(result.status).toBe('DEFERRED');
  });

  it('orch_credential_use is also Tier 4 and returns DEFERRED', () => {
    const result = routeDispatch({
      action_id: 'orch_credential_use',
      params: { credential_id: 'cred-xyz' },
      target: { type: 'credential', id: 'cred-xyz', label: 'cred-xyz' },
      actor_role: 'dir',
      actor_session_id: 'dir-001',
      confirmation: null,
    });

    expect(result.status).toBe('DEFERRED');
  });
});
