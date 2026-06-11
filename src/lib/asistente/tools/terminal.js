// Terminal tools for the ZED workspace assistant. Visible terminals are opened
// by the UI (same panel type as Split right / +), not via a headless POST PTY.

import {
  MAX_ZED_TERMINAL_PANELS,
  buildTerminalPanelLimitError,
  isWorkspaceTerminalPanelLimitReached,
  resolveEffectiveTerminalPanelCount,
} from '@/lib/terminal/workspaceTerminalLimits';
import { evaluateZedCommandExecution } from '../zedCommandPolicy';
import { DEFAULT_OPENCODE_AGENT } from '@/lib/opencodeAgentDefaults';
import { zedLog } from '../utils/zed-logger';
import { nameFromId, resolveTerminalByName } from '../zedTerminalResolver';
import { acquire as acquireDisplayName, DISPLAY_NAME_POOL } from '@/lib/terminal/displayNamePool';
import { formatZedToolError } from '../zedChat/errors';

function guardZedTerminalCommand(command, confirm, context, sourceTool) {
  const decision = evaluateZedCommandExecution({ command, confirm, context });
  if (decision.allowed) return null;
  zedLog.info('TOOL', `${sourceTool} blocked by command policy`, {
    error: decision.error,
    command: decision.command,
    reason: decision.reason,
  });
  return decision;
}

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
    'Open a new workspace terminal panel (same shell as manual split) and optionally run a command visibly. Maximum 6 terminal panels per workspace (OpenCode, Codex, Hermes, shells, etc.). If the limit is reached, returns terminal_panel_limit_reached — use list_terminals and close_terminal instead of opening more. Pass program=opencode (or codex/hermes) only when the user explicitly asks to launch that agent TUI in the new visible terminal; the tool will build the proper launch command. Optional `name` reserves a displayName from the pool and is returned in the response so the model can immediately target the new panel via `name` (ZTT-003).',
  parameters: {
    name: {
      type: 'string',
      description:
        'Optional display name to assign to the new panel (e.g. "Chase"). The tool mints a terminalId and reserves this name; the response includes both.',
    },
    program: {
      type: 'string',
      description: 'Agent program to launch in the terminal (opencode, codex, hermes). Only when user explicitly requests the TUI. The tool will compute the correct command.',
    },
    cwd: { type: 'string', description: 'Working directory' },
    command: {
      type: 'string',
      description: 'Command to execute immediately after opening the terminal (for normal shells). When program=agent is used, this is usually omitted and the tool provides the launch command.',
    },
    confirm: {
      type: 'boolean',
      description:
        'Required true to run commands that are not on the auto-allowlist (e.g. npm install). Destructive commands (rm, git reset --hard, sudo, etc.) are always blocked.',
    },
  },
  async execute(params, context = {}) {
    const { name: requestedName, program, cwd, command, confirm } = params || {};
    const normalizedProgram = typeof program === 'string' ? program.trim().toLowerCase() : '';
    const maxPanels = Number(context?.max_terminal_panels) || MAX_ZED_TERMINAL_PANELS;
    const effectivePanelCount = resolveEffectiveTerminalPanelCount(context);

    if (isWorkspaceTerminalPanelLimitReached(effectivePanelCount, maxPanels)) {
      const limitError = buildTerminalPanelLimitError(effectivePanelCount, maxPanels);
      zedLog.info('TOOL', 'open_terminal blocked (panel limit)', limitError);
      return limitError;
    }

    if (context && typeof context === 'object') {
      context._terminal_opens_this_request =
        (Number(context._terminal_opens_this_request) || 0) + 1;
    }

    let effectiveCommand = command;

    if (normalizedProgram && AGENT_PROGRAMS.has(normalizedProgram)) {
      // Support explicit launch of agent TUIs in a visible workspace terminal.
      // Build the inner launch command (no tmux wrapper, so it runs inside the panel's shell).
      try {
        const { buildAgentLaunchCommand } = await import('../../agentLaunchCommand.shared.js');
        effectiveCommand = buildAgentLaunchCommand(normalizedProgram, '', {
          opencodeAgent: DEFAULT_OPENCODE_AGENT,
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

    const cmdToRun = effectiveCommand || command;
    const skipPolicyForAgentTui = Boolean(normalizedProgram && AGENT_PROGRAMS.has(normalizedProgram));
    if (cmdToRun && !skipPolicyForAgentTui) {
      const policyBlock = guardZedTerminalCommand(cmdToRun, confirm, context, 'open_terminal');
      if (policyBlock) return policyBlock;
    }

    zedLog.info('TOOL', 'open_terminal (workspace UI)', { cwd, command: cmdToRun, name: requestedName });

    // T-103 / ZTT-003: when the model passes `name`, reserve that displayName
    // from the pool against the current activeNames, mint a fresh terminalId,
    // and return the canonical { terminalId, displayName, … } shape so
    // downstream tools can target the new panel by name without re-resolving.
    let terminalId = null;
    let displayName = null;
    if (typeof requestedName === 'string' && requestedName.trim()) {
      const cleanName = requestedName.trim();
      // Pool helper: picks the name unless already in use; falls back to
      // "Panel-N" when the requested name is not in the canonical pool.
      const reserved = acquireDisplayName([...DISPLAY_NAME_POOL, cleanName]);
      displayName = reserved;
      terminalId = mintTerminalId();
      // If the model asked for a custom name not in the pool, preserve it
      // exactly. acquire() returns "Panel-N" for unknown names; detect that
      // case and use the requested name as-is (the model wanted that name).
      if (cleanName && !DISPLAY_NAME_POOL.includes(reserved) && reserved.startsWith('Panel-')) {
        displayName = cleanName;
      }
    } else {
      // No name provided: still mint an id and resolve a name from the pool
      // so the model can chain a follow-up execute by name if needed.
      terminalId = mintTerminalId();
      displayName = acquireDisplayName([]);
    }

    const result = {
      opened: true,
      workspace: true,
      cwd: cwd || null,
      terminalId,
      displayName,
      hint: 'Terminal opens in the workspace UI. Use list_terminals to refresh the live id, or call execute_in_terminal / summarize_terminal with this `name` immediately.',
    };
    const cmdToReport = cmdToRun;
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

    return { processes: augmentDisplayNames(processes) };
  },
};

// T-101 / ZTT-002: every entry MUST carry a non-empty `displayName`. If the
// upstream API omits the field, derive one from the terminalId via
// nameFromId so the model never sees `undefined`. Mutates the array in place
// (a fresh local copy) and returns it.
function augmentDisplayNames(processes) {
  if (!Array.isArray(processes)) return processes;
  return processes.map((p) => {
    if (!p || typeof p !== 'object') return p;
    if (typeof p.displayName === 'string' && p.displayName.length > 0) return p;
    return { ...p, displayName: nameFromId(p.terminalId) };
  });
}

// T-103 / ZTT-003: when the model passes `name` to open_terminal, we mint a
// fresh terminalId (p1, p2, …) and lock that displayName to it. The pool
// helper handles the dedup against the current set of active names.
// Module-local counter so each open_terminal call mints a unique id.
let _nextTerminalId = 0;
function mintTerminalId() {
  _nextTerminalId += 1;
  return `p${_nextTerminalId}`;
}
function _resetOpenTerminalCounterForTests() {
  _nextTerminalId = 0;
}

// Exposed for test isolation.
export { _resetOpenTerminalCounterForTests, _nextTerminalId };

// T-104 / ZTT-004: the three session-targeting tools (execute_in_terminal,
// review_terminal_output, close_terminal) accept `name XOR session_id`.
// `name` triggers a resolver lookup over /api/terminal/processes first;
// setting both MUST short-circuit with a Spanish both_name_and_session
// error before any HTTP call.


async function resolveSessionIdFromNameOrId(toolName, params) {
  const name = typeof params?.name === 'string' && params.name.trim()
    ? params.name.trim()
    : null;
  const sessionId = typeof params?.session_id === 'string' && params.session_id.trim()
    ? params.session_id.trim()
    : null;

  if (name && sessionId) {
    return {
      error: {
        code: 'both_name_and_session',
        ...formatZedToolError(toolName, { code: 'both_name_and_session' }),
      },
    };
  }
  if (!name && !sessionId) {
    return {
      error: {
        code: 'missing required parameter: session_id',
        message: 'name or session_id required',
      },
    };
  }
  if (sessionId) {
    return { sessionId, displayName: null, resolved: 'session_id' };
  }
  // name-only: resolve via /api/terminal/processes.
  const baseUrl = getBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/terminal/processes`, { cache: 'no-store' });
    if (!res.ok) {
      return {
        error: { code: 'not_found', ...formatZedToolError(toolName, { code: 'not_found' }) },
      };
    }
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data?.processes) ? data.processes : [];
    const lookup = resolveTerminalByName(name, list);
    if (!lookup.ok) {
      return {
        error: { code: lookup.code, ...formatZedToolError(toolName, lookup) },
      };
    }
    return { sessionId: lookup.terminalId, displayName: lookup.displayName, resolved: 'name' };
  } catch (err) {
    return { error: { code: 'not_found', message: err.message } };
  }
}

export const reviewTerminalTool = {
  name: 'review_terminal_output',
  description:
    'Read the recent output buffer of a terminal session. Pass `name` (display name) OR `session_id` (terminalId). Setting both returns a Spanish error before any HTTP call.',
  parameters: {
    name: {
      type: 'string',
      description: 'Display name (e.g. "Chase"). Mutually exclusive with session_id.',
    },
    session_id: { type: 'string', required: true },
  },
  async execute(params /* , context */) {
    const lookup = await resolveSessionIdFromNameOrId('review_terminal_output', params);
    if (lookup.error) {
      return { error: lookup.error.code, message: lookup.error.message };
    }
    const session_id = lookup.sessionId;

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
    'Send input (keystrokes) to a running terminal session. Pass `name` (display name) OR `session_id` (terminalId) — never both. session_id is the terminalId from list_terminals (e.g. p2), not a term-* orphan id. Destructive commands are blocked; uncommon commands need confirm: true after user approval.',
  parameters: {
    name: {
      type: 'string',
      description: 'Display name (e.g. "Chase"). Mutually exclusive with session_id.',
    },
    session_id: { type: 'string', required: true },
    input: { type: 'string', required: true },
    confirm: {
      type: 'boolean',
      description:
        'Required true for commands outside the auto-allowlist. Destructive commands are always blocked.',
    },
  },
  async execute(params, context = {}) {
    const lookup = await resolveSessionIdFromNameOrId('execute_in_terminal', params);
    if (lookup.error) {
      return { error: lookup.error.code, message: lookup.error.message };
    }
    const session_id = lookup.sessionId;
    const guardInput = requireParam(params, 'input');
    if (guardInput) return guardInput;

    const { input, confirm } = params;
    const policyBlock = guardZedTerminalCommand(input, confirm, context, 'execute_in_terminal');
    if (policyBlock) return policyBlock;

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
    'Close a terminal session. Pass `name` (display name) OR `session_id` (terminalId) — never both. Destructive — requires explicit confirm: true. Without confirm, returns a dry-run preview.',
  parameters: {
    name: {
      type: 'string',
      description: 'Display name (e.g. "Chase"). Mutually exclusive with session_id.',
    },
    session_id: { type: 'string', required: true },
    confirm: { type: 'boolean' },
  },
  async execute(params /* , context */) {
    const lookup = await resolveSessionIdFromNameOrId('close_terminal', params);
    if (lookup.error) {
      return { error: lookup.error.code, message: lookup.error.message };
    }
    const session_id = lookup.sessionId;
    const { confirm } = params;

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