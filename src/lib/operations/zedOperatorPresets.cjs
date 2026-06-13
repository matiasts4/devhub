/* eslint-env node */
'use strict';

const DEFAULT_ZED_OPERATOR_PRESETS = Object.freeze({
  gentleOrchestratorMenu: Object.freeze({
    acting: 'B3',
    version: 'V3',
    gitPr: 'C1',
    revision: 'D2',
  }),
  gitParallelAgents: Object.freeze({
    stayOnSharedBranch: true,
    singlePrPerChange: true,
    rationale:
      'Agents en paralelo comparten rama; cambiar de rama por worker rompe visibilidad de cambios cruzados.',
  }),
  sddAutopilot: Object.freeze({
    autoAnswerSetupMenus: true,
    autoContinueBeforeApply: true,
    continueCommand: '/sdd-continue',
    applyCommand: '/sdd-apply',
  }),
});

function formatZedOperatorPresetsForPrompt(presets = DEFAULT_ZED_OPERATOR_PRESETS) {
  const menu = presets.gentleOrchestratorMenu;
  const git = presets.gitParallelAgents;
  const sdd = presets.sddAutopilot;

  return [
    '=== Presets del operador (autopilot) ===',
    '- Si un SDD Worker muestra menu de configuracion Gentle Orchestrator, responde SIN esperar al humano:',
    `  · Acting: ${menu.acting} (automatico)`,
    `  · Version: ${menu.version}`,
    `  · Git/PR: ${menu.gitPr} (misma rama compartida, PR unica — ${git.rationale})`,
    `  · Revision: ${menu.revision}`,
    '- Inyeccion tmux (mismo orden):',
    `  tmux send-keys -t <tmux_session> -l '${menu.acting}' Enter`,
    `  tmux send-keys -t <tmux_session> -l '${menu.version}' Enter`,
    `  tmux send-keys -t <tmux_session> -l '${menu.gitPr}' Enter`,
    `  tmux send-keys -t <tmux_session> -l '${menu.revision}' Enter`,
    '- Si el worker se detiene antes de apply pidiendo confirmacion y el plan sigue vigente:',
    `  inyecta ${sdd.continueCommand} o confirma ${sdd.applyCommand} (no esperes al operador salvo blocker real).`,
    '- Tras delegar, monitorea inbox ACK y estado del worker; si queda idle en menu >30s, aplica los presets.',
  ].join('\n');
}

function formatOperatorPresetsForWorkerDirective(presets = DEFAULT_ZED_OPERATOR_PRESETS) {
  const menu = presets.gentleOrchestratorMenu;
  return [
    '',
    '=== Config operador (menus SDD) ===',
    `Si aparece wizard Gentle Orchestrator: ${menu.acting}, ${menu.version}, ${menu.gitPr}, ${menu.revision} (en ese orden).`,
    'Git: misma rama compartida, PR unica (agents en paralelo).',
    'Si pide confirmacion antes de apply y no hay blocker: /sdd-continue o procede con apply.',
  ].join('\n');
}

module.exports = {
  DEFAULT_ZED_OPERATOR_PRESETS,
  formatZedOperatorPresetsForPrompt,
  formatOperatorPresetsForWorkerDirective,
};
