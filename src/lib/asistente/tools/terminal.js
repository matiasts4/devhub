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
import {
  buildZedTerminalCatalog,
  mergeWorkspaceTerminalProcesses,
  workspaceTerminalsFromContext,
} from '../workspaceTerminalRegistry';

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

/** Keep in sync with agentLauncher.js and zedFastPath.js AGENT_PROGRAMS. */
const AGENT_PROGRAMS = new Set(['opencode', 'codex', 'hermes', 'kimi', 'grok']);

export const terminalTool = {
  name: 'open_terminal',
  description:
    'Open a new workspace terminal panel (same shell as manual split) and optionally run a command visibly. Maximum 6 terminal panels per workspace (OpenCode, Codex, Hermes, Kimi, Grok, shells, etc.). If the limit is reached, returns terminal_panel_limit_reached — use list_terminals and close_terminal instead of opening more. Pass program=opencode (or codex/hermes/kimi/grok) only when the user explicitly asks to launch that agent TUI in the new visible terminal; the tool will build the proper launch command. Optional `name` reserves a displayName from the pool and is returned in the response so the model can immediately target the new panel via `name` (ZTT-003).',
  parameters: {
    name: {
      type: 'string',
      description:
        'Optional display name to assign to the new panel (e.g. "Chase"). The tool mints a terminalId and reserves this name; the response includes both.',
    },
    program: {
      type: 'string',
      description:
        'Agent program to launch in the terminal (opencode, codex, hermes, kimi, grok). Only when user explicitly requests the TUI. The tool will compute the correct command.',
    },
    cwd: { type: 'string', description: 'Working directory' },
    command: {
      type: 'string',
      description:
        'Command to execute immediately after opening the terminal (for normal shells). When program=agent is used, this is usually omitted and the tool provides the launch command.',
    },
    confirm: {
      type: 'boolean',
      description:
        'Required true to run commands that are not on the auto-allowlist (e.g. npm install). Destructive commands (rm, git reset --hard, sudo, etc.) are always blocked.',
    },
    prompt: {
      type: 'string',
      description:
        'Task text to paste into the agent TUI after it is ready (native paste). Prefer this over embedding text in command. Alias of bootstrap_input.',
    },
    bootstrap_input: {
      type: 'string',
      description:
        'Reserved text pasted into the agent TUI after readiness (same as prompt). Not embedded in the launch command.',
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
        zedLog.info('TOOL', 'open_terminal (agent TUI via launch command)', {
          program: normalizedProgram,
          effectiveCommand: effectiveCommand?.slice(0, 120),
        });
      } catch (e) {
        return {
          error: `Could not build launch command for program=${normalizedProgram}: ${e?.message || e}`,
        };
      }
    }

    const cmdToRun = effectiveCommand || command;
    const skipPolicyForAgentTui = Boolean(
      normalizedProgram && AGENT_PROGRAMS.has(normalizedProgram)
    );
    if (cmdToRun && !skipPolicyForAgentTui) {
      const policyBlock = guardZedTerminalCommand(cmdToRun, confirm, context, 'open_terminal');
      if (policyBlock) return policyBlock;
    }

    zedLog.info('TOOL', 'open_terminal (workspace UI)', {
      cwd,
      command: cmdToRun,
      name: requestedName,
    });

    // T-103 / ZTT-003: when the model passes `name`, reserve that displayName
    // from the pool against the current activeNames, mint a fresh terminalId,
    // and return the canonical { terminalId, displayName, … } shape so
    // downstream tools can target the new panel by name without re-resolving.
    let terminalId = null;
    let displayName = null;
    if (typeof requestedName === 'string' && requestedName.trim()) {
      const cleanName = requestedName.trim();
      const clientTerminals = workspaceTerminalsFromContext(context);
      const merged = mergeWorkspaceTerminalProcesses(clientTerminals, []);
      const existing = resolveTerminalByName(cleanName, merged);
      if (existing.ok && normalizedProgram && AGENT_PROGRAMS.has(normalizedProgram)) {
        return {
          error: 'terminal_already_exists',
          message: `Ya existe el panel ${existing.displayName} (${existing.terminalId}). Usá execute_in_terminal con program="${normalizedProgram}" y name="${existing.displayName}" — no abras otro panel.`,
          terminalId: existing.terminalId,
          displayName: existing.displayName,
          hint: 'execute_in_terminal',
        };
      }
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
    // Task text for native post-ready paste (never embedded in command_sent).
    const bootstrapRaw =
      (typeof params?.bootstrap_input === 'string' && params.bootstrap_input.trim()
        ? params.bootstrap_input
        : null) ||
      (typeof params?.prompt === 'string' && params.prompt.trim() ? params.prompt : null);
    if (bootstrapRaw) {
      result.bootstrap_input = bootstrapRaw.endsWith('\n') ? bootstrapRaw : `${bootstrapRaw}\n`;
      result.note =
        `${result.note || ''} bootstrap_input reserved for native paste after TUI ready.`.trim();
    }
    return result;
  },
};

