'use strict';

/**
 * Canonical Operator action registry.
 * All DevHub Operator/Director actions MUST be registered here.
 * Deny-by-default: unknown action_ids return DEFERRED at the Intent Router.
 *
 * Tier 0 = Inspect (no confirmation)
 * Tier 1 = Navigate (no confirmation)
 * Tier 2 = Modify (one-step confirmation)
 * Tier 3 = Execute (rationale + confirmation)
 * Tier 4 = Critical (denied/deferred first cut)
 */

const ACTION_REGISTRY = Object.freeze({
  // ── Observe (Tier 0) ──────────────────────────────────────────
  obs_log_tail: {
    class: 'observe',
    tier: 0,
    label: 'Stream log lines',
    targetTypes: ['session', 'agent'],
    paramsSchema: {
      session_id: { type: 'string', required: true },
      lines: { type: 'number', default: 50 },
    },
  },
  obs_log_search: {
    class: 'observe',
    tier: 0,
    label: 'Search logs',
    targetTypes: ['session', 'agent'],
    paramsSchema: {
      session_id: { type: 'string', required: true },
      pattern: { type: 'string', required: true },
      limit: { type: 'number', default: 100 },
    },
  },
  obs_session_list: {
    class: 'observe',
    tier: 0,
    label: 'List active sessions',
    targetTypes: [],
    paramsSchema: {},
  },
  obs_agent_state: {
    class: 'observe',
    tier: 0,
    label: 'Read agent state snapshot',
    targetTypes: ['agent'],
    paramsSchema: {
      agent_id: { type: 'string', required: true },
    },
  },
  obs_swarm_status: {
    class: 'observe',
    tier: 0,
    label: 'Read swarm mission status',
    targetTypes: ['swarm'],
    paramsSchema: {
      mission_id: { type: 'string', required: false },
    },
  },

  // ── Navigate (Tier 1) ───────────────────────────────────────
  nav_terminal: {
    class: 'nav',
    tier: 1,
    label: 'Focus terminal pane',
    targetTypes: ['pane'],
    paramsSchema: { pane_id: { type: 'string', required: true } },
  },
  nav_editor: {
    class: 'nav',
    tier: 1,
    label: 'Focus editor pane',
    targetTypes: ['pane'],
    paramsSchema: {},
  },
  nav_dock: {
    class: 'nav',
    tier: 1,
    label: 'Toggle right dock',
    targetTypes: [],
    paramsSchema: {},
  },
  nav_browser: {
    class: 'nav',
    tier: 1,
    label: 'Focus browser pane',
    targetTypes: ['pane'],
    paramsSchema: { pane_id: { type: 'string', required: false } },
  },
  nav_layout: {
    class: 'nav',
    tier: 1,
    label: 'Switch layout preset',
    targetTypes: ['layout'],
    paramsSchema: {
      preset: { type: 'string', required: true },
    },
  },

  // ── Mutate (Tier 2) ───────────────────────────────────────────
  mut_env_write: {
    class: 'mutate',
    tier: 2,
    label: 'Write to process environment',
    targetTypes: ['session', 'agent'],
    paramsSchema: {
      session_id: { type: 'string', required: false },
      key: { type: 'string', required: true },
      value: { type: 'string', required: true },
    },
  },
  mut_config_patch: {
    class: 'mutate',
    tier: 2,
    label: 'Patch DevHub runtime config',
    targetTypes: ['config'],
    paramsSchema: {
      key: { type: 'string', required: true },
      value: { type: 'string', required: true },
    },
  },
  mut_session_name: {
    class: 'mutate',
    tier: 2,
    label: 'Rename session',
    targetTypes: ['session'],
    paramsSchema: {
      session_id: { type: 'string', required: true },
      name: { type: 'string', required: true, maxLength: 128 },
    },
  },
  mut_layout_save: {
    class: 'mutate',
    tier: 2,
    label: 'Save layout preset',
    targetTypes: ['layout'],
    paramsSchema: {
      name: { type: 'string', required: true, maxLength: 64 },
    },
  },
  mut_kill_agent: {
    class: 'mutate',
    tier: 2,
    label: 'Terminate agent process',
    targetTypes: ['agent'],
    paramsSchema: {
      agent_id: { type: 'string', required: true },
      reason: { type: 'string', required: false },
    },
  },

  // ── Orchestrate (Tier 3) ─────────────────────────────────────
  orch_spawn_agent: {
    class: 'orchestrate',
    tier: 3,
    label: 'Spawn agent',
    targetTypes: ['session'],
    paramsSchema: {
      session_id: { type: 'string', required: true },
      agent_type: { type: 'string', required: true },
    },
  },
  orch_delegate_task: {
    class: 'orchestrate',
    tier: 3,
    label: 'Delegate task to swarm worker',
    targetTypes: ['task', 'agent'],
    paramsSchema: {
      task_id: { type: 'string', required: true },
      worker_id: { type: 'string', required: false },
    },
  },
  orch_submit_mission: {
    class: 'orchestrate',
    tier: 3,
    label: 'Submit swarm mission',
    targetTypes: ['swarm'],
    paramsSchema: {
      mission_title: { type: 'string', required: true },
      kind: { type: 'string', required: false },
    },
  },
  orch_exec_tool: {
    class: 'orchestrate',
    tier: 3,
    label: 'Invoke MCP tool',
    targetTypes: [],
    paramsSchema: {
      tool_name: { type: 'string', required: true },
      params: { type: 'object', required: false },
    },
  },
  // orch_credential_use is Tier 4 — deferred first cut
  orch_credential_use: {
    class: 'orchestrate',
    tier: 4,
    label: 'Use stored credential',
    targetTypes: ['credential'],
    paramsSchema: {
      credential_id: { type: 'string', required: true },
    },
  },
  // orch_credential_export from spec = Tier 4
  orch_credential_export: {
    class: 'orchestrate',
    tier: 4,
    label: 'Export credential',
    targetTypes: ['credential'],
    paramsSchema: {},
  },
});

/**
 * Get a single action definition by id.
 * Returns undefined for unknown action ids (Intent Router treats as Tier 4 DEFERRED).
 */
function getAction(actionId) {
  return ACTION_REGISTRY[actionId];
}

/**
 * List all registered action ids and their definitions.
 * Returns a plain object copy (caller may not mutate registry).
 */
function listActions() {
  return { ...ACTION_REGISTRY };
}

/**
 * List actions filtered by class.
 */
function listActionsByClass(actionClass) {
  const result = {};
  for (const [id, def] of Object.entries(ACTION_REGISTRY)) {
    if (def.class === actionClass) result[id] = def;
  }
  return result;
}

module.exports = {
  ACTION_REGISTRY,
  getAction,
  listActions,
  listActionsByClass,
};
