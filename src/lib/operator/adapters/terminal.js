'use strict';

/**
 * adapters/terminal.js — Terminal pane adapter.
 *
 * Handles `terminal.open` and `terminal.focus` verbs.
 * In v1 the adapter returns a harmless success so the card state machine
 * is end-to-end complete. The actual focus/open wiring to
 * TerminalWorkspacesManager state is deferred to a follow-up integration pass.
 *
 * @param {{ verb: 'terminal.open'|'terminal.focus', params: { workspaceId: string } }} action
 * @returns {Promise<{ success: true, data: object }>}
 */
export async function terminalAdapter({ verb, params }) {
  if (verb === 'terminal.open') {
    // Delegates to the workspace open hook. The actual implementation
    // is workspace-specific and deferred to the integration phase.
    // In the interim, return a harmless success so the card closes.
    return { success: true, data: { workspaceId: params.workspaceId } };
  }

  if (verb === 'terminal.focus') {
    return { success: true, data: { workspaceId: params.workspaceId } };
  }

  throw new Error('E_ADAPTER_UNSUPPORTED_VERB');
}
