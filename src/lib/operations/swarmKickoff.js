/* eslint-env node */
/* eslint-disable no-undef -- CommonJS module used by health route and tests */
'use strict';

const { createRequire } = require('module');
const inboxRequire = createRequire(__filename);
const { injectTextToTmuxSession, waitForOpencodeReady } = inboxRequire('../bus/inboxConsume.js');

const ORCHESTRATOR_ROLE_KEYS = ['zed', 'director'];

/**
 * Build activation prompt injected when operator wakes ZED from standby.
 * @param {string} [operatorMessage]
 * @returns {string}
 */
function buildZedActivationPrompt(operatorMessage = '') {
  const operatorLine = String(operatorMessage || '').trim();
  const lines = [
    '=== ACTIVACION — el operador te da la palabra ===',
    '- Modo standby finalizado: podes usar DevHub MCP y delegar a workers.',
    '- Antes de decir "delegado": ejecuta `_devhub_chat` y reporta exit code + inbox_row_id del JSON de salida.',
    '- No afirmes que un worker esta trabajando sin ACK (`kind: ack`) en team_chat.',
    '- Usa DEVHUB_PROJECT_ID para MCP (get_project_context, list_tasks, update_task).',
  ];
  if (operatorLine) {
    lines.push('', `Instruccion del operador: ${operatorLine}`);
  }
  return lines.join('\n');
}

/**
 * Resolve orchestrator tmux session for a swarm launch.
 * @param {string} launchId
 * @param {string} [preferredRole]
 * @returns {string}
 */
function resolveOrchestratorTmuxSession(launchId, preferredRole = 'zed') {
  const id = String(launchId || '').trim();
  const role = String(preferredRole || 'zed').trim() || 'zed';
  return `devhub-swarm-${id}-${role}`;
}

/**
 * Inject activation prompt into ZED/director tmux pane.
 * @param {object} params
 * @param {string} params.launchId
 * @param {string} [params.operatorMessage]
 * @param {string} [params.roleKey]
 * @param {number} [params.tuiWaitMs]
 * @returns {{ ok: boolean, sessionName: string, reason?: string }}
 */
function activateZedStandbySession({
  launchId,
  operatorMessage = '',
  roleKey = 'zed',
  tuiWaitMs = 30000,
} = {}) {
  const normalizedRole = ORCHESTRATOR_ROLE_KEYS.includes(roleKey) ? roleKey : 'zed';
  const sessionName = resolveOrchestratorTmuxSession(launchId, normalizedRole);
  const prompt = buildZedActivationPrompt(operatorMessage);

  if (!waitForOpencodeReady(sessionName, tuiWaitMs)) {
    return { ok: false, sessionName, reason: 'tui_not_ready' };
  }

  const injected = injectTextToTmuxSession(sessionName, prompt);
  if (!injected) {
    return { ok: false, sessionName, reason: 'tmux_inject_failed' };
  }

  return { ok: true, sessionName };
}

module.exports = {
  buildZedActivationPrompt,
  resolveOrchestratorTmuxSession,
  activateZedStandbySession,
};
