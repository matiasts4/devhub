/**
 * Client-side event dispatcher for workspace-level Zed actions.
 *
 * The backend tool `workspace_action` returns a result with `action` and
 * optional `section`; the client emits a custom event that
 * TerminalWorkspacesManager listens to and applies.
 */

const EVENT_NAME = 'zed:workspace-action';

/**
 * @typedef {object} ZedWorkspaceActionEventDetail
 * @property {string} action
 * @property {string} [section]
 */

/**
 * Dispatch a workspace action from tool results.
 *
 * @param {Array<{ tool: string, result: unknown }>|null|undefined} toolResults
 */
export function dispatchZedWorkspaceActionFromToolResults(toolResults) {
  if (!Array.isArray(toolResults)) return;

  for (const entry of toolResults) {
    if (!entry || entry.tool !== 'workspace_action') continue;

    const raw = entry.result;
    const parsed = typeof raw === 'string' ? safeParse(raw) : raw;
    if (!parsed || parsed.error || !parsed.action) continue;

    const event = new CustomEvent(EVENT_NAME, {
      detail: {
        action: parsed.action,
        section: parsed.section,
        window_id: parsed.window_id,
        window_index: parsed.window_index,
      },
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
  }
}

/**
 * Subscribe to workspace actions.
 *
 * @param {(detail: ZedWorkspaceActionEventDetail) => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeZedWorkspaceAction(handler) {
  const wrapped = (event) => handler(event.detail);
  window.addEventListener(EVENT_NAME, wrapped);
  return () => window.removeEventListener(EVENT_NAME, wrapped);
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
