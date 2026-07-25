'use strict';

/**
 * Scenario 7.8 — Operator attempts orchestrate action (role violation)
 *
 * Given:  Operator role session is active
 * When:   UI calls orch_spawn_agent
 * Then:   Policy Layer returns DENIED (Operator + orch_* = MUST NOT)
 * And:    Audit event emitted with { outcome: "denied", error_detail: "role not permitted for orchestrate_*" }
 */

const { routeDispatch } = require('../intent-router');

describe('scenario-role-orch-denied', () => {
  it('Operator orch_spawn_agent returns DENIED', () => {
    const result = routeDispatch({
      action_id: 'orch_spawn_agent',
      params: { session_id: 'abc-123', agent_type: 'worker' },
      target: null,
      actor_role: 'op',
      actor_session_id: 'op-001',
      confirmation: null,
    });

    expect(result.status).toBe('DENIED');
    expect(result.error_detail).toBe('role not permitted for orchestrate_*');
  });

  it('Operator orch_submit_mission returns DENIED', () => {
    const result = routeDispatch({
      action_id: 'orch_submit_mission',
      params: { mission_title: 'Test Mission' },
      target: null,
      actor_role: 'op',
      actor_session_id: 'op-002',
      confirmation: null,
    });

    expect(result.status).toBe('DENIED');
    expect(result.error_detail).toBe('role not permitted for orchestrate_*');
  });

  it('Operator orch_exec_tool returns DENIED', () => {
    const result = routeDispatch({
      action_id: 'orch_exec_tool',
      params: { tool_name: 'devhub_spawn_agent' },
      target: null,
      actor_role: 'op',
      actor_session_id: 'op-003',
      confirmation: null,
    });

    expect(result.status).toBe('DENIED');
    expect(result.error_detail).toBe('role not permitted for orchestrate_*');
  });

  it('Director can orch without confirmation (MAYP)', () => {
    const result = routeDispatch({
      action_id: 'orch_spawn_agent',
      params: { session_id: 'abc-123', agent_type: 'worker' },
      target: null,
      actor_role: 'dir',
      actor_session_id: 'dir-001',
      confirmation: null,
    });

    expect(result.status).toBe('CONFIRM_REQUIRED'); // Tier 3 needs conf
  });

  it('Observer cannot orch at all', () => {
    const result = routeDispatch({
      action_id: 'orch_delegate_task',
      params: { task_id: 'task-001' },
      target: null,
      actor_role: 'obs',
      actor_session_id: 'obs-001',
      confirmation: null,
    });

    expect(result.status).toBe('DENIED');
  });

  it('Director orch with confirmation returns PROCEED', () => {
    const result = routeDispatch({
      action_id: 'orch_spawn_agent',
      params: { session_id: 'abc-123', agent_type: 'worker' },
      target: null,
      actor_role: 'dir',
      actor_session_id: 'dir-001',
      confirmation: {
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        rationale: 'testing',
      },
    });

    expect(result.status).toBe('PROCEED');
  });
});
