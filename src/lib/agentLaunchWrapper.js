/* eslint-env node */
/* eslint-disable no-useless-escape -- buildAutoRestartLoopCommand uses \$ to escape $ in bash template literals. */

/**
 * Agent Launch Wrapper — DevHub's own wrapper for swarm agents.
 *
 * Generates the environment variables and initial commands that each agent
 * runs before starting its actual work (opencode/codex/hermes).
 *
 * This replaces the need for Plyrium's worktree-add + team-spawn flow.
 */

import { generateAgentSecret, hashToken } from './swarm/auth.js';
import { provisionAuthToken, getDb } from '@/lib/db/localDb.js';
import { getLlmProviderConfigSync } from './llmProviderConfig.js';

import fs from 'node:fs';
import path from 'node:path';

/**
 * Build the environment variables block for an agent.
 * If agentId and workspaceId are provided, provisions an HMAC auth token
 * and injects the secret as DEVHUB_AGENT_TOKEN (never logged or echoed).
 * @param {object} params
 * @param {boolean} [params.disableMinimaxMcp] - T-016.3: opt out of
 *   injecting the minimax MCP env vars (ANTHROPIC_BASE_URL / ANTHROPIC_MODEL)
 *   into swarm agents. The MCP env vars are for the user's personal Zed
 *   session, NOT for swarm agents. Defaults to false (Zed-friendly legacy
 *   behavior). Also honored via env var
 *   `DEVHUB_AGENT_DISABLE_MINIMAX_MCP=1` for callers that don't pass the
 *   param (e.g. one-off CLI spawns).
 * @returns {string} Shell export statements
 */
export function buildAgentEnvExports({
  agentId,
  missionId,
  role,
  workspacePath,
  workspaceId,
  runId,
  supervisorUrl,
  tmuxSessionName,
  directorSessionName,
  modelProvider,
  dbPath,
  disableMinimaxMcp,
}) {
  const exports = [
    `export DEVHUB_AGENT_ID="${agentId}"`,
    `export DEVHUB_MISSION_ID="${missionId}"`,
    `export DEVHUB_ROLE="${role}"`,
    `export DEVHUB_WORKSPACE_PATH="${workspacePath}"`,
    `export DEVHUB_WORKSPACE_ID="${workspaceId || ''}"`,
    `export DEVHUB_RUN_ID="${runId || ''}"`,
    // T-020: the agent's own OS process ID, exported at spawn time
    // so the exit trap can sample this process and its children via
    // `ps -p $DEVHUB_AGENT_PID` and `pgrep -P $DEVHUB_AGENT_PID`.
    // Use single-quoted `$$` so bash expands it at script start
    // (the actual PID of the wrapper process), not at module load.
    `export DEVHUB_AGENT_PID='$$'`,
  ];

  // T-003 — DEVHUB_DB_PATH gives bus helpers an absolute path to the SQLite bus.
  // Required for _devhub_chat / _devhub_event / _devhub_presence / _devhub_inbox_check.
  if (dbPath) {
    exports.push(`export DEVHUB_DB_PATH="${dbPath}"`);
  }

  if (tmuxSessionName) {
    exports.push(`export DEVHUB_TMUX_SESSION="${tmuxSessionName}"`);
  }

  if (directorSessionName) {
    exports.push(`export DEVHUB_DIRECTOR_SESSION="${directorSessionName}"`);
  }

  if (supervisorUrl) {
    exports.push(`export DEVHUB_SUPERVISOR_URL="${supervisorUrl}"`);
  }

  // AUTH-5: Provision HMAC token and inject as env var
  if (agentId) {
    let dbHandle;
    try {
      dbHandle = getDb();
    } catch {
      // DB not available in test environments — skip token provisioning
    }
    if (dbHandle) {
      const secret = generateAgentSecret();
      const tokenHash = hashToken(secret);
      try {
        provisionAuthToken(dbHandle, {
          agentId,
          workspaceId: workspaceId || null,
          tokenHash,
          rawSecret: secret,
          algorithm: 'hmac-sha256',
        });
        // NEVER log or echo the secret — inject directly as env var
        exports.push(`export DEVHUB_AGENT_TOKEN="${secret}"`);
      } catch {
        // Token provisioning failed — agent will operate without auth token
        // Middleware will fall back to dual-mode (unauthenticated)
      }
    }
  }

  // T-016.3: opt out of minimax MCP injection for swarm agents.
  // The MCP env vars are a personal Zed session tool — they route the
  // user's local Zed through the minimax subscription. Swarm agents
  // launched in CI / worktrees should run on the default anthropic
  // provider (or whatever the host already uses), NOT inherit the
  // user's personal MCP routing.
  // Two opt-out knobs:
  //   (a) explicit `disableMinimaxMcp: true` param
  //   (b) env var `DEVHUB_AGENT_DISABLE_MINIMAX_MCP=1`
  // Both are checked; either one disables the injection.
  const _minimaxMcpDisabled =
    disableMinimaxMcp === true ||
    (typeof process !== 'undefined' &&
      process.env &&
      process.env.DEVHUB_AGENT_DISABLE_MINIMAX_MCP === '1');

  // MINIMAX-1: Inject MiniMax MCP subscription env vars for Zed agents
  if (!_minimaxMcpDisabled && modelProvider === 'minimax') {
    const config = getLlmProviderConfigSync('minimax');
    if (config) {
      exports.push(`export ANTHROPIC_BASE_URL="${config.ANTHROPIC_BASE_URL}"`);
      exports.push(`export ANTHROPIC_MODEL="${config.MINIMAX_MODEL}"`);
    }
  }

  return exports.join('\n');
}

/**
 * Build the identity verification block that runs at agent startup.
 * Prints identity, role, cwd, and verifies cwd matches workspace path.
 * @param {object} params
 * @returns {string} Shell commands
 */
export function buildIdentityVerificationBlock({ agentId, missionId, role, workspacePath }) {
  return [
    'DEVHUB_LOG_FILE="/tmp/devhub-swarm-${DEVHUB_ROLE:-agent}.log"',
    '{',
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] =========================================="`,
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] DEVHUB_AGENT_ID=${agentId}"`,
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] DEVHUB_MISSION_ID=${missionId}"`,
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] DEVHUB_ROLE=${role}"`,
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] DEVHUB_WORKSPACE_PATH=${workspacePath}"`,
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] =========================================="`,
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] --- Identity verified ---"`,
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] Current directory: $(pwd)"`,
    // Verify cwd matches workspace path
    `if [ "$(pwd)" != "${workspacePath}" ]; then`,
    `  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: cwd mismatch! Expected ${workspacePath}, got $(pwd)"`,
    `  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ABORTING: Agent will not start in the wrong workspace."`,
    `  exit 1`,
    `fi`,
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] --- CWD verified: $(pwd) === ${workspacePath} ---"`,
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] --- Log file: /tmp/devhub-swarm-${role}.log ---"`,
    '} >> "$DEVHUB_LOG_FILE" 2>&1',
  ].join('\n');
}