export const listTerminalsTool = {
  name: 'list_terminals',
  parallel: true,
  description:
    'List active terminal sessions visible in the workspace. Sources: sidecar PTYs (main Tauri-visible panels for shells and agent TUIs like OpenCode/Hermes), ttyServer tracked sessions, and tmux discovery fallback. Use the terminalId values with review_terminal_output to read their current contents/scrollback, or execute_in_terminal to send input to controllable ones.',
  parameters: {},
  async execute(_params, context = {}) {
    zedLog.info('TOOL', 'list_terminals', {});
    const baseUrl = getBaseUrl();
    const clientTerminals = workspaceTerminalsFromContext(context);
    let processes = [];
    try {
      const response = await fetch(`${baseUrl}/api/terminal/processes`);
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        processes = buildZedTerminalCatalog(context, data.processes || []);
      } else {
        processes = buildZedTerminalCatalog(context, []);
      }
    } catch (err) {
      processes = buildZedTerminalCatalog(context, []);
    }

    // Enrich with tmux sessions (visible in workspace, often host the orchestrator/OpenCode/etc.)
    // This makes list_terminals truthful even for terminals not created via the Zed open_terminal path
    // or when a TUI (OpenCode) takes over the PTY and the internal tracker drops it.
    // Skip under Jest so unit tests expecting empty processes are not polluted by live tmux.
    if (process.env.JEST_WORKER_ID !== undefined) {
      return { processes: augmentDisplayNames(processes) };
    }
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
          .filter(
            (t) => !processes.some((p) => p.terminalId === t.terminalId || p.id === t.terminalId)
          );
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

async function fetchTerminalProcessList(context) {
  const baseUrl = getBaseUrl();
  const clientTerminals = workspaceTerminalsFromContext(context);
  try {
    const res = await fetch(`${baseUrl}/api/terminal/processes`, { cache: 'no-store' });
    if (!res.ok) {
      return buildZedTerminalCatalog(context, []);
    }
    const data = await res.json().catch(() => ({}));
    return buildZedTerminalCatalog(context, data?.processes || []);
  } catch {
    return buildZedTerminalCatalog(context, []);
  }
}

async function resolveSessionIdFromNameOrId(toolName, params, context = {}, options = {}) {
  const { allowImplicitSingle = false } = options;
  const name = typeof params?.name === 'string' && params.name.trim() ? params.name.trim() : null;
  const sessionId =
    typeof params?.session_id === 'string' && params.session_id.trim()
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
    if (allowImplicitSingle) {
      try {
        const list = await fetchTerminalProcessList(context);
        const eligible = list.filter((t) => typeof t?.terminalId === 'string');
        if (eligible.length === 1) {
          const t = eligible[0];
          return {
            sessionId: t.terminalId,
            displayName: t.displayName || null,
            resolved: 'implicit_single',
          };
        }
        if (eligible.length > 1) {
          const candidates = eligible.map((t) => ({
            terminalId: t.terminalId,
            displayName: t.displayName || t.terminalId,
          }));
          return {
            error: {
              code: 'ambiguous',
              candidates,
              ...formatZedToolError(toolName, { code: 'ambiguous', candidates }),
            },
          };
        }
        return {
          error: {
            code: 'not_found',
            ...formatZedToolError(toolName, { code: 'not_found', activeNames: [] }),
          },
        };
      } catch (err) {
        return { error: { code: 'not_found', message: err.message } };
      }
    }
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
  // name-only: resolve via merged client registry + /api/terminal/processes.
  try {
    const list = await fetchTerminalProcessList(context);
    const activeNames = list.map((t) => t.displayName).filter(Boolean);
    const lookup = resolveTerminalByName(name, list);
    if (!lookup.ok) {
      return {
        error: {
          code: lookup.code,
          activeNames,
          candidates: lookup.candidates,
          ...formatZedToolError(toolName, {
            code: lookup.code,
            activeNames,
            candidates: lookup.candidates,
          }),
        },
      };
    }
    return { sessionId: lookup.terminalId, displayName: lookup.displayName, resolved: 'name' };
  } catch (err) {
    return { error: { code: 'not_found', message: err.message } };
  }
}

export const reviewTerminalTool = {
  name: 'review_terminal_output',
  parallel: true,
  description:
    'Read the recent output buffer of a terminal session. Pass `name` (display name) OR `session_id` (terminalId). Setting both returns a Spanish error before any HTTP call.',
  parameters: {
    name: {
      type: 'string',
      description: 'Display name (e.g. "Chase"). Mutually exclusive with session_id.',
    },
    session_id: { type: 'string', required: true },
  },
  async execute(params, context = {}) {
    const lookup = await resolveSessionIdFromNameOrId('review_terminal_output', params, context);
    if (lookup.error) {
      return { error: lookup.error.code, message: lookup.error.message };
    }
    const session_id = lookup.sessionId;
    const displayName = lookup.displayName || null;

    // ponytail: per-request map; upgrade to LRU if multi-session review loops persist
    if (context && typeof context === 'object') {
      if (!context._zed_review_guard || typeof context._zed_review_guard !== 'object') {
        context._zed_review_guard = {};
      }
      const guard = context._zed_review_guard;
      const prev = guard[session_id];
      if (prev && prev.count >= 1 && !prev.inputSince) {
        return {
          error: 'no_new_output_since_last_review',
          message:
            'No hay salida nueva desde la última revisión de esta terminal; describí lo que ya viste y no vuelvas a llamar review_terminal_output en el mismo session_id.',
          session_id,
        };
      }
      guard[session_id] = { count: (prev?.count || 0) + 1, inputSince: false };
    }

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
      // TUI buffers are mostly ANSI redraw noise; strip locally and keep the
      // tail so the model reads content, not escape codes.
      const { stripAnsi } = await import('../zedAnsiStrip');
      const clean = stripAnsi(data.output || '');
      const capped =
        clean.length > REVIEW_OUTPUT_CAP_CHARS ? clean.slice(-REVIEW_OUTPUT_CAP_CHARS) : clean;
      return {
        output: capped,
        session_id,
        ...(displayName ? { displayName } : {}),
        ...(capped.length < clean.length ? { truncated: true } : {}),
      };
    } catch (err) {
      return { error: `Failed to capture output: ${err.message}` };
    }
  },
};

