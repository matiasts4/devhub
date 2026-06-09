/** @typedef {{ role?: string; content?: string; tool_results?: Array<{ tool?: string; result?: unknown }> }} ZedChatMessage */

const DEFAULT_GREETING = 'Hola, soy Zed. ¿En qué te puedo ayudar?';
const MAX_STATUS_LEN = 56;

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function shortenUrlLabel(label) {
  if (!label || typeof label !== 'string') return null;
  const trimmed = label.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^https?:\/\//i, '').replace(/\/$/, '').split('/')[0];
}

function summarizeOpenTerminal(result) {
  const cmd = String(result.command_sent || result.command || '')
    .split('\n')[0]
    .trim();
  const program = typeof result.program === 'string' ? result.program.trim().toLowerCase() : '';

  if (
    program === 'opencode' ||
    /^opencode\b/i.test(cmd) ||
    /--agent\s+gentle-orchestrator/i.test(cmd)
  ) {
    return 'Listo. Abrí OpenCode.';
  }
  if (program === 'codex' || /^codex\b/i.test(cmd)) return 'Listo. Abrí Codex.';
  if (program === 'hermes' || /^hermes\b/i.test(cmd)) return 'Listo. Abrí Hermes.';

  if (!cmd) return 'Listo. Abrí terminal.';
  if (cmd.length <= 28) return `Listo. Ejecuté ${cmd}.`;
  return 'Listo. Abrí terminal.';
}

function summarizeToolResult(entry) {
  if (!entry?.tool) return null;
  const raw = entry.result;
  const result = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!result) return null;

  if (result.error === 'terminal_panel_limit_reached') {
    const limit = result.limit || 6;
    return `Máx. ${limit} terminales.`;
  }
  if (result.error === 'command_blocked') return 'Comando bloqueado.';
  if (result.error === 'command_requires_approval') return 'Necesita tu OK.';
  if (result.error) return null;

  switch (entry.tool) {
    case 'open_url': {
      const short = shortenUrlLabel(result.label || result.url);
      return short ? `Listo. Abrí ${short} en pizarra.` : 'Listo. Abrí el navegador en pizarra.';
    }
    case 'open_terminal':
      return summarizeOpenTerminal(result);
    case 'execute_in_terminal':
      return 'Listo. Comando enviado.';
    case 'close_terminal':
      return 'Listo. Terminal cerrada.';
    case 'list_terminals':
      return null;
    default:
      return null;
  }
}

function compressProse(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('Error:')) {
    return trimmed.length <= MAX_STATUS_LEN
      ? trimmed
      : `${trimmed.slice(0, MAX_STATUS_LEN - 1)}…`;
  }

  const shortened = trimmed.includes('. ') ? `${trimmed.split('. ')[0]}.` : trimmed;
  if (shortened.length <= MAX_STATUS_LEN) return shortened;
  return `${shortened.slice(0, MAX_STATUS_LEN - 1)}…`;
}

/**
 * Short human-readable line for the ambient pill after Zed finishes a turn.
 *
 * @param {ZedChatMessage | null | undefined} message
 * @returns {string | null}
 */
export function buildZedAmbientStatus(message) {
  if (!message || typeof message !== 'object') return null;

  const text = typeof message.content === 'string' ? message.content.trim() : '';
  const toolSummaries = (Array.isArray(message.tool_results) ? message.tool_results : [])
    .map(summarizeToolResult)
    .filter(Boolean);

  if (toolSummaries.length > 0) {
    return toolSummaries[0];
  }

  if (text === DEFAULT_GREETING) return text;

  if (text) return compressProse(text);
  return null;
}

export { DEFAULT_GREETING as ZED_DEFAULT_GREETING };