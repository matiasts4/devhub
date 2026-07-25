'use strict';

/**
 * Adapter Boundary — translates action_id to MCP tool calls,
 * handles secret redaction, and manages audit emission ordering.
 *
 * Tier 2/3 actions: audit flushed BEFORE MCP call (guarantees durability).
 * Tier 0/1 actions: audit on next dispatch / beforeunload.
 *
 * UI-only actions (toolName === null): return { ok: true, uiOnly: true }.
 */

const { emit } = require('./audit-emitter');
const { redactSecrets: _redact } = require('./audit-emitter');
const { getAction } = require('./action-registry');

// Map action_id → MCP tool name. null = UI-only (no MCP call).
const ACTION_TOOL_MAP = {
  obs_log_tail: 'devhub_get_session_logs',
  obs_log_search: 'devhub_search_logs',
  obs_session_list: 'devhub_list_sessions',
  obs_agent_state: 'devhub_get_agent_state',
  obs_swarm_status: 'devhub_get_swarm_status',
  nav_terminal: null, // UI-only — handled by React/Tauri
  nav_editor: null,
  nav_dock: null,
  nav_browser: null,
  nav_layout: null,
  mut_env_write: 'devhub_write_env',
  mut_config_patch: 'devhub_patch_config',
  mut_session_name: 'devhub_rename_session',
  mut_layout_save: 'devhub_save_layout',
  mut_kill_agent: 'devhub_kill_agent',
  orch_spawn_agent: 'devhub_spawn_agent',
  orch_delegate_task: 'devhub_delegate_task',
  orch_submit_mission: 'devhub_submit_mission',
  orch_exec_tool: 'devhub_exec_tool',
  // Tier 4 — deferred, should not reach adapter in normal flow
  orch_credential_use: null,
  orch_credential_export: null,
};

/**
 * Execute an action after routing has confirmed PROCEED.
 *
 * @param {object} opts
 * @param {string} opts.action_id
 * @param {object} opts.params
 * @param {object} opts.target
 * @param {string} opts.actor_role
 * @param {string} opts.actor_session_id
 * @param {object} opts.confirmation
 * @param {string} [opts.devhub_version]
 * @returns {Promise<{ok: boolean, uiOnly?: boolean, result?: any, error?: string}>}
 */
async function executeAction(opts) {
  const {
    action_id,
    params,
    target,
    actor_role,
    actor_session_id,
    confirmation,
    devhub_version = '0.1.0',
  } = opts;

  const actionDef = getAction(action_id);
  const toolName = ACTION_TOOL_MAP[action_id] ?? null;

  // Build the audit event (params redacted)
  const baseEvent = {
    event_id: crypto.randomUUID(),
    action_id,
    action_class: actionDef?.class || null,
    actor_role,
    actor_session_id,
    target: target || null,
    params: _redact(params),
    risk_tier: actionDef?.tier ?? 0,
    confirmation: confirmation || null,
    devhub_version,
    timestamp: new Date().toISOString(),
  };

  // UI-only action — no MCP call
  if (toolName === null) {
    // Still emit audit (Tier 2/3: flushed before return)
    if (actionDef?.tier >= 2) {
      emit({ ...baseEvent, outcome: 'success', confirmed: true });
    } else {
      emit({ ...baseEvent, outcome: 'success' });
    }
    return { ok: true, uiOnly: true };
  }

  // Tier 2/3: flush confirmed audit BEFORE MCP call (design decision 4)
  if (actionDef?.tier >= 2 && confirmation) {
    emit({ ...baseEvent, outcome: 'success', confirmed: true });
  }

  // Make the MCP tool call
  let toolResult;
  try {
    toolResult = await _callMcpTool(toolName, _redact(params));
  } catch (err) {
    // Emit error audit event
    emit({
      ...baseEvent,
      outcome: 'error',
      error_detail: err.message,
      confirmed: confirmation ? true : undefined,
    });
    return { ok: false, error: err.message };
  }

  // Emit success audit for Tier 0/1 or Tier 2/3 already flushed above
  if (actionDef?.tier < 2) {
    emit({ ...baseEvent, outcome: 'success' });
  }

  return { ok: true, result: toolResult };
}

/**
 * Call an MCP tool via the devhub-mcp HTTP endpoint.
 * Falls back to a no-op if MCP server is unreachable.
 *
 * @param {string} toolName
 * @param {object} params
 * @returns {Promise<any>}
 */
async function _callMcpTool(toolName, params) {
  // The MCP server runs on the same host; use the internal endpoint.
  // In production this would be a WebSocket/REST call to devhub-mcp.
  // For now we implement a placeholder that resolves to { toolName, params }
  // — real integration point for devhub-mcp/server.js.
  //
  // TODO: wire to actual MCP transport (ws or REST) once server is available.
  return { tool: toolName, params };
}

/**
 * Dispatch from the MCP adapter (server-side).
 * Called by devhub-mcp/server.js when x-dh-action-id header is present.
 *
 * @param {object} opts
 * @param {string} opts.action_id
 * @param {object} opts.params
 * @param {string} [opts.actor_role]
 * @returns {Promise<{status, result?, error_detail?}>}
 */
async function dispatchFromAdapter(opts) {
  const { action_id, params, actor_role = 'sys' } = opts;

  const actionDef = getAction(action_id);
  const toolName = ACTION_TOOL_MAP[action_id] ?? null;

  if (!actionDef || !toolName) {
    return { status: 'DEFERRED', error_detail: `No adapter mapping for action: ${action_id}` };
  }

  // Use adapter-boundary executeAction for the MCP tool call
  return executeAction({
    action_id,
    params,
    target: null,
    actor_role,
    actor_session_id: 'adapter',
    confirmation: null,
  });
}

module.exports = {
  executeAction,
  dispatchFromAdapter,
  ACTION_TOOL_MAP,
};