/**
 * Build the bash block that defines the bus helpers:
 *   _devhub_chat, _devhub_event, _devhub_presence, _devhub_inbox_check.
 *
 * Each helper is a thin shim around the `devhub-bus` binary. The bus is the
 * SINGLE path from bash to better-sqlite3 — workers never write to SQLite
 * directly. Exit codes from the binary (0/64/65/66/73) are passed through to
 * the caller.
 *
 * @param {object} params
 * @param {string} params.busBinaryPath - absolute path to devhub-bus.js
 * @param {string} params.dbPath - absolute path to devhub.db
 * @returns {string} Bash function definitions
 */
export function buildBusHelpersBlock({ busBinaryPath, dbPath }) {
  if (!busBinaryPath || !dbPath) {
    return '# Bus helpers skipped (missing busBinaryPath or dbPath)';
  }
  return [
    '# ===== DevHub agent comms bus helpers (T-003) =====',
    '# Single source of truth: devhub-bus binary + team_chat/team_events/team_inbox/agent_presence.',
    '_DEVHUB_BUS_BIN="${DEVHUB_BUS_BIN:-' + busBinaryPath + '}"',
    '_DEVHUB_BUS_DB="${DEVHUB_BUS_DB:-' + dbPath + '}"',
    '_DEVHUB_BUS_NODE="${DEVHUB_BUS_NODE:-$(command -v node || echo node)}"',
    // T-017.3: bus-debug log path. Each bus helper writes a structured
    // line (timestamp + args + exit code) to this file BEFORE and
    // AFTER its bus call. The log survives agent crashes so we can
    // post-mortem what each agent tried to do (the launch-1751cfaa
    // auditor never wrote to the bus — this log is how we'll see
    // whether it tried and failed or never tried at all).
    '_DEVHUB_BUS_DEBUG_LOG="/tmp/devhub-swarm-${DEVHUB_ROLE:-unknown}.bus-debug"',
    '',
    '_devhub_chat() {',
    '  # T-017.3: capture args BEFORE the parser consumes $*.',
    '  local _bus_debug_args="$*"',
    '  local _bus_debug_ts',
    '  _bus_debug_ts="$(date -Iseconds 2>/dev/null || date)"',
    '  echo "[$_bus_debug_ts] _devhub_chat args: ${_bus_debug_args:0:200}" >> "$_DEVHUB_BUS_DEBUG_LOG" 2>/dev/null || true',
    '  local _body=""',
    '  local _to="all"',
    '  local _kind="chat"',
    '  local _client_event_id=""',
    '  while [ $# -gt 0 ]; do',
    '    case "$1" in',
    '      --to) _to="$2"; shift 2 ;;',
    '      --kind) _kind="$2"; shift 2 ;;',
    '      --client-event-id) _client_event_id="$2"; shift 2 ;;',
    '      --message-file) _body="$(cat "$2")"; shift 2 ;;',
    '      --message-stdin) _body="$(timeout 5 cat)"; shift ;;',
    '      --*) shift ;;',
    '      *) if [ -z "$_body" ]; then _body="$1"; fi; shift ;;',
    '    esac',
    '  done',
    '  if [ -z "$_body" ]; then echo "devhub-helper: _devhub_chat: usage: body required" >&2; return 64; fi',
    '  if [ -z "${DEVHUB_MISSION_ID:-}" ]; then echo "devhub-helper: _devhub_chat: DEVHUB_MISSION_ID not set" >&2; return 64; fi',
    '  if [ -z "${DEVHUB_ROLE:-}" ]; then echo "devhub-helper: _devhub_chat: DEVHUB_ROLE not set" >&2; return 64; fi',
    '  local _args=("--db" "$_DEVHUB_BUS_DB" "chat-write" "--mission" "$DEVHUB_MISSION_ID" "--from" "$DEVHUB_ROLE" "--to" "$_to" "--kind" "$_kind" "--body" "$_body")',
    '  if [ -n "$_client_event_id" ]; then _args+=("--client-event-id" "$_client_event_id"); fi',
    '  "$_DEVHUB_BUS_NODE" "$_DEVHUB_BUS_BIN" "${_args[@]}"',
    '  local _bus_debug_rc=$?',
    '  echo "[$(date -Iseconds 2>/dev/null || date)] _devhub_chat exit: $_bus_debug_rc" >> "$_DEVHUB_BUS_DEBUG_LOG" 2>/dev/null || true',
    '  return $_bus_debug_rc',
    '}',
    '',
    '_devhub_event() {',
    '  # T-017.3: capture args BEFORE the parser consumes $*.',
    '  local _bus_debug_args="$*"',
    '  echo "[$(date -Iseconds 2>/dev/null || date)] _devhub_event args: ${_bus_debug_args:0:200}" >> "$_DEVHUB_BUS_DEBUG_LOG" 2>/dev/null || true',
    '  local _kind=""',
    '  local _payload=""',
    '  local _dedupe_key=""',
    '  while [ $# -gt 0 ]; do',
    '    case "$1" in',
    '      --kind) _kind="$2"; shift 2 ;;',
    '      --payload) _payload="$2"; shift 2 ;;',
    '      --dedupe-key) _dedupe_key="$2"; shift 2 ;;',
    '      --*) shift ;;',
    '    esac',
    '  done',
    '  if [ -z "$_kind" ]; then echo "devhub-helper: _devhub_event: --kind required" >&2; return 64; fi',
    '  if [ -z "${DEVHUB_MISSION_ID:-}" ]; then echo "devhub-helper: _devhub_event: DEVHUB_MISSION_ID not set" >&2; return 64; fi',
    '  local _args=("--db" "$_DEVHUB_BUS_DB" "event-write" "--mission" "$DEVHUB_MISSION_ID" "--source" "${DEVHUB_ROLE:-unknown}" "--kind" "$_kind")',
    '  if [ -n "$_payload" ]; then _args+=("--payload" "$_payload"); fi',
    '  if [ -n "$_dedupe_key" ]; then _args+=("--dedupe-key" "$_dedupe_key"); fi',
    '  "$_DEVHUB_BUS_NODE" "$_DEVHUB_BUS_BIN" "${_args[@]}"',
    '  local _bus_debug_rc=$?',
    '  echo "[$(date -Iseconds 2>/dev/null || date)] _devhub_event exit: $_bus_debug_rc" >> "$_DEVHUB_BUS_DEBUG_LOG" 2>/dev/null || true',
    '  return $_bus_debug_rc',
    '}',
    '',
    '_devhub_presence() {',
    '  # T-017.3: capture args BEFORE the parser consumes $*.',
    '  local _bus_debug_args="$*"',
    '  echo "[$(date -Iseconds 2>/dev/null || date)] _devhub_presence args: ${_bus_debug_args:0:200}" >> "$_DEVHUB_BUS_DEBUG_LOG" 2>/dev/null || true',
    '  local _state="online"',
    '  local _summary=""',
    '  local _ttl=120',
    '  while [ $# -gt 0 ]; do',
    '    case "$1" in',
    '      --state) _state="$2"; shift 2 ;;',
    '      --summary) _summary="$2"; shift 2 ;;',
    '      --ttl) _ttl="$2"; shift 2 ;;',
    '      --*) shift ;;',
    '    esac',
    '  done',
    '  if [ -z "${DEVHUB_AGENT_ID:-}" ]; then echo "devhub-helper: _devhub_presence: DEVHUB_AGENT_ID not set" >&2; return 64; fi',
    '  if [ -z "${DEVHUB_MISSION_ID:-}" ]; then echo "devhub-helper: _devhub_presence: DEVHUB_MISSION_ID not set" >&2; return 64; fi',
    '  "$_DEVHUB_BUS_NODE" "$_DEVHUB_BUS_BIN" "--db" "$_DEVHUB_BUS_DB" "presence-upsert" --mission "$DEVHUB_MISSION_ID" --agent "$DEVHUB_AGENT_ID" --runtime-surface shell --state "$_state" --summary "$_summary" --ttl-seconds "$_ttl"',
    '  local _bus_debug_rc=$?',
    '  echo "[$(date -Iseconds 2>/dev/null || date)] _devhub_presence exit: $_bus_debug_rc" >> "$_DEVHUB_BUS_DEBUG_LOG" 2>/dev/null || true',
    '  return $_bus_debug_rc',
    '}',
    '',
    '_devhub_inbox_check() {',
    '  # T-017.3: capture args BEFORE the parser consumes $*.',
    '  local _bus_debug_args="$*"',
    '  echo "[$(date -Iseconds 2>/dev/null || date)] _devhub_inbox_check args: ${_bus_debug_args:0:200}" >> "$_DEVHUB_BUS_DEBUG_LOG" 2>/dev/null || true',
    '  if [ -z "${DEVHUB_MISSION_ID:-}" ]; then echo "devhub-helper: _devhub_inbox_check: DEVHUB_MISSION_ID not set" >&2; return 64; fi',
    '  if [ -z "${DEVHUB_ROLE:-}" ]; then echo "devhub-helper: _devhub_inbox_check: DEVHUB_ROLE not set" >&2; return 64; fi',
    '  "$_DEVHUB_BUS_NODE" "$_DEVHUB_BUS_BIN" "--db" "$_DEVHUB_BUS_DB" "inbox-check" --mission "$DEVHUB_MISSION_ID" --role "$DEVHUB_ROLE"',
    '  local _bus_debug_rc=$?',
    '  echo "[$(date -Iseconds 2>/dev/null || date)] _devhub_inbox_check exit: $_bus_debug_rc" >> "$_DEVHUB_BUS_DEBUG_LOG" 2>/dev/null || true',
    '  return $_bus_debug_rc',
    '}',
    '# ===== end bus helpers =====',
  ].join('\n');
}