// review_terminal_output feeds the model directly — cap the cleaned tail.
const REVIEW_OUTPUT_CAP_CHARS = 6000;

export const executeInTerminalTool = {
  name: 'execute_in_terminal',
  description:
    'Send input (keystrokes) to a running terminal session. Pass `name` (display name) OR `session_id` (terminalId) — never both. Use `program=opencode` (or codex/hermes) to launch an agent TUI inside an existing panel (e.g. user says "abre opencode en Chase"). Destructive commands are blocked; uncommon commands need confirm: true after user approval.',
  parameters: {
    name: {
      type: 'string',
      description:
        'Display name (e.g. "Chase", "César"). Mutually exclusive with session_id. Tolerates dictation typos.',
    },
    session_id: {
      type: 'string',
      description: 'Panel id from list_terminals (e.g. p2). Mutually exclusive with name.',
    },
    input: {
      type: 'string',
      description: 'Keystrokes/command to send. Omit when using program= to launch agent TUI.',
    },
    program: {
      type: 'string',
      description:
        'Launch opencode/codex/hermes/kimi/grok TUI in the named existing panel (builds launch command).',
    },
    confirm: {
      type: 'boolean',
      description:
        'Required true for commands outside the auto-allowlist. Destructive commands are always blocked.',
    },
  },
  async execute(params, context = {}) {
    const lookup = await resolveSessionIdFromNameOrId('execute_in_terminal', params, context);
    if (lookup.error) {
      return { error: lookup.error.code, message: lookup.error.message };
    }
    const session_id = lookup.sessionId;

    const normalizedProgram =
      typeof params?.program === 'string' ? params.program.trim().toLowerCase() : '';
    let input = params?.input;

    if ((!input || input === '') && normalizedProgram && AGENT_PROGRAMS.has(normalizedProgram)) {
      try {
        const { buildAgentLaunchCommand } = await import('../../agentLaunchCommand.shared.js');
        input = buildAgentLaunchCommand(normalizedProgram, '', {
          opencodeAgent: DEFAULT_OPENCODE_AGENT,
          cwd: process.cwd(),
          disableTmuxWrap: true,
          interactiveBootstrapPrompt: true,
        });
        zedLog.info('TOOL', 'execute_in_terminal (agent TUI)', {
          session_id,
          program: normalizedProgram,
        });
      } catch (e) {
        return {
          error: `Could not build launch command for program=${normalizedProgram}: ${e?.message || e}`,
        };
      }
    }

    const guardInput = requireParam({ input }, 'input');
    if (guardInput) return guardInput;

    const { confirm } = params;
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
        return {
          error: `Failed to send input: ${response.status}`,
          action: 'send_input',
          terminalId: session_id,
          session_id,
          input,
        };
      }
      const base = await response.json().catch(() => ({ session_id, sent: true }));

      if (context && typeof context === 'object' && context._zed_review_guard) {
        const row = context._zed_review_guard[session_id];
        if (row) row.inputSince = true;
      }

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
            const { stripAnsi } = await import('../zedAnsiStrip');
            base.recent_output = stripAnsi(String(cap.output)).slice(-2000);
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
    'Close a terminal session. Pass `name` (display name) OR `session_id` (terminalId) — never both. If the user did not name a panel and exactly one terminal is active, omit both. Destructive — requires explicit confirm: true after user approval. Without confirm, returns a dry-run preview (pending_confirmation). Call list_terminals first when unsure which panel to close.',
  parameters: {
    name: {
      type: 'string',
      description: 'Display name (e.g. "Chase"). Mutually exclusive with session_id.',
    },
    session_id: {
      type: 'string',
      description: 'Panel id from list_terminals (e.g. p2). Mutually exclusive with name.',
    },
    confirm: {
      type: 'boolean',
      description: 'Must be true only after the user explicitly confirms the close.',
    },
  },
  async execute(params, context = {}) {
    const lookup = await resolveSessionIdFromNameOrId('close_terminal', params, context, {
      allowImplicitSingle: true,
    });
    if (lookup.error) {
      return { error: lookup.error.code, message: lookup.error.message };
    }
    const session_id = lookup.sessionId;
    const displayName = lookup.displayName || null;

    zedLog.info('TOOL', 'close_terminal', { session_id, displayName });

    const { closeTerminalSessionById } = await import('@/lib/terminal/closeTerminalSession');
    try {
      const result = await closeTerminalSessionById(session_id);
      const panelId = /^p\d+$/i.test(session_id) ? session_id : session_id;
      return {
        ...result,
        success: true,
        session_id: panelId,
        sessionId: panelId,
        displayName,
        panel_closed: true,
      };
    } catch (err) {
      return { error: err.message, status: err.status || 500 };
    }
  },
};

