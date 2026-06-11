import { execSync } from 'node:child_process';
import { buildAgentLaunchCommand } from '../../agentLaunchCommand';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import { zedLog } from '../utils/zed-logger';

export const delegationTool = {
  name: 'delegate_to_opencode',
  description:
    'Delegate a task to OpenCode. Creates a tmux session with OpenCode and injects the task.',
  parameters: {
    task: { type: 'string', required: true, description: 'Task description to delegate' },
    agent: {
      type: 'string',
      default: 'gentle-orchestrator',
      description:
        'OpenCode agent profile: gentle-orchestrator (SDD worker) or zed-orchestrator (ZED pod coordinator)',
    },
    cwd: { type: 'string', description: 'Working directory' },
  },
  async execute(params, context) {
    const { task, agent = DEFAULT_OPENCODE_AGENT, cwd = process.cwd() } = params;
    const sessionId = `zed-delegation-${Date.now()}`;

    zedLog.info('TOOL', 'delegate_to_opencode', { task, agent, cwd, sessionId });

    const command = buildAgentLaunchCommand('opencode', task, {
      opencodeAgent: agent,
      cwd,
      disableTmuxWrap: false,
    });

    const tmuxSession = `devhub-zed-delegation-${sessionId}`;
    const tmuxCmd = `tmux new-session -d -s ${tmuxSession} "cd ${cwd} && ${command}"`;

    try {
      execSync(tmuxCmd, { stdio: 'ignore' });
    } catch (_err) {
      // tmux may be unavailable; delegation metadata is still returned.
    }

    return {
      session_id: sessionId,
      tmux_session: tmuxSession,
      task,
      agent,
      message: `Delegated task to OpenCode in session ${sessionId}`,
    };
  },
};