// Allowed state transitions for the injection lock state machine.
// pending → injecting → injected (happy path)
// injecting → failed (downstream error)
// injected → failed (post-injection error)
const ALLOWED_INJECTION_TRANSITIONS = {
  pending: new Set(['injecting', 'failed']),
  injecting: new Set(['injected', 'failed']),
  injected: new Set(['failed']),
  failed: new Set([]),
};
const STUCK_LOCK_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

function _pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function _writeLockAtomic(file, payload) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * T-004 — create the injection lock at the new path.
 * Recovers any stale lock (dead pid OR >1h old in non-terminal state) with a WARN.
 * @param {object} params
 * @param {string} params.lockDir - directory to write the lock file in
 * @param {string} params.launchId
 * @param {string} params.role
 * @param {string} params.missionId
 * @returns {object} The lock payload written to disk
 */
export function createInjectionLock({ lockDir, launchId, role, missionId }) {
  if (!lockDir || !launchId || !role) {
    throw new Error('createInjectionLock: lockDir, launchId, role required');
  }
  const file = path.join(lockDir, `devhub-injection-${launchId}-${role}.lock`);
  if (fs.existsSync(file)) {
    let prior = null;
    try {
      prior = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      /* corrupt */
    }
    if (prior) {
      const updatedAt = Date.parse(prior.updated_at || prior.created_at || '');
      const isTerminal = prior.state === 'injected' || prior.state === 'failed';
      const isStale =
        !isTerminal &&
        (!prior.pid ||
          !_pidIsAlive(prior.pid) ||
          (Number.isFinite(updatedAt) && Date.now() - updatedAt > STUCK_LOCK_THRESHOLD_MS));
      if (!isStale) {
        // Active lock — surface the existing state
        return { ...prior, recovered: false, file };
      }
      // Stale — log and overwrite
      process.stderr.write(
        `devhub-wrapper: WARN stale injection lock recovered (state=${prior.state}, pid=${prior.pid}, age=${prior.updated_at})\n`
      );
    }
  }
  const now = new Date().toISOString();
  const payload = {
    launch_id: launchId,
    role,
    mission_id: missionId || null,
    state: 'pending',
    pid: process.pid,
    created_at: now,
    updated_at: now,
  };
  _writeLockAtomic(file, payload);
  return { ...payload, recovered: true, file };
}

/**
 * T-004 — advance the injection lock from one state to another.
 * Rejects invalid transitions (e.g. pending → injected is forbidden).
 * @param {object} params
 * @param {string} params.lockDir
 * @param {string} params.launchId
 * @param {string} params.role
 * @param {string} params.from - expected current state
 * @param {string} params.to - target state
 * @param {string} [params.reason] - recorded on failure
 * @returns {{ ok: boolean, reason?: string, state?: string }}
 */
