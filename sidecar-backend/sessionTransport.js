// ============================================================
// WIP: pre-sdd-batch (2026-06-08)
// Marked by orchestrator to isolate the prior fix pass from the
// upcoming "swarm-launch-hardening" SDD change. DO NOT EDIT until
// the SDD proposal is approved and the new change decides whether
// to absorb, refactor, or revert these changes.
// Last verified: 149/149 targeted tests passing (1 suite skipped:
// useSharedSurfaceRegistry.test.js due to missing
// @testing-library/react dep — not a code regression).
// ============================================================
/**
 * SYNC NOTE — `SHELL_TERMINAL_RESPONSE_RE` and `stripShellTerminalResponseNoise`
 * below are intentionally duplicated from `src/lib/terminal/terminalNoiseFilter.js`
 * (ESM). The Tauri desktop bundle ships `sidecar-backend/` as an external resource
 * and the sidecar runs as plain Node CJS, so it cannot import the ESM module at
 * runtime. The two copies must stay in sync. The shared module is the source of
 * truth; this copy exists for CJS consumers only.
 *
 * When updating the regex, update BOTH:
 *   - src/lib/terminal/terminalNoiseFilter.js (ESM source of truth)
 *   - sidecar-backend/sessionTransport.js     (this CJS mirror)
 */
const {
  detectAgentTypeFromCommand,
  extractAgentSessionId,
  synthesizeAgentSessionId,
} = require('./agentTuiMetadata');
const { detectKimiTuiReady } = require('./kimiReadyMarker');
const { detectAntigravityTuiReady } = require('./antigravityReadyMarker');
const { detectQodercliTuiReady } = require('./qodercliReadyMarker');

