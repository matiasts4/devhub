/**
 * Agent launcher tools for Zed.
 *
 * Lets Zed open external agent sessions (OpenCode, Codex, Kimi, Hermes) with a
 * detailed prompt, using the existing agent launch command builder.
 */

import { buildAgentLaunchCommand } from '@/lib/agentLaunchCommand.shared';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import { zedLog } from '../utils/zed-logger';

const AGENT_PROGRAMS = new Set(['opencode', 'codex', 'hermes', 'kimi', 'grok']);

function normalizeProgram(program) {
  const p = typeof program === 'string' ? program.trim().toLowerCase() : '';
  return AGENT_PROGRAMS.has(p) ? p : null;
}

export const launchAgentSessionTool = {
  name: 'launch_agent_session',
  description:
    'Launch an external agent session (OpenCode, Codex, Kimi, Hermes) with a detailed prompt. The agent opens in a new workspace terminal panel.',
  parameters: {
    program: {
      type: 'string',
      description: 'Agent program to launch: opencode, codex, hermes, kimi.',
    },
    prompt: {
      type: 'string',
      description: 'Detailed prompt/context to pass to the agent.',
    },
    cwd: { type: 'string', description: 'Working directory (optional).' },
    name: { type: 'string', description: 'Optional display name for the new terminal panel.' },
  },
  async execute(params) {
    const program = normalizeProgram(params?.program);
    if (!program) {
      return { error: 'invalid_program', message: `Programa no soportado: ${params?.program}` };
    }

    const prompt = typeof params?.prompt === 'string' ? params.prompt.trim() : '';
    if (!prompt) {
      return { error: 'missing_prompt', message: 'Se requiere un prompt detallado.' };
    }

    try {
      const command = buildAgentLaunchCommand(program, prompt, {
        opencodeAgent: DEFAULT_OPENCODE_AGENT,
        cwd: params?.cwd || process.cwd(),
        disableTmuxWrap: true,
        interactiveBootstrapPrompt: false,
      });

      zedLog.info('TOOL', 'launch_agent_session', { program, promptLen: prompt.length });

      return {
        opened: true,
        workspace: true,
        program,
        command_sent: command,
        displayName: params?.name || null,
        hint: 'Agent session opens in a new workspace terminal panel.',
      };
    } catch (error) {
      return { error: `Failed to build launch command: ${error.message}` };
    }
  },
};

export const launchSwarmTool = {
  name: 'launch_swarm',
  description:
    'Launch a local swarm of agents with a draft configuration. (Placeholder — full swarm launch requires additional workspace integration.)',
  parameters: {
    draft: {
      type: 'object',
      description: 'Swarm draft with roles and prompts.',
    },
  },
  async execute(params) {
    const draft = params?.draft || {};
    zedLog.info('TOOL', 'launch_swarm', { draft });
    return {
      success: false,
      error: 'not_implemented',
      message:
        'El lanzamiento de swarms por Zed aún no está implementado. Usá launch_agent_session para agentes sueltos.',
    };
  },
};
