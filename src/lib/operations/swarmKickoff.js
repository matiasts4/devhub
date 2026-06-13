/* eslint-env node */
/* eslint-disable no-undef -- CommonJS module used by health route and tests */
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const ORCHESTRATOR_ROLE_KEYS = ['zed', 'director'];

function waitForOpencodeReady(sessionName, maxWaitMs = 30000) {
  const target = String(sessionName || '').trim();
  if (!target) return false;
  const readyFile = `/tmp/devhub-opencode-ready-${target}`;
  const deadline = Date.now() + Math.max(500, Number(maxWaitMs) || 30000);
  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(readyFile)) return true;
    } catch {
      /* best effort */
    }
    const until = Date.now() + 200;
    while (Date.now() < until) {
      /* brief spin */
    }
  }
  return false;
}

function injectTextToTmuxSession(sessionName, text) {
  const target = String(sessionName || '').trim();
  if (!target) return false;
  const payload = String(text || '').trim();
  if (!payload) return false;

  const header = `[DevHub directive ${new Date().toISOString()}]`;
  spawnSync('tmux', ['send-keys', '-t', target, '-l', header], { stdio: 'ignore' });
  spawnSync('tmux', ['send-keys', '-t', target, 'Enter'], { stdio: 'ignore' });

  const lines = payload.split('\n');
  for (const line of lines) {
    const chunks = [];
    const chunkSize = 400;
    for (let index = 0; index < line.length; index += chunkSize) {
      chunks.push(line.slice(index, index + chunkSize));
    }
    if (chunks.length === 0) {
      spawnSync('tmux', ['send-keys', '-t', target, 'Enter'], { stdio: 'ignore' });
      continue;
    }
    for (const chunk of chunks) {
      spawnSync('tmux', ['send-keys', '-t', target, '-l', chunk], { stdio: 'ignore' });
    }
    spawnSync('tmux', ['send-keys', '-t', target, 'Enter'], { stdio: 'ignore' });
  }
  return true;
}

/**
 * Build activation prompt injected when operator wakes ZED from standby.
 * @param {string} [operatorMessage]
 * @returns {string}
 */
function buildZedActivationPrompt(operatorMessage = '') {
  const operatorLine = String(operatorMessage || '').trim();
  let presetBlock = '';
  try {
    const { formatZedOperatorPresetsForPrompt } = require('./zedOperatorPresets.cjs');
    presetBlock = `\n${formatZedOperatorPresetsForPrompt()}\n`;
  } catch {
    presetBlock = '';
  }
  const lines = [
    '=== ACTIVACION — el operador te da la palabra ===',
    '- Modo standby finalizado: podes usar DevHub MCP y delegar a workers.',
    '- Antes de decir "delegado": ejecuta `_devhub_chat` y reporta exit code + inbox_row_id del JSON de salida.',
    '- No afirmes que un worker esta trabajando sin ACK (`kind: ack`) en team_chat.',
    '- Usa DEVHUB_PROJECT_ID para MCP (get_project_context, list_tasks, update_task).',
    '- Tras delegar, si el worker queda en menu Gentle Orchestrator, inyecta presets B3, V3, C1, D2 via tmux.',
    presetBlock.trim(),
  ].filter(Boolean);
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
  waitForOpencodeReady,
  injectTextToTmuxSession,
};