const SHELL_TERMINAL_RESPONSE_RE =
  /(?:\x1b\[\?(?:\d+;)*\d+[cnRM]|\x1b\[>(?:\d+;)*\d+c|\x1b\[\$(?:\d+;)*\d+p|\x1b\[(?:\d+;)*\d+n|\x1b\[(?:\d+;)*\d+R)/g;
const TERMINAL_FOCUS_REPORTING_RE = /\x1b\[[IO]/g;
const TERMINAL_MOUSE_MOTION_LEAK_RE = /\x1b\[<(?!0;|[1-3];|64;|65;)\d+;[\d;]*[mM]/g;
// Windows PowerShell 5.1 prints a banner with a link to install PowerShell 7.
// Microsoft does not provide a flag to disable it, so we strip it from output.
// Matches both English and Spanish variants (the two most common locales).
const POWERSHELL_UPDATE_BANNER_RE =
  /Windows PowerShell\s*\r?\n\s*Copyright \(C\) Microsoft Corporation\.[^\r\n]*\r?\n(?:\s*\r?\n)?(?:Install the latest PowerShell|Instale la versión más reciente de PowerShell)[^\r\n]*\r?\n\s*https:\/\/aka\.ms\/PSWindows[^\r\n]*\r?\n?/gi;

function getTransportMode(requestUrl = '/') {
  const pathname = new URL(requestUrl, 'http://localhost').pathname;
  return pathname === '/tty' ? 'json' : 'raw';
}

function parseClientMessage(rawMessage, transport = 'raw') {
  const message = typeof rawMessage === 'string' ? rawMessage : rawMessage?.toString?.() || '';

  if (transport !== 'json') {
    return { type: 'input', data: message };
  }

  if (!message.trim().startsWith('{')) {
    return { type: 'input', data: message };
  }

  try {
    const payload = JSON.parse(message);
    if (payload?.type === 'resize' && payload.cols && payload.rows) {
      return payload;
    }
    if (payload?.type === 'input' && typeof payload.data === 'string') {
      return payload;
    }
    // Control frames must stay typed. Falling through to `{ type: 'input' }`
    // writes the JSON into the PTY (visible at every panel focus / connect).
    if (payload?.type === 'panel-focus' || payload?.type === 'session-meta') {
      return payload;
    }
  } catch {
    return { type: 'input', data: message };
  }

  return { type: 'input', data: message };
}

function buildServerMessage(transport, payload) {
  if (transport === 'json') {
    return JSON.stringify(payload);
  }

  if (payload?.type === 'output') {
    return payload.data || '';
  }

  return JSON.stringify(payload);
}

function detectOpenCodeSessionId(text) {
  if (!text || typeof text !== 'string') return null;

  const commandMatch = text.match(/opencode\s+(?:--session\s+)(ses_[\w]+)/i);
  if (commandMatch?.[1]) return commandMatch[1];

  const outputMatch = text.match(/\bses_[a-zA-Z0-9_]+\b/);
  return outputMatch?.[0] || null;
}

/** OpenCode interactive TUI footer — input area is ready for paste. */
function detectOpenCodeTuiReady(text) {
  if (!text || typeof text !== 'string') return false;
  if (/ctrl\+p\s+commands/i.test(text) || /esc\s+interrupt/i.test(text)) return true;
  if (/\bMCP\s*\/\s*status\b/i.test(text)) return true;
  if (/[⊙⊛]\s*\d+\s+MCP/i.test(text)) return true;
  if (/\/status\s+\d+\.\d+(?:\.\d+)?/i.test(text)) return true;
  if (/minimax\.io/i.test(text) && /MiniMax/i.test(text)) return true;
  return false;
}

function stripTerminalFocusReporting(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk.replace(TERMINAL_FOCUS_REPORTING_RE, '');
}

function stripShellTerminalResponseNoise(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk.replace(SHELL_TERMINAL_RESPONSE_RE, '').replace(POWERSHELL_UPDATE_BANNER_RE, '');
}

function stripTerminalMouseMotionLeak(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk.replace(TERMINAL_MOUSE_MOTION_LEAK_RE, '');
}

function stripTerminalInputNoise(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return stripTerminalMouseMotionLeak(
    stripTerminalFocusReporting(stripShellTerminalResponseNoise(chunk))
  );
}

function filterTerminalOutputForSession(session, chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  // Apply in ALL modes. The regex matches only terminal response sequences
  // (CSI ? Pd c / CSI > Pp c / CSI Pd n / CSI Pd R) — it cannot false-positive
  // on normal TUI text. Previously gated to shell-only, which leaked the bytes
  // for opencode/hermes panels and surfaced them as the "1;2c0;276;0c..." garbage
  // at the prompt on every panel focus/click. See ttyServer.js handleSessionOutput
  // for the dev/test mirror of this filter.
  return stripShellTerminalResponseNoise(chunk);
}

/**
 * Symmetric to filterTerminalOutputForSession but for the client→PTY direction.
 *
 * Returns:
 *   - null if the chunk is PURE terminal response noise. The caller should drop
 *     the chunk entirely (e.g. xterm.js auto-probe answerback bytes that get
 *     captured by terminal.onData and re-sent as input).
 *   - a stripped string otherwise: any embedded response sequences are removed
 *     and the rest of the input is forwarded as-is.
 *
 * This is belt-and-suspenders defense for the real bug surface (client→PTY
 * input). The primary fix is in src/components/TerminalTTY.jsx onData; this
 * sidecar filter protects against stale frontend bundles and raw-transport
 * clients that bypass the frontend filter.
 */
function filterTerminalInputForSession(session, chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  SHELL_TERMINAL_RESPONSE_RE.lastIndex = 0;
  TERMINAL_FOCUS_REPORTING_RE.lastIndex = 0;
  if (!SHELL_TERMINAL_RESPONSE_RE.test(chunk) && !TERMINAL_FOCUS_REPORTING_RE.test(chunk)) {
    return chunk;
  }
  const stripped = stripTerminalInputNoise(chunk);
  return stripped.length === 0 ? null : stripped;
}

function buildHistoryReplay(session) {
  if (!session?.historyEnabled || !Array.isArray(session.history) || session.history.length === 0) {
    return '';
  }

  return filterTerminalOutputForSession(session, session.history.join(''));
}

function switchSessionToTuiMode(session) {
  if (!session) return;
  session.mode = 'tui';
  session.historyEnabled = false;
  session.history = [];
}

function applyAgentTuiDetection(session, command) {
  const type = detectAgentTypeFromCommand(command);
  if (!type) return false;
  session.mode = 'tui';
  session.historyEnabled = false;
  session.history = [];
  if (!session.agentType) {
    session.agentType = type;
    session.agentDetectedAt = Date.now();
  }
  if (!session.agentSessionId) {
    const explicit = extractAgentSessionId(type, command);
    session.agentSessionId = explicit || synthesizeAgentSessionId(type, session.id) || null;
  }
  return true;
}

function updateSessionModeFromInput(session, input) {
  if (!session || !input || typeof input !== 'string') return;

  // W7: remember HOW the agent was launched. Typed launches (`agy` inside a
  // bash panel) run the agent as a CHILD of the shell, so PTY exit never fires
  // when the agent quits — the typed-agent reaper is the only cleanup path.
  // Output-detected sessions (tmux/pre-attach) are excluded from the reaper.
  const hadAgentType = Boolean(session.agentType);

  // Fast path: the whole command came in one chunk.
  if (applyAgentTuiDetection(session, input)) {
    if (!hadAgentType) session.agentLaunchOrigin = 'typed';
    return;
  }

  // Multi-chunk fallback: buffer by lines and re-check each completed line.
  session.pendingInput = `${session.pendingInput || ''}${input}`;
  const lines = session.pendingInput.split(/\r\n|\n|\r/);
  session.pendingInput = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (applyAgentTuiDetection(session, trimmed)) {
      if (!hadAgentType) session.agentLaunchOrigin = 'typed';
      return;
    }
  }
}

function detectAgentStateFromOutput(output, agentType) {
  if (!output || typeof output !== 'string' || !agentType) return null;
  if (/\b(?:thinking|working|busy|running)\b/i.test(output)) return 'running';
  if (/\b(?:idle|ready|waiting)\b/i.test(output)) return 'idle';
  return null;
}

// ─── Canonical agent-state frame (CJS mirror) ────────────────────────────────
// Keep in sync with src/lib/terminal/agentStateFrame.js (ESM source of truth).
// Frame schema (N4/N5): { type, agentTuiState, at, agentType?, wasCancelled?, reason? }
// Optional fields are included ONLY when defined so legacy consumers that
// assume {type, agentTuiState, at} never see unexpected nulls.
//   - reason: evidence tag (DONE-EVIDENCE-01). Explicit terminal frames pass
//     it ('exit' = PTY exited, 'agent-exit' = typed-agent child reaped while
//     shell survived); otherwise falls back to session.agentTuiStateReason
//     ('quiescence', 'quiescence-confirmed', 'prompt-visible', 'hook:<event>',
//     'manifest', 'user-input', 'pty-dead').
function buildAgentStateFrame(session, state, extra = {}) {
  if (!state) return null;
  const frame = {
    type: 'agent-state',
    agentTuiState: state,
    at: extra.at ?? session?.agentTuiStateAt ?? Date.now(),
  };
  const agentType = extra.agentType ?? session?.agentType ?? null;
  if (agentType) {
    frame.agentType = agentType;
  }
  const wasCancelled = extra.wasCancelled ?? session?._lastAgentStateEvent?.wasCancelled;
  if (wasCancelled !== undefined && wasCancelled !== null) {
    frame.wasCancelled = Boolean(wasCancelled);
  }
  const reason = extra.reason ?? session?.agentTuiStateReason ?? null;
  if (reason) {
    frame.reason = reason;
  }
  return frame;
}

// ─── Typed-agent child-exit reaper (W7 server half, CJS mirror) ──────────────
// Keep in sync with reapTypedAgentSessionIfExited in src/lib/terminal/ttyServer.js.
// Conservative heuristic — ALL gates must hold:
//   1. session.agentLaunchOrigin === 'typed' (set by updateSessionModeFromInput).
//   2. No agent chrome in the fresh chunk AND no visible working signal for
//      ≥ REAPER_QUIET_MS (session.lastWorkingAt).
//   3. ≥ REAPER_MIN_PROMPT_LINES shell-prompt-looking lines spanning
//      ≥ REAPER_QUIET_MS — a single transient line can never reap a live agent.
const TYPED_AGENT_REAPER_MIN_PROMPT_LINES = 2;
const TYPED_AGENT_REAPER_QUIET_MS = 3000;

// Conservative shell-prompt line patterns. Deliberately does NOT match a bare
// `>` line (ambiguous with the agy idle prompt / bash PS2 continuation).
const TYPED_AGENT_SHELL_PROMPT_RES = [
  /^PS [A-Za-z]:[\\/].*> ?$/, // Windows PowerShell: `PS C:\path>`
  /^[A-Za-z]:[\\/][^\n]*>$/, // cmd.exe: `C:\path>`
  /^\S+@\S+[^\n]*[$#] ?$/, // bash/zsh: `user@host:~/path$`
  /^[~/][^\n]*[$#] ?$/, // bare path prompt: `/home/user$`, `~/repo$`
  /^\s*[$#]\s*$/, // bare prompt line (git-bash second line, su/root)
];

function countTypedAgentShellPromptLines(text) {
  if (!text || typeof text !== 'string') return 0;
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const candidate = line.trimEnd();
    if (!candidate || candidate.length > 160) continue;
    if (TYPED_AGENT_SHELL_PROMPT_RES.some((re) => re.test(candidate))) count += 1;
  }
  return count;
}

function typedAgentChromePresent(agentType, text) {
  switch (agentType) {
    case 'agy':
    case 'antigravity':
      return detectAntigravityTuiReady(text);
    case 'kimi':
      return detectKimiTuiReady(text);
    case 'opencode':
      return detectOpenCodeTuiReady(text);
    case 'qodercli':
    case 'qoder':
      return detectQodercliTuiReady(text);
    default:
      // Unknown agent (grok/claude/codex/hermes have no footer detector here):
      // rely solely on the lastWorkingAt quiet window.
      return false;
  }
}

/**
 * Reap a typed-launch agent session whose child process exited while the
 * shell survived. Returns the terminal `agent-state` frame to emit, or null.
 * Side effect on reap: clears agent identity, hook state, and TUI mode.
 */
function reapTypedAgentSessionIfExited(session, chunk, now = Date.now()) {
  if (!session?.agentType || session.agentLaunchOrigin !== 'typed') return null;

  const tracker =
    session._typedAgentReaper ||
    (session._typedAgentReaper = { promptLines: 0, firstPromptAt: 0, lastPromptAt: 0 });

  // Gate 2a: any agent chrome in the fresh chunk means the agent is alive.
  if (typedAgentChromePresent(session.agentType, chunk)) {
    tracker.promptLines = 0;
    tracker.firstPromptAt = 0;
    return null;
  }

  const promptLines = countTypedAgentShellPromptLines(chunk);
  if (promptLines === 0) return null;

  if (tracker.promptLines === 0) tracker.firstPromptAt = now;
  tracker.promptLines += promptLines;
  tracker.lastPromptAt = now;

  // Gate 3: enough prompt-looking lines, spread over a quiet window.
  if (tracker.promptLines < TYPED_AGENT_REAPER_MIN_PROMPT_LINES) return null;
  if (now - tracker.firstPromptAt < TYPED_AGENT_REAPER_QUIET_MS) return null;
  // Gate 2b: no visible working signal (or Enter) in the quiet window.
  if (session.lastWorkingAt && now - session.lastWorkingAt < TYPED_AGENT_REAPER_QUIET_MS) {
    return null;
  }

  // Reap: capture the frame BEFORE clearing identity so it still carries
  // agentType for the client's final "agent finished" transition.
  const frame = buildAgentStateFrame(session, 'idle', { reason: 'agent-exit', at: now });

  session.agentType = null;
  session.agentSessionId = null;
  session.agentTuiState = null;
  session.agentTuiStateAt = null;
  session.hookState = null;
  session.lastDetection = null;
  session.lastWorkingAt = null;
  session.mode = 'shell';
  session.tuiReady = false;
  session.historyEnabled = true;
  session.agentLaunchOrigin = null;
  session._typedAgentReaper = null;

  return frame;
}

module.exports = {
  applyAgentTuiDetection,
  buildAgentStateFrame,
  buildHistoryReplay,
  buildServerMessage,
  countTypedAgentShellPromptLines,
  detectAgentStateFromOutput,
  detectAntigravityTuiReady,
  detectKimiTuiReady,
  detectQodercliTuiReady,
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
  detectOpenCodeSessionId,
  detectOpenCodeTuiReady,
  getTransportMode,
  parseClientMessage,
  reapTypedAgentSessionIfExited,
  stripShellTerminalResponseNoise,
  synthesizeAgentSessionId,
  updateSessionModeFromInput,
};
