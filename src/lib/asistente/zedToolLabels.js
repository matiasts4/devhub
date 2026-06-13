/**
 * Spanish step labels for Zed streaming / activity timeline.
 */

/** @param {string} tool */
/** @param {Record<string, unknown>} [input] */
export function labelForZedToolStart(tool, input = {}) {
  switch (tool) {
    case 'open_terminal': {
      const name = typeof input.name === 'string' ? input.name : null;
      const cmd =
        typeof input.command === 'string'
          ? input.command.split('\n')[0].trim()
          : typeof input.program === 'string'
            ? input.program
            : null;
      if (name && cmd) return `Abriendo ${name} · ${cmd}…`;
      if (name) return `Abriendo terminal ${name}…`;
      if (cmd) return `Abriendo terminal · ${cmd}…`;
      return 'Abriendo terminal…';
    }
    case 'execute_in_terminal': {
      const target =
        (typeof input.name === 'string' && input.name) ||
        (typeof input.session_id === 'string' && input.session_id) ||
        'terminal';
      return `Ejecutando en ${target}…`;
    }
    case 'open_url': {
      const url = typeof input.url === 'string' ? input.url : 'URL';
      return `Abriendo ${url.replace(/^https?:\/\//i, '').split('/')[0]}…`;
    }
    case 'summarize_terminal': {
      const name =
        (typeof input.name === 'string' && input.name) ||
        (typeof input.terminalId === 'string' && input.terminalId) ||
        'terminal';
      return `Resumiendo ${name}…`;
    }
    case 'list_terminals':
      return 'Listando terminales…';
    case 'close_terminal':
      return 'Cerrando terminal…';
    case 'close_url':
      return 'Cerrando navegador…';
    case 'browse_files':
      return 'Explorando archivos…';
    case 'get_swarm_status':
      return 'Consultando swarm…';
    default:
      return `Ejecutando ${tool}…`;
  }
}

export function labelForZedToolDone(tool) {
  switch (tool) {
    case 'open_terminal':
      return 'Terminal lista';
    case 'execute_in_terminal':
      return 'Comando enviado';
    case 'open_url':
      return 'Navegador abierto';
    case 'summarize_terminal':
      return 'Resumen listo';
    default:
      return 'Listo';
  }
}
