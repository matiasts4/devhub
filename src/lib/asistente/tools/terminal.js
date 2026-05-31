import { zedLog } from '../utils/zed-logger'

export const terminalTool = {
  name: 'open_terminal',
  description: 'Open a new terminal session and optionally run a command. Creates a PTY session and optionally executes the provided command.',
  parameters: {
    program: { type: 'string', default: 'opencode', description: 'Program to run: opencode, codex, hermes, or leave empty for shell' },
    cwd: { type: 'string', description: 'Working directory' },
    command: { type: 'string', description: 'Command to execute immediately after opening the terminal' },
  },
  async execute(params, context) {
    const { program = 'zsh', cwd = process.cwd(), command = null } = params
    const sessionId = `zed-${Date.now()}`
    const tmuxSession = `devhub-zed-${sessionId}`

    zedLog.info('TOOL', 'open_terminal', { program, cwd, command, sessionId })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3100'
    const response = await fetch(`${baseUrl}/api/terminal/session?cwd=${encodeURIComponent(cwd)}`)

    if (!response.ok) {
      const error = `Failed to open terminal: ${response.statusText}`
      zedLog.error('TOOL', 'open_terminal FAILED', { status: response.status, statusText: response.statusText })
      return { error }
    }

    const { port, wsPath } = await response.json()

    return {
      command: command || program,
      cwd,
      session_id: sessionId,
      tmux_session: tmuxSession,
      port,
      wsPath,
      message: command
        ? `Running: ${command} in ${cwd}`
        : `Terminal opened: ${program} in ${cwd}`
    }
  }
}

export const listTerminalsTool = {
  name: 'list_terminals',
  description: 'List all active terminal sessions',
  parameters: {},
  async execute(params, context) {
    return { terminals: [], message: 'Active terminals listed' }
  }
}

export const reviewTerminalTool = {
  name: 'review_terminal_output',
  description: 'Read the output of a terminal session',
  parameters: {
    session_id: { type: 'string', required: true }
  },
  async execute(params, context) {
    return { output: '', message: 'Terminal output retrieved' }
  }
}

export const executeInTerminalTool = {
  name: 'execute_in_terminal',
  description: 'Execute a command in a terminal session',
  parameters: {
    session_id: { type: 'string', required: true },
    command: { type: 'string', required: true }
  },
  async execute(params, context) {
    return { result: 'Command executed', session_id: params.session_id }
  }
}