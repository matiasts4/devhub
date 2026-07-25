'use strict';

/**
 * Intent Router — pure function, no side effects.
 *
 * Classifies action, checks policy, returns status + action definition.
 * No audit emission, no I/O.
 */

const { getAction } = require('./action-registry');
const { policyEngine } = require('./policy-layer');

// Module-level restricted pane set (same source as policy-layer)
const RESTRICTED_PANES = new Set(['credential-panel', 'secret-overlay']);

/**
 * Check if a nav_* action targets a restricted pane.
 * @param {object} actionDef
 * @param {object} params
 * @returns {{ status: 'NAVIGATE_RESTRICTED', error_detail: string }|null}
 */
function checkNavigation(actionDef, params) {
  if (actionDef.class !== 'nav') return null;
  if (RESTRICTED_PANES.has(params?.pane_id)) {
    return {
      status: 'NAVIGATE_RESTRICTED',
      error_detail: 'restricted pane',
    };
  }
  return null;
}

/**
 * Route an action dispatch.
 *
 * @param {object} dispatch
 * @param {string} dispatch.action_id
 * @param {object} dispatch.params
 * @param {object} dispatch.target
 * @param {string} dispatch.actor_role
 * @param {string} dispatch.actor_session_id
 * @param {object|null} dispatch.confirmation
 * @param {string} [dispatch.devhub_version]
 *
 * @returns {{ status, actionDef?, params?, error_detail? }}
 */
function routeDispatch(dispatch) {
  const {
    action_id,
    params,
    target: _target,
    actor_role,
    actor_session_id: _actor_session_id,
    confirmation,
  } = dispatch;

  const actionDef = getAction(action_id);

  // Unknown action → DEFERRED (deny-by-default)
  if (!actionDef) {
    return {
      status: 'DEFERRED',
      error_detail: `Unknown action: ${action_id}`,
    };
  }

  // Restricted pane check for nav_* actions
  const navCheck = checkNavigation(actionDef, params);
  if (navCheck) return navCheck;

  // Policy check (includes MUST_NOT → DENIED, tier >= 2 without conf → CONFIRM_REQUIRED, etc.)
  const result = policyEngine.check(action_id, actor_role, confirmation);

  if (result.status === 'PROCEED') {
    return { status: 'PROCEED', actionDef, params };
  }

  // Return confirmation/denied/deferred result, merging in actionDef where available
  if (result.actionDef) {
    return { ...result, actionDef };
  }
  return result;
}

module.exports = {
  routeDispatch,
  checkNavigation,
  RESTRICTED_PANES,
};
