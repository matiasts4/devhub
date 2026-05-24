import { shellQuotePrompt } from '@/lib/docopsPrompts';

export const AGENT_PROGRAM_EXECUTABLES = Object.freeze({
  opencode: '/home/matias/.opencode/bin/opencode',
  codex: '/home/matias/.nvm/versions/node/v24.14.0/bin/codex',
  hermes: '/home/matias/.local/bin/hermes',
});

export function resolveAgentProgramExecutable(programId = 'hermes') {
  return AGENT_PROGRAM_EXECUTABLES[programId] || AGENT_PROGRAM_EXECUTABLES.hermes;
}

/**
 * Build a tmux-wrapped command for swarm agents.
 * The tmux session survives PTY death (page refresh, network drop).
 * Session name: devhub-swarm-{launchId}-{roleKey}
 * Status bar disabled to save vertical space.
 */
export function buildTmuxWrappedCommand(innerCommand, tmuxSessionName) {
  // Create session detached (-d) or reuse if exists (-A), then disable the
  // status bar before attaching. Semicolons ensure all steps run even when
  // new-session exits non-zero (e.g. session already exists).
  return [
    `tmux new-session -A -d -s "${tmuxSessionName}" '${innerCommand}' 2>/dev/null || true`,
    `tmux set-option -t "${tmuxSessionName}" status off 2>/dev/null || true`,
    `tmux attach-session -t "${tmuxSessionName}"`,
  ].join('; ');
}

export function buildAgentLaunchCommand(programId, prompt, options = {}) {
  const executable = resolveAgentProgramExecutable(programId);
  const quotedPrompt = shellQuotePrompt(prompt || '');
  const opencodeAgent = options.opencodeAgent || 'sdd-orchestrator';
  const modelId = options.modelId || null;
  const tmuxSessionName = options.tmuxSessionName || null;

  let innerCommand;
  switch (programId) {
    case 'codex':
      innerCommand = `${executable} exec --sandbox workspace-write ${quotedPrompt}`;
      break;
    case 'opencode': {
      innerCommand = modelId
        ? `${executable} --agent ${opencodeAgent} --prompt ${quotedPrompt} --model ${modelId}`
        : `${executable} --agent ${opencodeAgent} --prompt ${quotedPrompt}`;
      break;
    }
    case 'hermes':
    default:
      innerCommand = `${executable} chat -q ${quotedPrompt}`;
      break;
  }

  // Wrap in tmux if session name provided (swarm resilience)
  if (tmuxSessionName) {
    return buildTmuxWrappedCommand(innerCommand, tmuxSessionName);
  }

  return innerCommand;
}
