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
    return { session_id, port, wsPath };
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

// Stubs — implemented in T-005b. They exist as exports so the route's import
// doesn't break between T-005a and T-005b.
export const executeInTerminalTool = {
  name: 'execute_in_terminal',
  description: 'Send input to a running terminal session. Implemented in T-005b.',
  parameters: {
    session_id: { type: 'string', required: true },
    input: { type: 'string', required: true },
  },
  async execute() {
    return { error: 'execute_in_terminal not yet wired (T-005b)' };
  },
};

export const closeTerminalTool = {
  name: 'close_terminal',
  description: 'Close a terminal session (confirm-mode). Implemented in T-005b.',
  parameters: {
    session_id: { type: 'string', required: true },
    confirm: { type: 'boolean' },
  },
  async execute() {
    return { error: 'close_terminal not yet wired (T-005b)' };
  },
};
