/**
 * Decide whether to skip the 2nd LLM turn after tool execution.
 */

function safeParse(result) {
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }
  return result && typeof result === 'object' ? result : null;
}

function isShortCircuitableToolResult(tool, result) {
  const r = safeParse(result);
  if (!r) return false;

  if (r.error === 'command_requires_approval' || r.action === 'would_execute') return true;
  if (r.action === 'would close') return true;
  if (r.error) return false;

  switch (tool) {
    case 'list_terminals':
      return Array.isArray(r.processes);
    case 'close_terminal':
      return r.success === true;
    case 'open_terminal':
      return Boolean(r.opened || r.terminalId || r.workspace);
    case 'execute_in_terminal':
      return Boolean(r.sent || r.session_id);
    case 'open_url':
      return Boolean(r.url || r.opened);
    case 'close_url':
      return r.success === true || r.closed === true;
    default:
      return false;
  }
}

/**
 * @param {Array<{ tool: string, result: unknown }>} toolResults
 * @returns {boolean}
 */
export function shouldShortCircuitAfterTools(toolResults) {
  if (!Array.isArray(toolResults) || toolResults.length === 0) return false;
  return toolResults.every((entry) => isShortCircuitableToolResult(entry.tool, entry.result));
}

export default shouldShortCircuitAfterTools;
