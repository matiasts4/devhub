'use strict';

/**
 * Policy Engine — permission matrix enforcement.
 *
 * Returns one of:
 *   PROCEED            — action allowed
 *   CONFIRM_REQUIRED   — action needs user confirmation before proceeding
 *   DENIED            — role not permitted for this action class
 *   DEFERRED          — unknown action or Tier 4 critical action
 */

const { getAction } = require('./action-registry');

// Permission matrix (spec section 3.2)
const PERMISSION_MATRIX = {
  obs: {
    observe: 'MAY',
    nav: 'MUST_NOT',
    mutate: 'MUST_NOT',
    orchestrate: 'MUST_NOT',
  },
  op: {
    observe: 'MAY',
    nav: 'MAY',
    mutate: 'MAY',
    orchestrate: 'MUST_NOT',
  },
  dir: {
    observe: 'MAY',
    nav: 'MAY',
    mutate: 'MAY',
    orchestrate: 'MAY',
  },
  sys: {
    observe: 'MAY',
    nav: 'MAY',
    mutate: 'MAY',
    orchestrate: 'MAY',
  },
};

// Default restricted panes (can be overridden via DH_RESTRICTED_PANES env var)
const DEFAULT_RESTRICTED_PANES = new Set(['credential-panel', 'secret-overlay']);

function parseRestrictedPanes(envValue) {
  if (!envValue) return DEFAULT_RESTRICTED_PANES;
  try {
    const panes = envValue.split(',').map((p) => p.trim()).filter(Boolean);
    if (panes.length === 0) {
      console.warn('[policy-layer] DH_RESTRICTED_PANES is empty, using defaults');
      return DEFAULT_RESTRICTED_PANES;
    }
    return new Set(panes);
  } catch (err) {
    console.warn('[policy-layer] DH_RESTRICTED_PANES malformed, using defaults:', err.message);
    return DEFAULT_RESTRICTED_PANES;
  }
}

const RESTRICTED_PANES = parseRestrictedPanes(
  typeof process !== 'undefined' ? process.env.DH_RESTRICTED_PANES : undefined
);

/**
 * Check if a navigation action targets a restricted pane.
 * @param {string} actionId
 * @param {object} params
 * @returns {boolean}
 */
function isRestrictedPaneNavigation(actionId, params) {
  if (!actionId.startsWith('nav_')) return false;
  return RESTRICTED_PANES.has(params?.pane_id);
}

class PolicyEngine {
  /**
   * @param {string} actionId
   * @param {string} actorRole  — 'obs' | 'op' | 'dir' | 'sys'
   * @param {object|null} confirmation — null on first dispatch, receipt on re-entry
   * @returns {{ status: 'PROCEED'|'CONFIRM_REQUIRED'|'DENIED'|'DEFERRED', reason?: string }}
   */
  check(actionId, actorRole, confirmation) {
    const actionDef = getAction(actionId);

    // Unknown action → DEFERRED (deny-by-default)
    if (!actionDef) {
      return {
        status: 'DEFERRED',
        error_detail: `Unknown action: ${actionId}`,
      };
    }

    const rolePerms = PERMISSION_MATRIX[actorRole];

    // Unknown role → DEFERRED
    if (!rolePerms) {
      return {
        status: 'DEFERRED',
        error_detail: `Unknown actor role: ${actorRole}`,
      };
    }

    const permission = rolePerms[actionDef.class];

    // MUST NOT → DENIED
    if (permission === 'MUST_NOT') {
      return {
        status: 'DENIED',
        error_detail: `role not permitted for ${actionDef.class}_*`,
      };
    }

    // Tier 4 → DEFERRED (critical — deferred to future policy)
    if (actionDef.tier >= 4) {
      return {
        status: 'DEFERRED',
        error_detail: 'POLICY_DENIED: deferred — see operator-action-contract spec',
      };
    }

    // Tier >= 2 without confirmation → CONFIRM_REQUIRED
    // Exception: sys role never blocks for confirmation (bypasses dialog, still emits audit)
    if (actionDef.tier >= 2 && !confirmation && actorRole !== 'sys') {
      return {
        status: 'CONFIRM_REQUIRED',
        actionDef,
      };
    }

    // sys role: bypass confirmation gate for tier >= 2, always PROCEED
    // (audit still emitted with confirmed flag by adapter boundary)
    return { status: 'PROCEED' };
  }

  /**
   * Check if an action targets a restricted pane.
   * @param {string} actionId
   * @param {object} params
   * @returns {boolean}
   */
  isRestrictedNavigation(actionId, params) {
    return isRestrictedPaneNavigation(actionId, params);
  }

  /**
   * Get the list of restricted pane ids.
   * @returns {Set<string>}
   */
  getRestrictedPanes() {
    return RESTRICTED_PANES;
  }
}

// Export a singleton instance (per design decision 1)
const policyEngine = new PolicyEngine();

module.exports = {
  PolicyEngine,
  policyEngine,
  PERMISSION_MATRIX,
  RESTRICTED_PANES,
  isRestrictedPaneNavigation,
};