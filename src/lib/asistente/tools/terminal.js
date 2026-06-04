// Terminal tools for the ZED workspace assistant. Visible terminals are opened
// by the UI (same panel type as Split right / +), not via a headless POST PTY.

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

const AGENT_PROGRAMS = new Set(['opencode', 'codex', 'hermes']);

export const terminalTool = {
  name: 'open_terminal',
  description:
    'Open a new workspace terminal panel (same shell as manual split) and optionally run a command visibly. Pass program=opencode (or codex/hermes) only when the user explicitly asks to launch that agent TUI in the new visible terminal; the tool will build the proper launch command.',
  parameters: {
    program: {
      type: 'string',
      description: 'Agent program to launch in the terminal (opencode, codex, hermes). Only when user explicitly requests the TUI. The tool will compute the correct command.',
    },
    cwd: { type: 'string', description: 'Working directory' },
    command: {
      type: 'string',
      description: 'Command to execute immediately after opening the terminal (for normal shells). When program=agent is used, this is usually omitted and the tool provides the launch command.',
    },
  },
  async execute(params /* , context */) {
    const { program, cwd, command } = params || {};
    const normalizedProgram = typeof program === 'string' ? program.trim().toLowerCase() : '';

    let effectiveCommand = command;

    if (normalizedProgram && AGENT_PROGRAMS.has(normalizedProgram)) {
      // Support explicit launch of agent TUIs in a visible workspace terminal.
      // Build the inner launch command (no tmux wrapper, so it runs inside the panel's shell).
      try {
        const { buildAgentLaunchCommand } = await import('../../agentLaunchCommand.shared.js');
        effectiveCommand = buildAgentLaunchCommand(normalizedProgram, '', {
          opencodeAgent: 'sdd-orchestrator',
          cwd: cwd || process.cwd(),
          disableTmuxWrap: true,
          interactiveBootstrapPrompt: true,
          // No prompt → launches the interactive TUI / chat
        });
        zedLog.info('TOOL', 'open_terminal (agent TUI via launch command)', { program: normalizedProgram, effectiveCommand: effectiveCommand?.slice(0, 120) });
      } catch (e) {
        return {
          error: `Could not build launch command for program=${normalizedProgram}: ${e?.message || e}`,
        };
      }
    }

    zedLog.info('TOOL', 'open_terminal (workspace UI)', { cwd, command: effectiveCommand || command });

    const result = {
      opened: true,
      workspace: true,
      cwd: cwd || null,
      hint: 'Terminal opens in the workspace UI. Call list_terminals afterward to get terminalId for execute_in_terminal.',
    };
    const cmdToReport = effectiveCommand || command;
    if (cmdToReport) {
      result.command_sent = cmdToReport;
      result.command = cmdToReport;
    } else {
      result.note =
        "Terminal will open empty. To run a command, pass command='<your command>' or call execute_in_terminal after list_terminals.";
    }
    if (normalizedProgram) {
      result.program = normalizedProgram;
      result.note = `Will launch ${normalizedProgram} TUI in the visible panel.`;
    }
    return result;
  },
};

export const listTerminalsTool = {
  name: 'list_terminals',
  description: 'List active terminal sessions visible in the workspace. Sources: sidecar PTYs (main Tauri-visible panels for shells and agent TUIs like OpenCode/Hermes), ttyServer tracked sessions, and tmux discovery fallback. Use the terminalId values with review_terminal_output to read their current contents/scrollback, or execute_in_terminal to send input to controllable ones.',
  parameters: {},
  async execute(/* params, context */) {
    zedLog.info('TOOL', 'list_terminals', {});
    const baseUrl = getBaseUrl();
    let processes = [];
    try {
      const response = await fetch(`${baseUrl}/api/terminal/processes`);
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        processes = data.processes || [];
      }
    } catch (err) {
      // fall through to tmux discovery
    }

    // Enrich with tmux sessions (visible in workspace, often host the orchestrator/OpenCode/etc.)
    // This makes list_terminals truthful even for terminals not created via the Zed open_terminal path
    // or when a TUI (OpenCode) takes over the PTY and the internal tracker drops it.
    try {
      const { execSync } = await import('child_process');
      const tmuxOut = execSync(
        'tmux list-sessions -F "#{session_name}:#{session_created}:#{session_attached}" 2>/dev/null || true',
        { encoding: 'utf8', timeout: 1200 }
      ).trim();
      if (tmuxOut) {
        const discovered = tmuxOut
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [name, created, attached] = line.split(':');
            return {
              terminalId: `tmux:${name}`,
              type: 'tmux',
              title: name,
              createdAt: created || null,
              attached: attached === '1',
              cwd: null,
            };
          })
          .filter((t) => !processes.some((p) => p.terminalId === t.terminalId || p.id === t.terminalId));
        processes = [...processes, ...discovered];
      }
    } catch {
      // tmux not available or no sessions — fine, we still return whatever the API gave
    }

    return { processes };
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

export const executeInTerminalTool = {
  name: 'execute_in_terminal',
  description:
    'Send input (keystrokes) to a running terminal session. session_id is the terminalId from list_terminals (e.g. p2), not a term-* orphan id.',
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
      const base = await response.json().catch(() => ({ session_id, sent: true }));

      // Observability boost (point 3): immediately capture recent output so the
      // model sees what the command produced without needing an explicit extra
      // review_terminal_output turn in most cases. The visible terminal is still
      // the source of truth for the user.
      try {
        const capRes = await fetch(
          `${baseUrl}/api/terminal/session/${encodeURIComponent(session_id)}/capture`
        );
        if (capRes.ok) {
          const cap = await capRes.json().catch(() => ({}));
          if (cap && cap.output) {
            base.recent_output = String(cap.output).slice(-2000);
          }
        }
      } catch {
        // best-effort only; model can still call review_terminal_output for full/current
      }

      return base;
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