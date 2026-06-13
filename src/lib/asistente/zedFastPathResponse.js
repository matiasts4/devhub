/**
 * User-facing Spanish replies for fast-path / short-circuit tool results (no 2nd LLM turn).
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

/**
 * @param {string} tool
 * @param {unknown} result
 * @returns {string}
 */
export function formatZedFastPathReply(tool, result) {
  const r = safeParse(result);
  if (!r) return 'Listo.';

  if (r.error === 'command_requires_approval' || r.action === 'would_execute') {
    const cmd = r.full_command || r.command || 'comando';
    return `Necesito tu confirmación para ejecutar: ${cmd}`;
  }

  if (r.error) {
    if (r.message && typeof r.message === 'string') return r.message;
    return 'No pude completar la acción.';
  }

  switch (tool) {
    case 'list_terminals': {
      const list = Array.isArray(r.processes) ? r.processes : [];
      if (list.length === 0) return 'No hay terminales abiertas.';
      const names = list
        .map((p) => p.displayName || p.terminalId || p.id)
        .filter(Boolean)
        .join(', ');
      return list.length === 1
        ? `Hay 1 terminal abierta: ${names}.`
        : `Hay ${list.length} terminales abiertas: ${names}.`;
    }
    case 'open_terminal':
      if (r.opened || r.workspace) {
        const label = r.displayName ? `${r.displayName} (${r.terminalId || r.session_id || ''})` : 'nueva';
        const programNote = r.program ? ` con ${r.program}` : '';
        return `Listo. Abrí la terminal ${label}${programNote}.`.replace(' ()', '');
      }
      return 'Listo. Terminal abierta.';
    case 'close_terminal':
      if (r.action === 'would close') {
        return r.message || '¿Confirmás cerrar la terminal?';
      }
      if (r.success) {
        const label = r.displayName || r.session_id || 'terminal';
        return `Listo. Cerré ${label}.`;
      }
      return r.message || 'Listo.';
    case 'open_url':
      return r.url ? `Listo. Abrí ${r.url} en el navegador.` : 'Listo. URL abierta.';
    case 'execute_in_terminal':
      if (r.sent || r.session_id) {
        return 'Listo. Comando enviado a la terminal.';
      }
      return 'Listo.';
    default:
      return 'Listo.';
  }
}

/**
 * @param {Array<{ tool: string, result: unknown }>} toolResults
 * @returns {string}
 */
export function formatZedToolResultsReply(toolResults) {
  if (!Array.isArray(toolResults) || toolResults.length === 0) return 'Listo.';
  const parts = toolResults.map((entry) => formatZedFastPathReply(entry.tool, entry.result));
  return parts.filter(Boolean).join(' ');
}

export default formatZedFastPathReply;
