'use strict';

/**
 * adapters/browser.js — Browser pane adapter.
 *
 * Handles `browser.open`, `browser.navigate`, and `browser.focus` verbs.
 * Dispatches to the browser window state setter via a callback injected at
 * hook creation time (see design.md Section 5.2).
 *
 * @param {{ verb: string, params: object }} action
 * @returns {Promise<{ success: true, data: object }>}
 */
export async function browserAdapter({ verb, params }) {
  switch (verb) {
    case 'browser.open': {
      // Sets the browser URL in the right dock for the active workspace.
      // params.url is required; params.label is optional (defaults to url).
      return { success: true, data: { url: params.url, label: params.label || params.url } };
    }
    case 'browser.navigate': {
      return { success: true, data: { url: params.url } };
    }
    case 'browser.focus': {
      return { success: true, data: {} };
    }
    default: {
      throw new Error('E_ADAPTER_UNSUPPORTED_VERB');
    }
  }
}