export function advanceInjectionLock({ lockDir, launchId, role, from, to, reason }) {
  if (!from || !to) return { ok: false, reason: 'from and to required' };
  const allowed = ALLOWED_INJECTION_TRANSITIONS[from];
  if (!allowed) return { ok: false, reason: `unknown source state: ${from}` };
  if (!allowed.has(to)) {
    return { ok: false, reason: `invalid transition ${from} → ${to}` };
  }
  const file = path.join(lockDir, `devhub-injection-${launchId}-${role}.lock`);
  if (!fs.existsSync(file)) return { ok: false, reason: 'lock file does not exist' };
  let prior;
  try {
    prior = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, reason: 'lock file corrupt' };
  }
  if (prior.state !== from) {
    return { ok: false, reason: `current state is ${prior.state}, expected ${from}` };
  }
  const next = {
    ...prior,
    state: to,
    updated_at: new Date().toISOString(),
  };
  if (reason) next.failure_reason = reason;
  _writeLockAtomic(file, next);
  return { ok: true, state: to };
}

/**
 * T-004 — detect an old-format bootstrap lock at the legacy path.
 * Returns { found, path } so the caller can warn and migrate.
 * @param {object} params
 * @param {string} params.lockDir
 * @param {string} params.missionId
 * @param {string} params.role
 * @returns {{ found: boolean, path?: string }}
 */
export function detectLegacyBootstrapLock({ lockDir, missionId, role }) {
  const file = path.join(lockDir, `devhub-bootstrap-${missionId}-${role}.lock`);
  return { found: fs.existsSync(file), path: fs.existsSync(file) ? file : null };
}

/**
 * T-004 — read a legacy bootstrap lock. Emits a WARN to stderr.
 * For 1 release we still read the old path so in-flight launches don't fail.
 * @param {object} params
 * @param {string} params.lockDir
 * @param {string} params.missionId
 * @param {string} params.role
 * @returns {{ found: boolean, pid?: string, deprecated: boolean }}
 */
export function readLegacyBootstrapLock({ lockDir, missionId, role }) {
  const file = path.join(lockDir, `devhub-bootstrap-${missionId}-${role}.lock`);
  if (!fs.existsSync(file)) return { found: false, deprecated: true };
  const pid = fs.readFileSync(file, 'utf8').trim();
  process.stderr.write(
    `devhub-wrapper: WARN legacy bootstrap lock path used (${file}); migrate to devhub-injection-*.lock\n`
  );
  return { found: true, pid, deprecated: true, path: file };
}

function buildBootstrapPromptBlock(prompt = '', { preSleepSeconds = 0 } = {}) {
  if (!String(prompt || '').trim()) {
    return '';
  }

  const preSleep =
    Number.isFinite(preSleepSeconds) && preSleepSeconds > 0
      ? [
          `# T-017.1: pre-bootstrap sleep (${preSleepSeconds}s) — gives director-consume`,
          '# time to attach to the tmux pane before the bootstrap prompt is injected.',
          `sleep ${preSleepSeconds}`,
        ].join('\n')
      : '';

  return [
    preSleep,
    '# Queue the bootstrap prompt into the panel tmux session after OpenCode starts.',
    'DEVHUB_LOG_FILE="/tmp/devhub-swarm-${DEVHUB_ROLE:-agent}.log"',
    // T-016.4 — also write the bootstrap prompt into the transcript file
    // (set up earlier by buildTranscriptCaptureBlock) so the user can see
    // what the agent was given, not just what it produced.
    'DEVHUB_TRANSCRIPT_FILE="${DEVHUB_TRANSCRIPT_FILE:-/tmp/devhub-swarm-${DEVHUB_ROLE:-agent}.transcript}"',
    '# Prevent duplicate prompt injections using a lock file',
    'BOOTSTRAP_LOCK="/tmp/devhub-bootstrap-${DEVHUB_MISSION_ID:-unknown}-${DEVHUB_ROLE:-agent}.lock"',
    '',
    '_devhub_bootstrap_prompt() {',
    '  {',
    '    # Deduplication: skip if already injected',
    '    if [ -f "$BOOTSTRAP_LOCK" ]; then',
    `      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] SKIP: Prompt already injected (lock exists: $BOOTSTRAP_LOCK)"`,
    '      return 0',
    '    fi',
    '    # Create lock file with PID to identify which process injected',
    '    echo "$$" > "$BOOTSTRAP_LOCK"',
    `    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Starting bootstrap prompt injection..."`,
    '    if ! command -v tmux >/dev/null 2>&1; then',
    `      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] ERROR: tmux not found. Cannot inject prompt."`,
    '      return 1',
    '    fi',
    '    # Detect current tmux session - prefer explicit DEVHUB_TMUX_SESSION over auto-detect',
    '    # to avoid race conditions when multiple agents start simultaneously',
    '    local _tmux_session',
    '    _tmux_session="${DEVHUB_TMUX_SESSION:-}"',
    '    if [ -z "${_tmux_session:-}" ]; then',
    '      _tmux_session=$(tmux display-message -p "#S" 2>/dev/null) || true',
    '    fi',
    '    if [ -z "${_tmux_session:-}" ]; then',
    `      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] ERROR: Cannot detect tmux session. Cannot inject prompt."`,
    '      return 1',
    '    fi',
    `    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Detected tmux session: \${_tmux_session}"`,
    '    # T-021: simple grace sleep. The previous event-driven sentinel',
    '    # wait (T-019.1) was reverted because it leaked sentinel text into',
    '    # agent TUIs when send-keys landed on the active prompt.',
    '    # Configurable via tuiReadyGraceMs in buildAgentLaunchWrapper.',
    '    sleep 2',
    `    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Loading prompt into tmux session \${_tmux_session}..."`,
    "    tmux load-buffer - <<'DEVHUB_BOOTSTRAP_PROMPT'",
    prompt,
    'DEVHUB_BOOTSTRAP_PROMPT',
    // T-016.4 — also write the bootstrap prompt into the transcript file
    // (with a header marker) so the user can see what the agent was given.
    `    {`,
    `      echo "[bootstrap prompt at $(date '+%Y-%m-%d %H:%M:%S')]"`,
    `      cat <<'DEVHUB_BOOTSTRAP_TRANSCRIPT'`,
    prompt,
    `DEVHUB_BOOTSTRAP_TRANSCRIPT`,
    `      echo "----"`,
    `    } >> "$DEVHUB_TRANSCRIPT_FILE" 2>/dev/null || true`,
    `    tmux paste-buffer -t "\${_tmux_session}" >/dev/null 2>&1 || echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] WARN: paste-buffer failed"`,
    `    tmux send-keys -t "\${_tmux_session}" C-m >/dev/null 2>&1 || echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] WARN: send-keys failed"`,
    `    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Prompt injection complete."`,
    '  } >> "$DEVHUB_LOG_FILE" 2>&1',
    '}',
    '(_devhub_bootstrap_prompt) &',
  ].join('\n');
}

/**
 * Build the initial heartbeat command.
 * Signs the request with HMAC-SHA256 using DEVHUB_AGENT_TOKEN.
 * @param {object} params
 * @returns {string} curl command to report heartbeat
 */
