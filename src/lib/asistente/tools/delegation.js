import { buildAgentLaunchCommand } from '../../agentLaunchCommand'
import { zedLog } from '../utils/zed-logger'

export const delegationTool = {
  name: 'delegate_to_opencode',
  description: 'Delegate a task to OpenCode. Creates a tmux session with OpenCode and injects the task.',
  parameters: {
    task: { type: 'string', required: true, description: 'Task description to delegate' },
    agent: { type: 'string', default: 'sdd-orchestrator', description: 'Agent profile to use' },
    cwd: { type: 'string', description: 'Working directory' }
  },
  async execute(params, context) {
    const { task, agent = 'sdd-orchestrator', cwd = process.cwd() } = params
    const sessionId = `zed-delegation-${Date.now()}`

    zedLog.info('TOOL', 'delegate_to_opencode', { task, agent, cwd, sessionId })

    const command = buildAgentLaunchCommand('opencode', task, {
      opencodeAgent: agent,
      cwd,
      disableTmuxWrap: false,
    })

    const tmuxSession = `devhub-zed-delegation-${sessionId}`
    const tmuxCmd = `tmux new-session -d -s ${tmuxSession} "cd ${cwd} && ${command}"`

    try {
      require('child_process').execSync(tmuxCmd, { stdio: 'ignore' })
    } catch {}

    return {
      session_id: sessionId,
      tmux_session: tmuxSession,
      task,
      agent,
      message: `Delegated task to OpenCode in session ${sessionId}`
    }
  }
}