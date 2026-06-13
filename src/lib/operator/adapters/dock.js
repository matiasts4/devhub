'use strict';

/**
 * adapters/dock.js — Dock tab switch adapter.
 *
 * Handles `dock.switch_tab` verb.
 * The adapter itself only receives params and returns data.  The actual
 * onDockStateChange invocation lives in useOperatorActions when it wires
 * the adapter — keeping the adapter itself pure.
 *
 * @param {{ verb: 'dock.switch_tab', params: { tabId: string } }} action
 * @returns {Promise<{ success: true, data: object }>}
 */
export async function dockAdapter({ verb, params }) {
  if (verb !== 'dock.switch_tab') {
    throw new Error('E_ADAPTER_UNSUPPORTED_VERB');
  }
  // params.tabId is one of: 'browser' | 'editor' | 'swarm' | 'operator'
  return { success: true, data: { tabId: params.tabId } };
}
