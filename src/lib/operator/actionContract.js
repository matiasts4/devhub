'use strict';

/**
 * actionContract.js — Operator action allowlist and validation.
 *
 * Pure business logic: no side effects, no async, no module-level state.
 * Validates that a dispatched verb is in the allowlist and all required
 * params are present before the action reaches the confirmation gate.
 */

/**
 * @typedef {Object} VerbEntry
 * @property {'low'|'medium'|'high'} tier
 * @property {string[]} requiredParams
 * @property {string[]} [optionalParams]
 */

/** @type {Record<string, VerbEntry>} */
export const ALLOWED_VERBS = {
  'terminal.open': { tier: 'low', requiredParams: ['workspaceId'] },
  'terminal.focus': { tier: 'low', requiredParams: ['workspaceId'] },
  'browser.open': { tier: 'low', requiredParams: ['url'], optionalParams: ['label'] },
  'browser.navigate': { tier: 'low', requiredParams: ['url'] },
  'browser.focus': { tier: 'low', requiredParams: [] },
  'dock.switch_tab': { tier: 'low', requiredParams: ['tabId'] },
};

/** @type {Record<string, string>} */
export const RISK_TIER_COLORS = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
};

/**
 * Validate an operator action.
 *
 * @param {{ verb: string, params?: object, target?: string }} action
 * @returns {{ valid: boolean, tier: string|null, error: string|null }}
 */
export function validateAction({ verb, params = {}, target: _target = '' }) {
  const entry = ALLOWED_VERBS[verb];
  if (!entry) {
    return { valid: false, tier: null, error: 'E_ACTION_NOT_ALLOWLISTED' };
  }

  for (const param of entry.requiredParams) {
    if (params[param] === undefined) {
      return { valid: false, tier: null, error: 'E_MISSING_PARAMS' };
    }
  }

  return { valid: true, tier: entry.tier, error: null };
}
