/** @typedef {'agent' | 'shell'} TerminalExitKind */

const AGENT_TUI_COMMAND_PATTERN = /\b(opencode|hermes|grok|groc|kimi|codex)\b/i;

/** @type {Map<string, { reason: string | null, connectionState: string }>} */
const persistedPanelSessionExits = new Map();

/**
 * Agent TUIs launched as the panel's initial command (native VTE or xterm).
 * Matches anywhere in the command (e.g. `bash -lc opencode --session …`).
 */
export function isAgentTuiCommand(initialCommand) {
  const cmd = String(initialCommand || '').trim();
  if (!cmd) return false;
  return AGENT_TUI_COMMAND_PATTERN.test(cmd);
}

/** Survives React unmount/remount on workspace window switches. */
export function persistPanelSessionExit(
  panelId,
  { reason = null, connectionState = 'agent-exited' } = {}
) {
  if (!panelId) return;
  persistedPanelSessionExits.set(panelId, { reason, connectionState });
}

export function readPanelSessionExit(panelId) {
  return persistedPanelSessionExits.get(panelId) || null;
}

export function clearPanelSessionExit(panelId) {
  persistedPanelSessionExits.delete(panelId);
}

export function resolveAgentTuiLabel(initialCommand) {
  const cmd = String(initialCommand || '')
    .trim()
    .toLowerCase();
  if (cmd.startsWith('opencode')) return 'OpenCode';
  if (cmd.startsWith('kimi')) return 'Kimi Code';
  if (cmd.startsWith('hermes')) return 'Hermes';
  if (cmd.startsWith('codex')) return 'Codex';
  if (cmd.startsWith('grok') || cmd.startsWith('groc')) return 'Grok';
  return 'Agente TUI';
}

/**
 * Parse native/xterm exit reason strings.
 * @returns {{ kind: TerminalExitKind, exitCode: number | null, agentCause: string | null, abnormal: boolean }}
 */
export function parseTerminalExitReason(reason) {
  const text = String(reason || '');
  const childMatch = /^child-exited:(-?\d+)$/.exec(text);
  if (childMatch) {
    const exitCode = Number(childMatch[1]);
    return {
      kind: 'shell',
      exitCode: Number.isFinite(exitCode) ? exitCode : null,
      agentCause: null,
      abnormal: exitCode !== 0,
    };
  }

  const agentMatch = /^agent-exited:(.+)$/.exec(text);
  if (agentMatch) {
    return {
      kind: 'agent',
      exitCode: null,
      agentCause: agentMatch[1] || 'unknown',
      abnormal: true,
    };
  }

  return {
    kind: 'shell',
    exitCode: null,
    agentCause: null,
    abnormal: Boolean(text),
  };
}

/**
 * Copy for the terminal status overlay when a session ends.
 */
export function buildTerminalExitOverlayCopy({
  initialCommand = null,
  reason = null,
  initError = null,
  connectionState = 'terminated',
} = {}) {
  if (initError) {
    return {
      title: 'Terminal no visible todavía',
      body: initError,
      actionLabel: 'Reconectar',
    };
  }

  const parsed = parseTerminalExitReason(reason);
  const agentLabel = resolveAgentTuiLabel(initialCommand);
  const isAgent =
    parsed.kind === 'agent' || (parsed.kind === 'shell' && isAgentTuiCommand(initialCommand));

  if (connectionState === 'agent-exited' || (isAgent && parsed.kind === 'agent')) {
    const causeHint =
      parsed.agentCause === 'fetch-failed'
        ? ' Falló una actualización interna (fetch failed).'
        : parsed.agentCause === 'bye'
          ? ' El proceso del agente terminó (Bye!).'
          : parsed.agentCause === 'session-ended'
            ? ' La sesión del agente terminó.'
            : parsed.agentCause
              ? ` Motivo: ${parsed.agentCause}.`
              : '';
    return {
      title: `${agentLabel} finalizó`,
      body: `La sesión del agente ya no está activa en este panel.${causeHint} Podés relanzar OpenCode o seguir usando la shell debajo.`,
      actionLabel: `Relanzar ${agentLabel}`,
    };
  }

  if (connectionState === 'error') {
    return {
      title: 'Error de conexión',
      body: 'No se pudo conectar al servidor de terminal. Verificá que el servidor esté corriendo.',
      actionLabel: 'Reconectar',
    };
  }

  if (connectionState === 'terminated') {
    if (isAgent && parsed.abnormal) {
      return {
        title: `${agentLabel} terminó con error`,
        body: `La sesión cerró con código ${parsed.exitCode ?? 'desconocido'}. Relanzá el agente o reconectá la shell.`,
        actionLabel: `Relanzar ${agentLabel}`,
      };
    }
    return {
      title: 'Sesión finalizada',
      body: isAgent
        ? `${agentLabel} cerró. Relanzá el agente o reconectá para una shell limpia.`
        : 'La sesión terminó. Reconectá para iniciar una shell nueva sin relanzar el comando inicial.',
      actionLabel: isAgent ? `Relanzar ${agentLabel}` : 'Reconectar',
    };
  }

  return {
    title: 'Desconectado',
    body: 'La conexión con la terminal se perdió.',
    actionLabel: 'Reconectar',
  };
}
