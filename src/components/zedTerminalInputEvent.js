/**
 * Client-side terminal input dispatch when HTTP sidecar/tty routes miss (Phase 1).
 *
 * Producer: useZedChat / dispatchZedActions after execute_in_terminal 404.
 * Consumer: TerminalWorkspacesManager → TerminalTTY WebSocket write.
 */

export const ZED_TERMINAL_INPUT_EVENT = 'devhub:zed-terminal-input';

/**
 * @param {{ terminalId: string, session_id?: string, input: string }} detail
 */
export function dispatchZedTerminalInput(detail) {
  if (typeof window === 'undefined') return;
  if (!detail || typeof detail !== 'object') return;
  const terminalId =
    (typeof detail.terminalId === 'string' && detail.terminalId) ||
    (typeof detail.session_id === 'string' && detail.session_id) ||
    null;
  const input = typeof detail.input === 'string' ? detail.input : null;
  if (!terminalId || input === null) return;
  window.dispatchEvent(
    new CustomEvent(ZED_TERMINAL_INPUT_EVENT, {
      detail: { terminalId, session_id: terminalId, input },
    })
  );
}

/**
 * @param {unknown} result
 * @returns {boolean}
 */
export function shouldDispatchZedTerminalInput(result) {
  const parsed =
    typeof result === 'string'
      ? (() => {
          try {
            return JSON.parse(result);
          } catch {
            return null;
          }
        })()
      : result;
  if (!parsed || typeof parsed !== 'object') return false;
  return parsed.action === 'send_input' || parsed.error === 'unknown session';
}

/**
 * @param {Array<{ tool: string, result: unknown, input?: object }>|null|undefined} toolResults
 */
export function dispatchZedTerminalInputFromToolResults(toolResults) {
  if (!Array.isArray(toolResults)) return;
  for (const entry of toolResults) {
    if (!entry || entry.tool !== 'execute_in_terminal') continue;
    if (!shouldDispatchZedTerminalInput(entry.result)) continue;
    const input =
      entry.input && typeof entry.input.input === 'string' ? entry.input.input : null;
    const terminalId =
      (entry.input && typeof entry.input.session_id === 'string' && entry.input.session_id) ||
      (entry.input && typeof entry.input.name === 'string' && entry.input.name) ||
      null;
    if (!input || !terminalId) continue;
    dispatchZedTerminalInput({ terminalId, input });
  }
}
