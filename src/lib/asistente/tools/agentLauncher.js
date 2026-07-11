/**
 * Agent launcher tools for Zed.
 *
 * Lets Zed open external agent sessions (OpenCode, Codex, Kimi, Hermes, Grok)
 * with a detailed prompt, using the existing agent launch command builder.
 */

import { buildAgentLaunchCommand } from '@/lib/agentLaunchCommand.shared';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import { zedLog } from '../utils/zed-logger';

/** Keep in sync with terminal.js AGENT_PROGRAMS and zedFastPath AGENT_PROGRAMS. */
const AGENT_PROGRAMS = new Set(['opencode', 'codex', 'hermes', 'kimi', 'grok']);

function normalizeProgram(program) {
  const p = typeof program === 'string' ? program.trim().toLowerCase() : '';
  return AGENT_PROGRAMS.has(p) ? p : null;
}

export const launchAgentSessionTool = {
  name: 'launch_agent_session',
  description:
    'Launch an external agent session (OpenCode, Codex, Kimi, Hermes, Grok) with a detailed prompt. The agent opens in a new workspace terminal panel.',
  parameters: {
    program: {
      type: 'string',
      description: 'Agent program to launch: opencode, codex, hermes, kimi, grok.',
    },
    prompt: {
      type: 'string',
      description:
        'Detailed prompt/context to pass to the agent. For Grok (interactive TUI), the prompt is reserved for a follow-up inject; the launch starts the TUI.',
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
    // Grok Build is interactive-first (no --prompt flag in buildAgentLaunchCommand).
    // Allow empty prompt so "abre grok" / launch_agent_session:grok still works.
    if (!prompt && program !== 'grok') {
      return { error: 'missing_prompt', message: 'Se requiere un prompt detallado.' };
    }

    try {
      // Grok: interactive TUI only. Other agents: pass prompt into the launch CLI.
      const interactiveBootstrapPrompt = program === 'grok';
      const command = buildAgentLaunchCommand(program, prompt || '', {
        opencodeAgent: DEFAULT_OPENCODE_AGENT,
        cwd: params?.cwd || process.cwd(),
        disableTmuxWrap: true,
        interactiveBootstrapPrompt,
      });

      zedLog.info('TOOL', 'launch_agent_session', {
        program,
        promptLen: prompt.length,
        commandPreview: String(command).slice(0, 160),
      });

      const result = {
        opened: true,
        workspace: true,
        program,
        command_sent: command,
        displayName: params?.name || null,
        hint: 'Agent session opens in a new workspace terminal panel.',
      };
      // Surface reserved prompt so the client/UI can inject after TUI ready (Grok).
      if (program === 'grok' && prompt) {
        result.bootstrap_input = prompt.endsWith('\n') ? prompt : `${prompt}\n`;
        result.note =
          'Grok TUI launched; bootstrap_input is the text to type after the session is ready.';
      }
      return result;
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
        'El lanzamiento de swarms por Zed aun no esta implementado. Usa launch_agent_session para agentes sueltos.',
    };
  },
};