export function buildInitialHeartbeatCommand({
  supervisorUrl,
  agentId,
  missionId,
  role,
  workspacePath,
}) {
  if (!supervisorUrl) {
    return '# Heartbeat skipped (no supervisor URL)';
  }

  const payload = JSON.stringify({
    agent_id: agentId,
    mission_id: missionId,
    role,
    cwd: workspacePath,
    state: 'idle',
    status_summary: 'Agent booted, waiting for tasks',
  });

  // Escape single quotes for safe embedding in single-quoted shell variable.
  // Single quote in payload would break: HEARTBEAT_PAYLOAD='{"role":"it's"}'
  // Fix: replace ' with '\'' (end quote, escaped quote, restart quote)
  const escapedPayload = payload.replace(/'/g, "'\\''");

  return `HEARTBEAT_PAYLOAD='${escapedPayload}'
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
BODY_HASH=$(printf '%s' "$HEARTBEAT_PAYLOAD" | openssl dgst -sha256 | awk '{print $NF}')
SIGNATURE=$(printf '%s' "\${TIMESTAMP}.\${BODY_HASH}" | openssl dgst -sha256 -hmac "$DEVHUB_AGENT_TOKEN" | awk '{print $NF}')
curl -s -X POST "${supervisorUrl}/api/agenthub/presence/heartbeat" \\
  -H "Content-Type: application/json" \\
  -H "X-Agent-Id: ${agentId}" \\
  -H "X-Agent-Timestamp: \${TIMESTAMP}" \\
  -H "X-Agent-Signature: \${SIGNATURE}" \\
  -d "$HEARTBEAT_PAYLOAD" > /dev/null 2>&1 || true`;
}

/**
 * Build a background heartbeat loop command.
 * Runs a subshell that sends a heartbeat every 30 seconds to keep the agent alive.
 * Uses the same /api/agenthub/presence/heartbeat endpoint.
 * Implements exponential backoff on failures: 120s -> 240s -> 480s -> max 900s.
 */
export function buildHeartbeatLoopCommand({
  supervisorUrl,
  agentId,
  missionId,
  role,
  workspacePath,
}) {
  if (!supervisorUrl) {
    return '# Heartbeat loop skipped (no supervisor URL)';
  }

  const payload = JSON.stringify({
    agent_id: agentId,
    mission_id: missionId,
    role,
    cwd: workspacePath,
    state: 'idle',
    status_summary: 'Agent idle, listening for directives',
  });

  const escapedPayload = payload.replace(/'/g, "'\\''");

  return `(_devhub_heartbeat_loop() {
  local _backoff=120
  local _max_backoff=900
  while true; do
    sleep $_backoff
    HEARTBEAT_PAYLOAD='${escapedPayload}'
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    BODY_HASH=$(printf '%s' "$HEARTBEAT_PAYLOAD" | openssl dgst -sha256 | awk '{print $NF}')
    SIGNATURE=$(printf '%s' "\${TIMESTAMP}.\${BODY_HASH}" | openssl dgst -sha256 -hmac "$DEVHUB_AGENT_TOKEN" | awk '{print $NF}')
    _resp=$(curl -s -w "\\n%{http_code}" -X POST "${supervisorUrl}/api/agenthub/presence/heartbeat" \\
      -H "Content-Type: application/json" \\
      -H "X-Agent-Id: ${agentId}" \\
      -H "X-Agent-Timestamp: \${TIMESTAMP}" \\
      -H "X-Agent-Signature: \${SIGNATURE}" \\
      -d "$HEARTBEAT_PAYLOAD" 2>&1)
    _http_code=$(echo "$_resp" | tail -1)
    if [ "$_http_code" = "200" ] || [ "$_http_code" = "204" ]; then
      _backoff=120
    else
      _backoff=$((_backoff * 2))
      [ $_backoff -gt $_max_backoff ] && _backoff=$_max_backoff
    fi
  done
}
nohup bash -c '_devhub_heartbeat_loop' >/dev/null 2>&1 &
disown
) &`;
}

/**
 * T-006 — pending_deliveries polling was REMOVED. Workers now read durable inbox
 * rows via `_devhub_inbox_check` on demand, not via background HTTP polling.
 * This stub returns an empty string so buildAgentLaunchWrapper still composes cleanly.
 * @returns {string}
 */
export function buildPendingDeliveriesPollingCommand() {
  return '# pending_deliveries polling removed in T-006 (agent-comms-redesign) — use _devhub_inbox_check';
}

/**
 * T-021 — Build the TUI-ready wait block.
 *
 * T-019.1's event-driven sentinel mechanism was buggy: `tmux send-keys`
 * typed the sentinel into the agent's prompt buffer instead of just
 * signaling readiness. This is a simple sleep fallback until a working
 * detection mechanism exists (e.g., OpenCode hook writing a marker file
 * that the wrapper waits on with `inotifywait`).
 *
 * @param {object} params
 * @param {string} [params.sessionName] - tmux session name (UNUSED,
 *   kept for backward compat with buildAgentLaunchWrapper call sites)
 * @param {number} [params.graceSeconds] - sleep duration in seconds
 *   (default 2s). Configurable via tuiReadyGraceMs on the wrapper.
 * @param {number} [params.timeoutSeconds] - UNUSED, kept for backward
 *   compat. Configurable via tuiWaitTimeoutMs on the wrapper.
 * @returns {string} Bash block
 */
export function buildTuiWaitForBlock({ sessionName, graceSeconds = 2, timeoutSeconds = 10 } = {}) {
  if (!sessionName) {
    return '# TUI wait-for skipped (no tmux session name)';
  }
  return [
    '# T-021 — TUI ready grace period (simple sleep).',
    '# T-019.1 event-driven sentinel was buggy: tmux send-keys typed the',
    '# sentinel into the agent prompt buffer instead of just signaling.',
    '# Revert to a simple sleep until we have a working detection',
    '# mechanism (e.g., OpenCode hook writing a marker file).',
    `# Default ${graceSeconds}s; configurable via tuiReadyGraceMs.`,
    `# timeoutSeconds param kept for backward compat (ignored).`,
    `sleep ${graceSeconds}`,
  ].join('\n');
}

/**
 * T-017.1 — Director consumer block.
 *
 * Director's tmux gets a background `director-consume` process that tails
 * the JSONL chat projection for the mission and prints new messages into
 * the tmux pane in real time, so the director doesn't have to poll.
 *
 * Emits a `nohup ... &` block that:
 *   1. Spawns `devhub-bus director-consume` in the background
 *   2. Passes `--target-session` so the consumer knows which tmux pane to write to
 *   3. Passes `--format tmux-send-keys` so the consumer pushes messages via
 *      `tmux send-keys` instead of just printing to stdout
 *   4. Writes the consumer PID to `/tmp/devhub-director-consume-${LAUNCH_ID}.pid`
 *      so the exit trap can kill it on agent exit
 *
 * The cleanup is emitted separately via `buildDirectorConsumerCleanupBlock`
 * (folded into the exit trap).
 *
 * Returns an empty string when not invoked for the director role.
 *
 * @param {object} params
 * @param {string} [params.busBinaryPath] - absolute path to devhub-bus.js
 * @param {string} [params.missionId] - the mission id (used for the launch-id tag in the PID file)
 * @param {string} [params.sessionName] - tmux session name (director pane target)
 * @returns {string} Bash block
 */
export function buildDirectorConsumerBlock({ busBinaryPath, missionId, sessionName }) {
  if (!busBinaryPath || !sessionName) {
    return '# Director consumer skipped (missing busBinaryPath or sessionName)';
  }
  return [
    '# T-017.1 — director consumer: tail chat.jsonl → tmux send-keys into the director pane',
    '# so the director does not have to poll team_chat for incoming worker messages.',
    `nohup "$_DEVHUB_BUS_NODE" "$_DEVHUB_BUS_BIN" director-consume \\`,
    `  --db "$_DEVHUB_BUS_DB" \\`,
    `  --mission "${missionId || 'launch-unknown'}" \\`,
    `  --role director \\`,
    `  --target-session "${sessionName}" \\`,
    `  --format "tmux-send-keys" \\`,
    `  >> "$AGENT_LOG" 2>&1 &`,
    `_director_consume_pid=$!`,
    `echo "$_director_consume_pid" > "/tmp/devhub-director-consume-${missionId || 'launch-unknown'}.pid"`,
  ].join('\n');
}

/**
 * T-017.1 — Director consumer cleanup block (runs in the exit trap).
 *
 * Kills the background director-consume process and removes the PID file
 * so we don't leak processes when the director exits.
 *
 * @param {object} params
 * @param {string} [params.launchId] - the mission/launch id used to name the PID file
 * @returns {string} Bash block
 */
export function buildDirectorConsumerCleanupBlock({ launchId } = {}) {
  const tag = launchId || 'launch-unknown';
  return [
    `  if [ -f "/tmp/devhub-director-consume-${tag}.pid" ]; then`,
    `    kill "$(cat /tmp/devhub-director-consume-${tag}.pid)" 2>/dev/null || true`,
    `    rm -f "/tmp/devhub-director-consume-${tag}.pid"`,
    `  fi`,
  ].join('\n');
}

/**
 * T-016.4 — Per-agent transcript capture via tmux pipe-pane.
 *
 * Captures the LLM's full terminal output to a transcript file so the
 * user can review what each agent actually said/thought. The wrapper
 * already writes identity + bootstrap + exit code to
 * /tmp/devhub-swarm-<role>.log, but that file is wrapper diagnostics —
 * it does NOT contain the LLM's own output. The transcript is the
 * durable evidence trail.
 *
 * Pipeline:
 *   1. The transcript file is created with a header (launch_id, role,
 *      started_at, divider).
 *   2. tmux pipe-pane is attached to the session, tee-ing every byte
 *      the LLM prints into the transcript.
 *   3. The bootstrap prompt is also written to the transcript BEFORE
 *      the agent starts, so the user can see what the agent was given.
 *   4. On agent exit, the pipe-pane is removed (empty target = stop).
 *
 * @param {object} params
 * @param {string} params.role
 * @returns {string} Shell block that creates the transcript header,
 *                   writes the bootstrap prompt, attaches pipe-pane,
 *                   and returns the pipe-pane removal line for the
 *                   exit trap.
 */
export function buildTranscriptCaptureBlock({ role }) {
  const transcriptPath = `/tmp/devhub-swarm-${role || 'agent'}.transcript`;
  return [
    '# T-016.4 — per-agent transcript capture via tmux pipe-pane.',
    '# The transcript is the durable evidence trail of what the LLM',
    '# actually said/thought. The /tmp/*.log is wrapper diagnostics only.',
    `DEVHUB_TRANSCRIPT_FILE="${transcriptPath}"`,
    '{',
    `  echo "# DevHub agent transcript"`,
    `  echo "# launch_id: \${DEVHUB_MISSION_ID:-unknown}"`,
    `  echo "# role: \${DEVHUB_ROLE:-${role || 'agent'}}"`,
    `  echo "# started: $(date -Iseconds)"`,
    `  echo "# ----"`,
    `} > "$DEVHUB_TRANSCRIPT_FILE" 2>/dev/null`,
    '# Bootstrap prompt is also written to the transcript so the user',
    '# can see what the agent was given, not just what it produced.',
    `echo "[bootstrap prompt at $(date -Iseconds)]" >> "$DEVHUB_TRANSCRIPT_FILE"`,
    `# The actual bootstrap prompt is written by buildBootstrapPromptBlock`,
    '# (it concatenates after this header).',
  ].join('\n');
}

/**
 * T-016.4 — Returns the pipe-pane attach + removal commands for the
 * launch + exit-trap. Kept separate from buildTranscriptCaptureBlock so
 * the exit-trap site in buildAgentLaunchWrapper can call it cleanly.
 *
 * @param {object} params
 * @param {string} params.role
 * @returns {{ attach: string, detach: string }}
 */
export function buildPipePaneCommands({ role }) {
  const transcriptPath = `/tmp/devhub-swarm-${role || 'agent'}.transcript`;
  // Attach: tee every byte the LLM prints into the transcript.
  //   -o means "stdout only" (do not capture pane stderr separately)
  //   Use the literal transcript path (set by buildTranscriptCaptureBlock
  //   in DEVHUB_TRANSCRIPT_FILE) so the test that asserts the path also
  //   asserts the path appears in the pipe-pane target.
  const attach = `tmux pipe-pane -t "\${DEVHUB_TMUX_SESSION}" -o "cat >> \${DEVHUB_TRANSCRIPT_FILE:-${transcriptPath}} 2>/dev/null"`;
  // Detach: empty target command stops the pipe-pane cleanly.
  // tmux pipe-pane -t <session> with no command prints/clears the pipe.
  const detach = `tmux pipe-pane -t "\${DEVHUB_TMUX_SESSION}"`;
  return { attach, detach };
}

export function buildDirectorTmuxInjection(directorTmuxSession) {
  if (!directorTmuxSession) {
    return '# _devhub_tell_director skipped (no director tmux session)';
  }
  // T-006 — shim replaces the 78-line HMAC body. Old call sites that invoke
  // _devhub_tell_director still work but now write to team_chat (the bus) instead
  // of POSTing signed HTTP to /api/agenthub/events. Workers no longer need the
  // circuit breaker, retries, or HMAC plumbing — the bus is durable and atomic.
  // Set DEVHUB_INBOX_SHIM_DISABLED=true to make the shim a no-op (emergency cutover).
  return [
    '# T-006 — _devhub_tell_director is a thin shim around the agent comms bus.',
    '# It writes to team_chat (durable SQLite) instead of HTTP+HMAC. Old call',
    '# sites still work; new code should call _devhub_chat directly.',
    '_devhub_tell_director() {',
    '  if [ "${DEVHUB_INBOX_SHIM_DISABLED:-}" = "true" ]; then',
    '    echo "WARN _devhub_tell_director disabled via DEVHUB_INBOX_SHIM_DISABLED" >&2',
    '    return 0',
    '  fi',
    '  echo "WARN _devhub_tell_director is deprecated; use _devhub_chat" >&2',
    '  _devhub_chat "${1:-}" --to director --kind report || true',
    '}',
  ].join('\n');
}

/**
 * Build an auto-restart loop for the inner command.
 * Re-executes innerCommand on non-zero exit, max 3 restarts, 5s delay.
 * @param {object} params
 * @returns {string} Shell auto-restart loop
 */
export function buildAutoRestartLoopCommand({ innerCommand }) {
  return `MAX_RESTARTS=3
RESTART_DELAY=5
_devhub_RESTART_COUNT=\${_devhub_RESTART_COUNT:-0}
_devhub_restart_if_needed() {
  if [ "\$_devhub_RESTART_COUNT" -ge "\$MAX_RESTARTS" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AGENT] Max restarts (\$MAX_RESTARTS) reached. Exiting." >> "$AGENT_LOG"
    exit 1
  fi
  sleep \$RESTART_DELAY
  _devhub_RESTART_COUNT=\$((_devhub_RESTART_COUNT + 1))
}
_devhub_run_inner() {
  ${innerCommand}
}
while true; do
  _devhub_run_inner 2>&1
  AGENT_EXIT_CODE=\$?
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AGENT] Inner command exited with code: \${AGENT_EXIT_CODE}" >> "$AGENT_LOG"
  if [ \${AGENT_EXIT_CODE} -eq 0 ]; then
    exit 0
  fi
  if [ \${AGENT_EXIT_CODE} -ne 0 ]; then
    _devhub_restart_if_needed
  fi
done`;
}

/**
 * Build the exit event command.
 *
 * T-014: rewritten to use `devhub-bus event-write` instead of an HMAC-signed
 * curl POST to /api/agenthub/events (retired in T-007). Every agent exit
 * previously burned an openssl roundtrip on a 410 endpoint.
 *
 * The bus is the single path from bash to better-sqlite3 (see
 * buildBusHelpersBlock). `_DEVHUB_BUS_BIN` and `_DEVHUB_BUS_DB` are set there.
 *
 * `supervisorUrl` is kept in the signature for caller compatibility with
 * buildAgentLaunchWrapper — it is no longer used.
 *
 * T-016.4: optionally accepts `transcriptDetach` — a tmux pipe-pane
 * removal command that detaches the transcript capture on agent exit
 * so the tmux session is cleaned up.
 *
 * @param {object} params
 * @param {string} [params.supervisorUrl] - unused, kept for caller compat
 * @param {string} params.agentId
 * @param {string} params.missionId
 * @param {string} [params.transcriptDetach] - T-016.4 pipe-pane removal command
 * @returns {string} Shell trap command
 */
export function buildExitTrapCommand({
  supervisorUrl: _supervisorUrl,
  agentId: _agentId,
  missionId: _missionId,
  transcriptDetach = null,
  directorConsumerCleanup = null,
}) {
  const detachBlock = transcriptDetach
    ? [
        '  # T-016.4 — detach transcript pipe-pane so the session is cleaned up.',
        `  ${transcriptDetach} 2>/dev/null || true`,
      ].join('\n')
    : '';
  const directorCleanupBlock = directorConsumerCleanup
    ? [
        '  # T-017.1 — kill the background director-consume process (if any)',
        // so we do not leak a tail -F consumer on every director exit.',
        directorConsumerCleanup,
      ].join('\n')
    : '';
  // T-020: self-metrics block. Runs in the exit trap BEFORE the bus
  // event-write so we always capture a sample (even on bus failures).
  // The block samples this process and its children for cpu/rss/etime,
  // appending to /tmp/devhub-swarm-${role}.metrics. Best-effort — if
  // `ps` or `pgrep` are missing, the file just doesn't get a sample.
  const selfMetricsBlock = [
    '  # T-020 — self-metrics: sample this process + children',
    '  if [ -n "${DEVHUB_AGENT_PID:-}" ]; then',
    '    {',
    '      echo "[metrics-$(date -Iseconds)] agent_pid=$DEVHUB_AGENT_PID"',
    '      ps -p "$DEVHUB_AGENT_PID" -o pid,vsz,rss,pcpu,pmem,etime,comm 2>/dev/null || echo "ps: process $DEVHUB_AGENT_PID not found"',
    '      # Children: walk one level of pgrep -P and ps each',
    '      pgrep -P "$DEVHUB_AGENT_PID" 2>/dev/null | while read -r _devhub_child_pid; do',
    '        ps -p "$_devhub_child_pid" -o pid,vsz,rss,pcpu,pmem,comm 2>/dev/null',
    '      done',
    '    } >> "/tmp/devhub-swarm-${DEVHUB_ROLE:-unknown}.metrics" 2>&1',
    '  fi',
  ].join('\n');
  return `_devhub_exit_handler() {
  local _devhub_AGENT_EXIT_CODE=$?
${detachBlock}
${directorCleanupBlock}
${selfMetricsBlock}
  if [ -n "$DEVHUB_MISSION_ID" ] && [ -n "$DEVHUB_AGENT_ID" ]; then
    local _DEVHUB_EXIT_PAYLOAD
    _DEVHUB_EXIT_PAYLOAD=$(printf '{"agent_id":"%s","role":"%s","exit_code":%d,"ts":"%s"}' \\
      "$DEVHUB_AGENT_ID" "$DEVHUB_ROLE" "$_devhub_AGENT_EXIT_CODE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")
    "$_DEVHUB_BUS_BIN" event-write \\
      --mission "$DEVHUB_MISSION_ID" \\
      --source "$DEVHUB_AGENT_ID" \\
      --kind process_exit \\
      --payload "$_DEVHUB_EXIT_PAYLOAD" \\
      2>/dev/null || true
  fi
}
trap _devhub_exit_handler EXIT`;
}

/**
 * Build the complete agent launch wrapper script.
 *
 * @param {object} params
 * @param {string} params.agentId
 * @param {string} params.missionId
 * @param {string} params.role
 * @param {string} params.workspacePath
 * @param {string} [params.workspaceId]
 * @param {string} [params.runId]
 * @param {string} [params.supervisorUrl]
 * @param {string} params.innerCommand - The actual agent command (opencode/codex/hermes)
 * @param {boolean} [params.disableMinimaxMcp] - T-016.3: opt out of
 *   minimax MCP env var injection. Forwarded to buildAgentEnvExports.
 * @returns {string} Complete shell script
 */
export function buildAgentLaunchWrapper({
  agentId,
  missionId,
  role,
  workspacePath,
  workspaceId,
  runId,
  supervisorUrl,
  tmuxSessionName,
  directorTmuxSession,
  bootstrapPrompt,
  innerCommand,
  modelProvider,
  dbPath,
  busBinaryPath,
  disableMinimaxMcp,
  // T-019.2: configurable TUI wait timings (milliseconds).
  //   - tuiWaitTimeoutMs: max wait-for duration (default 10000)
  //   - tuiReadyGraceMs:  grace period before sentinel (default 2000)
  // Both are converted to seconds in the emitted bash (1s granularity).
  tuiWaitTimeoutMs = 10000,
  tuiReadyGraceMs = 2000,
}) {
  const pathValidationBlock = [
    '# Validate worktree path exists',
    `if [ ! -d "${workspacePath}" ]; then`,
    `  echo "ERROR: Worktree path does not exist: ${workspacePath}" >&2`,
    `  exit 1`,
    `fi`,
  ].join('\n');

  const cdBlock = [
    `# Change to agent's isolated worktree`,
    `cd "${workspacePath}" || {`,
    `  echo "ERROR: Failed to cd into worktree: ${workspacePath}" >&2`,
    `  exit 1`,
    `}`,
  ].join('\n');

  // T-016.4 — transcript pipe-pane commands (attach at startup, detach
  // on exit). The detach command is injected into the exit trap below.
  const pipePane = tmuxSessionName ? buildPipePaneCommands({ role }) : null;

  // T-017.1 — director consumer block (only emitted for the director role).
  // Workers don't tail chat.jsonl — they read durable inbox rows on demand
  // via _devhub_inbox_check.
  const isDirectorRole = role === 'director';
  const directorConsumerBlock = isDirectorRole
    ? buildDirectorConsumerBlock({
        busBinaryPath,
        missionId,
        sessionName: tmuxSessionName,
      })
    : '';
  const directorConsumerCleanup = isDirectorRole
    ? buildDirectorConsumerCleanupBlock({ launchId: missionId })
    : null;

  // T-017.1 — pre-bootstrap sleep (2s for director, 0 for workers). The
  // director needs the extra time so the consumer can attach to the tmux
  // pane before the bootstrap prompt is injected.
  const preBootstrapSleepSeconds = isDirectorRole ? 2 : 0;

  const parts = [
    '#!/usr/bin/env bash',
    '# DevHub Agent Launch Wrapper',
    '# Generated by DevHub — does NOT use Plyrium runtime',
    '',
    pathValidationBlock,
    cdBlock,
    '',
    buildAgentEnvExports({
      agentId,
      missionId,
      role,
      workspacePath,
      workspaceId,
      runId,
      supervisorUrl,
      tmuxSessionName,
      directorSessionName: directorTmuxSession,
      modelProvider,
      dbPath,
      disableMinimaxMcp,
    }),
    '',
    // T-003 — bus helpers (only emitted if dbPath + busBinaryPath are provided)
    buildBusHelpersBlock({ busBinaryPath, dbPath }),
    '',
    // T-016.4 — transcript header (created before identity so the file
    // exists even if the wrapper aborts at the cwd check).
    buildTranscriptCaptureBlock({ role }),
    '',
    buildIdentityVerificationBlock({
      agentId,
      missionId,
      role,
      workspacePath,
    }),
    '',
    // T-019.1: event-driven TUI ready detection. Replaces the previous
    // bare `sleep 10` inside the bootstrap block. Runs BEFORE the
    // bootstrap prompt is queued so the TUI is ready when the prompt
    // arrives. Only emitted when a tmux session is configured.
    // T-019.2: timeouts are configurable from buildAgentLaunchWrapper
    // params (default 2s grace, 10s wait-for timeout).
    ...(tmuxSessionName
      ? [
          buildTuiWaitForBlock({
            sessionName: tmuxSessionName,
            graceSeconds: Math.max(0, Math.floor(tuiReadyGraceMs / 1000)),
            timeoutSeconds: Math.max(1, Math.floor(tuiWaitTimeoutMs / 1000)),
          }),
        ]
      : []),
    '',
    buildBootstrapPromptBlock(bootstrapPrompt, { preSleepSeconds: preBootstrapSleepSeconds }),
    '',
    // T-016.4 — attach the transcript pipe-pane after the bootstrap
    // prompt is queued. Detach happens in the exit trap below.
    ...(pipePane ? ['# T-016.4 — attach transcript capture', pipePane.attach] : []),
    '',
    buildInitialHeartbeatCommand({
      supervisorUrl,
      agentId,
      missionId,
      role,
      workspacePath,
    }),
    '',
    buildHeartbeatLoopCommand({
      supervisorUrl,
      agentId,
      missionId,
      role,
      workspacePath,
    }),
    '',
    buildPendingDeliveriesPollingCommand({
      supervisorUrl,
      agentId,
      missionId,
    }),
    '',
    buildExitTrapCommand({
      supervisorUrl,
      agentId,
      missionId,
      // T-016.4 — also detach the pipe-pane on exit so the session is
      // cleaned up. The bus event-write is the primary exit signal.
      transcriptDetach: pipePane ? pipePane.detach : null,
      // T-017.1 — also kill the background director-consume process on
      // exit so we don't leak a tail -F consumer per launch.
      directorConsumerCleanup,
    }),
    '',
    buildDirectorTmuxInjection(directorTmuxSession),
    '',
    '# Setup logging for agent output',
    'AGENT_LOG="/tmp/devhub-swarm-${DEVHUB_ROLE:-agent}.log"',
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AGENT] Starting agent: \${DEVHUB_ROLE}" >> "$AGENT_LOG"`,
    '',
    // T-017.1 — director consumer (background tail -F + tmux send-keys).
    // The 2s sleep above already gave the consumer time to attach.
    ...(directorConsumerBlock ? [directorConsumerBlock] : []),
    '',
    '# Execute the actual agent via auto-restart loop',
    '# Captures both stdout and stderr to log; restarts on non-zero exit (max 3)',
    buildAutoRestartLoopCommand({ innerCommand }),
  ];

  return parts.join('\n');
}
