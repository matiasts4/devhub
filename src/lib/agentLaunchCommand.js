import { shellQuotePrompt } from '@/lib/docopsPrompts';

export const AGENT_PROGRAM_EXECUTABLES = Object.freeze({
  opencode: '/home/matias/.opencode/bin/opencode',
  codex: '/home/matias/.nvm/versions/node/v24.14.0/bin/codex',
  hermes: '/home/matias/.local/bin/hermes',
});

export function resolveAgentProgramExecutable(programId = 'hermes') {
  return AGENT_PROGRAM_EXECUTABLES[programId] || AGENT_PROGRAM_EXECUTABLES.hermes;
}

export function buildAgentLaunchCommand(programId, prompt, options = {}) {
  const executable = resolveAgentProgramExecutable(programId);
  const quotedPrompt = shellQuotePrompt(prompt || '');
  const opencodeAgent = options.opencodeAgent || 'sdd-orchestrator';

  switch (programId) {
    case 'codex':
      return `${executable} exec --sandbox workspace-write ${quotedPrompt}`;
    case 'opencode':
      return `${executable} --agent ${opencodeAgent} --prompt ${quotedPrompt}`;
    case 'hermes':
    default:
      return `${executable} chat -q ${quotedPrompt}`;
  }
}
