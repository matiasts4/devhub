// Terminal tools for the ZED chat route. Five tools backed by HTTP calls to
// the local Next API routes:
//
//   open_terminal             POST /api/terminal/session
//   list_terminals            GET  /api/terminal/processes
//   review_terminal_output    GET  /api/terminal/session/:id/capture
//   execute_in_terminal       PUT  /api/terminal/session/:id/input
//   close_terminal            (no HTTP; uses closeTerminalSessionById)
//
// close_terminal is the only one that mutates state directly — see T-005b
// for that implementation. This file is split across two commits so each
// stays under the 130-line pre-commit gate.

import { zedLog } from '../utils/zed-logger';

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3100';
}

function requireParam(params, name) {
  const v = params?.[name];
  if (v === undefined || v === null || v === '') {
    return { error: `missing required parameter: ${name}` };
  }
  return null;
}

export const terminalTool = {
  name: 'open_terminal',
  description:
    'Open a new PTY terminal session and optionally run a command. Returns the session id, port, and websocket path.',
  parameters: {
    program: {
      type: 'string',
      description: 'Program to run: opencode, codex, hermes, or leave empty for shell',
    },
    cwd: { type: 'string', description: 'Working directory' },
    command: {
      type: 'string',
      description: 'Command to execute immediately after opening the terminal',
    },
  },
  async execute(params /* , context */) {
    const { program, cwd, command } = params || {};
    zedLog.info('TOOL', 'open_terminal', { program, cwd, command });

    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/terminal/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(command !== undefined ? { command } : {}),
        ...(program !== undefined ? { program } : {}),
        ...(cwd !== undefined ? { cwd } : {}),
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      zedLog.error('TOOL', 'open_terminal FAILED', { status: response.status, errText });
      return {
        error: `Failed to open terminal: ${response.statusText || errText || response.status}`,
      };
    }

    const data = await response.json().catch(() => ({}));
    // Backend returns `id`; we normalize to `session_id` per the spec.
    const session_id = data.id || data.session_id;
    const { port, wsPath } = data;
    if (!session_id || port === undefined || !wsPath) {
      return {
        error: 'terminal session response missing required fields',
        raw: data,
      };
    }
    // T-026: surface to the model whether a command was actually sent.
    // Without this signal, the model only sees a port+wsPath and may
    // hallucinate success when no command ever ran.
    const result = { session_id, port, wsPath };
    if (command) {
      result.command_sent = command;
    } else {
      result.note =
        "Terminal opened but no command was sent. To run a command, pass command='<your command>' or call execute_in_terminal after opening.";
    }
    return result;
  },
};

export const listTerminalsTool = {
  name: 'list_terminals',
  description: 'List the active terminal sessions tracked by the local server.',
  parameters: {},
  async execute(/* params, context */) {
    zedLog.info('TOOL', 'list_terminals', {});
    const baseUrl = getBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/terminal/processes`);
      if (!response.ok) {
        return { error: `Failed to list terminals: ${response.status}` };
      }
      const data = await response.json().catch(() => ({}));
      return { processes: data.processes || [] };
    } catch (err) {
      return { error: `Failed to list terminals: ${err.message}` };
    }
  },
};

export const reviewTerminalTool = {
  name: 'review_terminal_output',
  description: 'Read the recent output buffer of a terminal session.',
  parameters: {
    session_id: { type: 'string', required: true },
  },
  async execute(params /* , context */) {
    const guard = requireParam(params, 'session_id');
    if (guard) return guard;

    const { session_id } = params;
    zedLog.info('TOOL', 'review_terminal_output', { session_id });
    const baseUrl = getBaseUrl();
    try {
      const response = await fetch(
        `${baseUrl}/api/terminal/session/${encodeURIComponent(session_id)}/capture`
      );
      if (!response.ok) {
        return { error: `Failed to capture output: ${response.status}` };
      }
      const data = await response.json().catch(() => ({}));
      return { output: data.output || '', session_id };
    } catch (err) {
      return { error: `Failed to capture output: ${err.message}` };
    }
  },
};

// T-005b: real implementations of execute_in_terminal and close_terminal.
export const executeInTerminalTool = {
  name: 'execute_in_terminal',
  description: 'Send input (keystrokes) to a running terminal session.',
  parameters: {
    session_id: { type: 'string', required: true },
    input: { type: 'string', required: true },
  },
  async execute(params /* , context */) {
    const guardSession = requireParam(params, 'session_id');
    if (guardSession) return guardSession;
    const guardInput = requireParam(params, 'input');
    if (guardInput) return guardInput;

    const { session_id, input } = params;
    zedLog.info('TOOL', 'execute_in_terminal', {
      session_id,
      inputLen: String(input).length,
    });
    const baseUrl = getBaseUrl();
    try {
      const response = await fetch(
        `${baseUrl}/api/terminal/session/${encodeURIComponent(session_id)}/input`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: input }),
        }
      );
      if (!response.ok) {
        return { error: `Failed to send input: ${response.status}` };
      }
      return await response.json().catch(() => ({ session_id, sent: true }));
    } catch (err) {
      return { error: `Failed to send input: ${err.message}` };
    }
  },
};

export const closeTerminalTool = {
  name: 'close_terminal',
  description:
    'Close a terminal session. Destructive — requires explicit confirm: true. Without confirm, returns a dry-run preview.',
  parameters: {
    session_id: { type: 'string', required: true },
    confirm: { type: 'boolean' },
  },
  async execute(params /* , context */) {
    const guard = requireParam(params, 'session_id');
    if (guard) return guard;

    const { session_id, confirm } = params;
    zedLog.info('TOOL', 'close_terminal', { session_id, confirm });

    if (confirm !== true) {
      return {
        action: 'would close',
        session_id,
        hint: 'call again with confirm: true to actually close the session',
      };
    }

    const { closeTerminalSessionById } = await import('@/lib/terminal/closeTerminalSession');
    try {
      return await closeTerminalSessionById(session_id);
    } catch (err) {
      return { error: err.message, status: err.status || 500 };
    }
  },
};