export const closeAllTerminalsTool = {
  name: 'close_all_terminals',
  description:
    'Close multiple workspace terminal panels at once by display name. Pass an array of `names`. Closes immediately when invoked. Use list_terminals first when unsure which panels to close.',
  parameters: {
    names: {
      type: 'array',
      description: 'Array of display names of terminals to close (e.g. ["Chase", "Cesar"]).',
    },
  },
  async execute(params, context = {}) {
    const names = Array.isArray(params?.names)
      ? params.names.filter((n) => typeof n === 'string' && n.trim())
      : [];
    if (names.length === 0) {
      return {
        error: 'missing required parameter: names',
        message: 'No se indicaron terminales para cerrar.',
      };
    }

    const list = await fetchTerminalProcessList(context);
    const targets = [];
    const notFound = [];
    for (const rawName of names) {
      const name = rawName.trim();
      const lookup = resolveTerminalByName(name, list);
      if (lookup.ok) {
        targets.push({ sessionId: lookup.terminalId, displayName: lookup.displayName });
      } else {
        notFound.push(name);
      }
    }

    if (targets.length === 0) {
      return {
        error: 'not_found',
        message: `No encontré terminales para cerrar: ${notFound.join(', ')}`,
      };
    }

    zedLog.info('TOOL', 'close_all_terminals', { count: targets.length, notFound });

    const { closeTerminalSessionById } = await import('@/lib/terminal/closeTerminalSession');
    const results = [];
    for (const t of targets) {
      try {
        const r = await closeTerminalSessionById(t.sessionId);
        results.push({
          ...r,
          success: true,
          session_id: t.sessionId,
          sessionId: t.sessionId,
          displayName: t.displayName,
          panel_closed: true,
        });
      } catch (err) {
        results.push({
          success: false,
          session_id: t.sessionId,
          sessionId: t.sessionId,
          displayName: t.displayName,
          error: err.message,
          status: err.status || 500,
        });
      }
    }

    const closedCount = results.filter((r) => r.success).length;
    return {
      success: closedCount === targets.length,
      closed: closedCount,
      total: targets.length,
      results,
      message: `Cerré ${closedCount} de ${targets.length} terminales.`,
    };
  },
};
