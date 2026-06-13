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
import { buildWrapperWithCache } from './operations/wrapperBashCache.js';

import { Buffer } from 'node:buffer';
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
  projectId,
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
    `export DEVHUB_PROJECT_ID="${projectId || ''}"`,
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

  // OpenCode/bash tool subprocesses are non-interactive; BASH_ENV sources persisted helpers.
  if (missionId && dbPath) {
    const helpersFile = `/tmp/devhub-mission-${missionId}/bus-helpers.sh`;
    const helpersBin = `/tmp/devhub-mission-${missionId}/bin`;
    exports.push(`export DEVHUB_BUS_HELPERS_FILE="${helpersFile}"`);
    exports.push(`export BASH_ENV="${helpersFile}"`);
    exports.push(`export PATH="${helpersBin}:$PATH"`);
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

/**
 * Persist bus helpers to disk and wire BASH_ENV so OpenCode/bash-tool subprocesses
 * can call `_devhub_*` even though they are not children of the wrapper shell.
 */
export function buildBusHelpersPersistBlock({ missionId, busBinaryPath, dbPath }) {
  if (!missionId || !busBinaryPath || !dbPath) {
    return '# Bus helpers persist skipped (missing missionId, busBinaryPath, or dbPath)';
  }
  const missionDir = `/tmp/devhub-mission-${missionId}`;
  const helpersBody = buildBusHelpersBlock({ busBinaryPath, dbPath });
  return [
    '# Persist bus helpers for non-interactive shells (OpenCode bash tool, bash -c).',
    `mkdir -p "${missionDir}"`,
    `DEVHUB_BUS_HELPERS_FILE="${missionDir}/bus-helpers.sh"`,
    `cat > "$DEVHUB_BUS_HELPERS_FILE" <<'DEVHUB_BUS_HELPERS_EOF'`,
    helpersBody,
    `DEVHUB_BUS_HELPERS_EOF`,
    `chmod 644 "$DEVHUB_BUS_HELPERS_FILE" 2>/dev/null || true`,
    `export DEVHUB_BUS_HELPERS_FILE`,
    `export BASH_ENV="$DEVHUB_BUS_HELPERS_FILE"`,
  ].join('\n');
}

/**
 * Installs PATH shims so OpenCode tools that only search PATH still find `_devhub_*`.
 * Must run after buildBusHelpersPersistBlock writes bus-helpers.sh.
 */
export function buildBusHelpersShimBlock({ missionId }) {
  if (!missionId) {
    return '# Bus helper shims skipped (missing missionId)';
  }
  const missionDir = `/tmp/devhub-mission-${missionId}`;
  const binDir = `${missionDir}/bin`;
  const shimNames = ['_devhub_chat', '_devhub_event', '_devhub_presence', '_devhub_inbox_check'];
  const lines = [
    '# PATH shims for _devhub_* helpers (OpenCode bash tool compatibility).',
    `mkdir -p "${binDir}"`,
  ];
  for (const name of shimNames) {
    lines.push(
      `cat > "${binDir}/${name}" <<'DEVHUB_BUS_SHIM_EOF'`,
      '#!/usr/bin/env bash',
      `source "${missionDir}/bus-helpers.sh"`,
      `${name} "$@"`,
      'DEVHUB_BUS_SHIM_EOF',
      `chmod 755 "${binDir}/${name}" 2>/dev/null || true`
    );
  }
  lines.push(`export PATH="${binDir}:$PATH"`);
  return lines.join('\n');
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

const BOOTSTRAP_HEREDOC_DELIMITER_RE = /^DEVHUB_BOOTSTRAP_(?:PROMPT|TRANSCRIPT|CHUNK_\d+)$/;

/**
 * Wait until the DevHub terminal client writes /tmp/devhub-viewport-ready-<tmux>.
 * Bootstrap prompt injection must not run while the PTY still has the spawn
 * default size (120×32) or tmux paste-buffer fragments escape noise into the TUI.
 */
export const BOOTSTRAP_MIN_VIEWPORT_COLS = 64;
export const BOOTSTRAP_MIN_VIEWPORT_ROWS = 18;
export const BOOTSTRAP_VIEWPORT_MAX_WAIT_SECONDS = 20;
export const BOOTSTRAP_VIEWPORT_UNDERSIZED_MAX_ATTEMPTS = 8;

export function buildViewportReadyWaitBlock({
  pollIntervalSeconds = 0.5,
  maxWaitSeconds = BOOTSTRAP_VIEWPORT_MAX_WAIT_SECONDS,
  minCols = BOOTSTRAP_MIN_VIEWPORT_COLS,
  minRows = BOOTSTRAP_MIN_VIEWPORT_ROWS,
  maxUndersizedAttempts = BOOTSTRAP_VIEWPORT_UNDERSIZED_MAX_ATTEMPTS,
} = {}) {
  const maxAttempts = Math.max(1, Math.ceil(maxWaitSeconds / pollIntervalSeconds));
  const sleepArg = Number(pollIntervalSeconds).toFixed(1);
  return [
    '# Wait for DevHub UI to fit the tmux pane before prompt injection.',
    '_devhub_wait_viewport_ready() {',
    '  local _ready_file="/tmp/devhub-viewport-ready-${_tmux_session}"',
    `  local _attempt=0`,
    `  local _undersized=0`,
    `  local _max_attempts=${maxAttempts}`,
    `  local _max_undersized=${Math.max(1, Math.floor(maxUndersizedAttempts))}`,
    `  local _min_cols=${Math.max(1, Math.floor(minCols))}`,
    `  local _min_rows=${Math.max(1, Math.floor(minRows))}`,
    '  while [ $_attempt -lt $_max_attempts ]; do',
    '    if [ -f "$_ready_file" ]; then',
    `      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Viewport ready marker found: $_ready_file"`,
    '      cat "$_ready_file" 2>/dev/null || true',
    '      local _cols _rows',
    '      _cols=$(sed -n \'s/.*"cols":\\([0-9][0-9]*\\).*/\\1/p\' "$_ready_file" 2>/dev/null | head -1)',
    '      _rows=$(sed -n \'s/.*"rows":\\([0-9][0-9]*\\).*/\\1/p\' "$_ready_file" 2>/dev/null | head -1)',
    '      if [ -n "${_cols:-}" ] && [ -n "${_rows:-}" ] && [ "$_cols" -ge "$_min_cols" ] && [ "$_rows" -ge "$_min_rows" ]; then',
    `        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Syncing tmux pane to client viewport \${_cols}x\${_rows}"`,
    '        tmux resize-pane -t "${_tmux_session}:0" -x "$_cols" -y "$_rows" 2>/dev/null || \\',
    '          tmux resize-pane -t "${_tmux_session}" -x "$_cols" -y "$_rows" 2>/dev/null || true',
    '        sleep 0.15',
    '        tmux refresh-client -t "${_tmux_session}" 2>/dev/null || true',
    '        sleep 0.2',
    '        return 0',
    '      fi',
    `      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Viewport marker present but too small (\${_cols:-0}x\${_rows:-0}); waiting for >= \${_min_cols}x\${_min_rows}"`,
    '      _undersized=$((_undersized + 1))',
    '      if [ "$_undersized" -ge "$_max_undersized" ] && [ -n "${_cols:-}" ] && [ -n "${_rows:-}" ]; then',
    `        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Using current viewport \${_cols}x\${_rows} after undersized grace"`,
    '        tmux resize-pane -t "${_tmux_session}:0" -x "$_cols" -y "$_rows" 2>/dev/null || \\',
    '          tmux resize-pane -t "${_tmux_session}" -x "$_cols" -y "$_rows" 2>/dev/null || true',
    '        sleep 0.15',
    '        tmux refresh-client -t "${_tmux_session}" 2>/dev/null || true',
    '        sleep 0.2',
    '        return 0',
    '      fi',
    '    fi',
    `    sleep ${sleepArg}`,
    '    _attempt=$((_attempt + 1))',
    '  done',
    `  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] WARN: viewport ready timeout; injecting anyway"`,
    '}',
    '_devhub_wait_viewport_ready',
  ].join('\n');
}

/**
 * Poll /tmp/devhub-opencode-ready-<tmux> instead of a fixed sleep before bootstrap.
 * The sidecar/client writes this marker when OpenCode session/TUI footer is detected.
 */
export const BOOTSTRAP_OPENCODE_READY_REASONS = ['client-tui-footer', 'sidecar-tui-footer'];
export const BOOTSTRAP_POST_READY_SETTLE_SECONDS = 2;

export function buildOpencodeReadyWaitBlock({
  pollIntervalSeconds = 0.25,
  maxWaitSeconds = 12,
  postReadySettleSeconds = BOOTSTRAP_POST_READY_SETTLE_SECONDS,
} = {}) {
  const maxAttempts = Math.max(1, Math.ceil(maxWaitSeconds / pollIntervalSeconds));
  const sleepArg =
    Number(pollIntervalSeconds)
      .toFixed(2)
      .replace(/\.?0+$/, '') || '0.25';
  const settleArg =
    Number(postReadySettleSeconds)
      .toFixed(2)
      .replace(/\.?0+$/, '') || '2';
  return [
    '# Wait until OpenCode TUI footer is detected before bootstrap injection.',
    '# Viewport-ready alone is NOT sufficient — it fires when the DevHub client',
    '# attaches, often before OpenCode accepts keyboard input.',
    '_devhub_wait_opencode_ready() {',
    '  local _tmux_session="${DEVHUB_TMUX_SESSION:-}"',
    '  if [ -z "${_tmux_session:-}" ]; then',
    '    _tmux_session=$(tmux display-message -p "#S" 2>/dev/null) || true',
    '  fi',
    '  if [ -z "${_tmux_session:-}" ]; then',
    `    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] WARN: no tmux session for opencode-ready wait; skipping"`,
    '    return 0',
    '  fi',
    '  local _ready_file="/tmp/devhub-opencode-ready-${_tmux_session}"',
    `  local _attempt=0`,
    `  local _max_attempts=${maxAttempts}`,
    '  while [ $_attempt -lt $_max_attempts ]; do',
    '    if [ -f "$_ready_file" ]; then',
    '      local _reason',
    '      _reason=$(sed -n \'s/.*"reason":"\\([^"]*\\)".*/\\1/p\' "$_ready_file" 2>/dev/null | head -1)',
    '      case "${_reason:-}" in',
    '        client-tui-footer|sidecar-tui-footer)',
    `          echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] OpenCode TUI footer ready ($_reason): $_ready_file"`,
    '          cat "$_ready_file" 2>/dev/null || true',
    `          sleep ${settleArg}`,
    '          return 0',
    '          ;;',
    '        viewport-ready-fallback|client-detected|*)',
    `          echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Weak ready signal (\${_reason:-unknown}); waiting for TUI footer"`,
    '          ;;',
    '      esac',
    '    fi',
    `    sleep ${sleepArg}`,
    '    _attempt=$((_attempt + 1))',
    '  done',
    `  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] ERROR: opencode ready timeout (${maxWaitSeconds}s); skipping bootstrap injection"`,
    '  return 1',
    '}',
  ].join('\n');
}

function indentBashBlock(block = '', spaces = 4) {
  const pad = ' '.repeat(spaces);
  return String(block || '')
    .split('\n')
    .map((line) => {
      if (line.length === 0) return line;
      // Bash heredoc closers must start at column 0 (unless <<- with tabs).
      // buildChunkedBootstrapPromptBlock emits bare delimiter tags; keep them
      // unindented so `bash -n` accepts the generated launch wrapper.
      if (BOOTSTRAP_HEREDOC_DELIMITER_RE.test(line)) return line;
      return `${pad}${line}`;
    })
    .join('\n');
}

function buildBootstrapPromptBlock(
  prompt = '',
  { preSleepSeconds = 0, invokeInBackground = true } = {}
) {
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

  // T2.2 — chunked emission replaces the legacy single-shot paste that
  // overflowed tmux pipe-pane buffers and leaked escape noise into sibling panes.
  const chunkedInjection = indentBashBlock(buildChunkedBootstrapPromptBlock(prompt), 4);

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
    '    # Deduplication: skip if already injected successfully',
    '    if [ -f "$BOOTSTRAP_LOCK" ]; then',
    `      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] SKIP: Prompt already injected (lock exists: $BOOTSTRAP_LOCK)"`,
    '      return 0',
    '    fi',
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
    '    local _tmux_target="${_tmux_session}:0.0"',
    '    if ! tmux has-session -t "${_tmux_session}" 2>/dev/null; then',
    `      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] ERROR: tmux session not found: \${_tmux_session}"`,
    '      return 1',
    '    fi',
    `    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Loading prompt into tmux pane \${_tmux_target} (chunked)..."`,
    // T-016.4 — also write the bootstrap prompt into the transcript file
    // (with a header marker) so the user can see what the agent was given.
    `    {`,
    `      echo "[bootstrap prompt at $(date '+%Y-%m-%d %H:%M:%S')]"`,
    `      cat <<'DEVHUB_BOOTSTRAP_TRANSCRIPT'`,
    prompt,
    `DEVHUB_BOOTSTRAP_TRANSCRIPT`,
    `      echo "----"`,
    `    } >> "$DEVHUB_TRANSCRIPT_FILE" 2>/dev/null || true`,
    indentBashBlock(buildViewportReadyWaitBlock(), 4),
    chunkedInjection,
    '  } >> "$DEVHUB_LOG_FILE" 2>&1',
    '}',
    invokeInBackground ? '(_devhub_bootstrap_prompt) &' : '',
  ]
    .filter(Boolean)
    .join('\n');
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
      _hb_body=$(printf '%s' "$_resp" | sed '$d' | tr -d '\\n' | head -c 200)
      echo "WARN: devhub heartbeat returned \${_http_code}: \${_hb_body}" >&2
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
 *   (default 10s; falls back to 2s only if tuiReadyGraceMs is unset).
 *   Configurable via tuiReadyGraceMs on the wrapper.
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
 * Background inbox poller for swarm workers and ZED.
 * Reads durable team_inbox rows for this role and injects directive text
 * into the tmux pane so OpenCode does not require manual `_devhub_inbox_check`.
 */
export function buildWorkerInboxConsumerBlock({
  busBinaryPath,
  missionId,
  role,
  sessionName,
  pollIntervalSeconds = null,
} = {}) {
  if (!busBinaryPath || !sessionName || !role || role === 'director') {
    return '# Worker inbox consumer skipped (missing busBinaryPath, sessionName, or role)';
  }
  const launchTag = missionId || 'launch-unknown';
  const roleTag = role || 'worker';
  const pollSeconds =
    Number.isFinite(pollIntervalSeconds) && pollIntervalSeconds > 0
      ? Math.max(5, Math.floor(pollIntervalSeconds))
      : '${DEVHUB_INBOX_POLL_SEC:-5}';
  return [
    '# Worker inbox consumer: poll team_inbox → inject directives into the OpenCode pane.',
    'export DEVHUB_INBOX_POLL_SEC="${DEVHUB_INBOX_POLL_SEC:-5}"',
    `nohup "$_DEVHUB_BUS_NODE" "$_DEVHUB_BUS_BIN" inbox-consume \\`,
    `  --db "$_DEVHUB_BUS_DB" \\`,
    `  --mission "${launchTag}" \\`,
    `  --role "${roleTag}" \\`,
    `  --target-session "${sessionName}" \\`,
    `  --poll-interval ${pollSeconds} \\`,
    `  >> "$AGENT_LOG" 2>&1 &`,
    `_worker_inbox_consume_pid=$!`,
    `echo "$_worker_inbox_consume_pid" > "/tmp/devhub-worker-inbox-consume-${launchTag}-${roleTag}.pid"`,
    `echo "[$(date -Iseconds 2>/dev/null || date)] inbox-consume pid=\$_worker_inbox_consume_pid poll=\${DEVHUB_INBOX_POLL_SEC:-5}s role=${roleTag}" >> "\${DEVHUB_TRANSCRIPT_FILE:-/tmp/devhub-swarm-${roleTag}.transcript}" 2>/dev/null || true`,
  ].join('\n');
}

export function buildWorkerInboxConsumerCleanupBlock({ launchId, role } = {}) {
  const tag = `${launchId || 'launch-unknown'}-${role || 'worker'}`;
  return [
    `  if [ -f "/tmp/devhub-worker-inbox-consume-${tag}.pid" ]; then`,
    `    kill "$(cat /tmp/devhub-worker-inbox-consume-${tag}.pid)" 2>/dev/null || true`,
    `    rm -f "/tmp/devhub-worker-inbox-consume-${tag}.pid"`,
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
export function buildAutoRestartLoopCommand({
  innerCommand,
  deferBootstrap = false,
  tuiGraceSeconds = 12,
} = {}) {
  const runInnerBody = deferBootstrap
    ? [
        '(',
        '  if _devhub_wait_opencode_ready; then',
        '    if declare -F _devhub_bootstrap_prompt >/dev/null 2>&1; then',
        '      _devhub_bootstrap_prompt',
        '    fi',
        '  else',
        `    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] SKIP: OpenCode TUI not ready; bootstrap not injected" >> "$AGENT_LOG"`,
        '  fi',
        ') >> "$AGENT_LOG" 2>&1 &',
        innerCommand,
      ].join('\n  ')
    : innerCommand;

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
  ${runInnerBody}
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
  workerInboxConsumerCleanup = null,
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
  const workerInboxCleanupBlock = workerInboxConsumerCleanup
    ? ['  # Kill the background worker inbox consumer (if any)', workerInboxConsumerCleanup].join(
        '\n'
      )
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
  return `_devhub_invoke_helper() {
  local _fn="$1"
  shift
  if declare -F "$_fn" >/dev/null 2>&1; then
    "$_fn" "$@"
    return $?
  fi
  if command -v "$_fn" >/dev/null 2>&1; then
    "$_fn" "$@"
    return $?
  fi
  if [ -n "\${DEVHUB_BUS_HELPERS_FILE:-}" ] && [ -f "\$DEVHUB_BUS_HELPERS_FILE" ]; then
    # shellcheck source=/dev/null
    source "\$DEVHUB_BUS_HELPERS_FILE"
    if declare -F "$_fn" >/dev/null 2>&1; then
      "$_fn" "$@"
      return $?
    fi
  fi
  return 127
}
_devhub_exit_handler() {
  local _devhub_AGENT_EXIT_CODE=$?
${detachBlock}
${directorCleanupBlock}
${workerInboxCleanupBlock}
${selfMetricsBlock}
  _devhub_invoke_helper _devhub_presence --state offline --summary "process exit code=\${_devhub_AGENT_EXIT_CODE}" --ttl 60 2>/dev/null || true
  if [ -n "\${DEVHUB_ROLE:-}" ] && [ "\$DEVHUB_ROLE" != "director" ]; then
    _devhub_invoke_helper _devhub_chat "Worker \${DEVHUB_ROLE} exiting (code=\${_devhub_AGENT_EXIT_CODE})" --to director --kind report 2>/dev/null || true
  fi
  if [ -n "$DEVHUB_MISSION_ID" ] && [ -n "$DEVHUB_AGENT_ID" ]; then
    local _DEVHUB_EXIT_PAYLOAD
    _DEVHUB_EXIT_PAYLOAD=$(printf '{"agent_id":"%s","role":"%s","exit_code":%d,"ts":"%s"}' \\
      "$DEVHUB_AGENT_ID" "$DEVHUB_ROLE" "$_devhub_AGENT_EXIT_CODE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")
    "\$_DEVHUB_BUS_NODE" "\$_DEVHUB_BUS_BIN" event-write \\
      --db "\$_DEVHUB_BUS_DB" \\
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
  projectId,
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
  inboxPollIntervalSeconds,
  // T-022: TUI wait timings (milliseconds).
  //   - tuiWaitTimeoutMs: UNUSED (default 10000), kept for backward compat
  //   - tuiReadyGraceMs:  max wait for opencode-ready marker (default 12000)
  // Swarm panels poll /tmp/devhub-opencode-ready-<tmux> (written by sidecar
  // when OpenCode session/footer is detected) instead of a fixed sleep.
  tuiWaitTimeoutMs = 10000,
  tuiReadyGraceMs = 30000,
  preLaunchDelayMs = 0,
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

  // T-017.1 — pre-bootstrap sleep (2s for orchestrators, 0 for workers). The
  // orchestrator needs the extra time so the consumer can attach to the tmux
  // pane before the bootstrap prompt is injected.
  const isOrchestratorRole = role === 'director' || role === 'zed';
  const isDirectorRole = role === 'director';
  const preBootstrapSleepSeconds = isOrchestratorRole ? 2 : 0;
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
  const shouldRunWorkerInboxConsumer =
    Boolean(role) && !isOrchestratorRole && Boolean(tmuxSessionName) && Boolean(busBinaryPath);
  const workerInboxConsumerBlock = shouldRunWorkerInboxConsumer
    ? buildWorkerInboxConsumerBlock({
        busBinaryPath,
        missionId,
        role,
        sessionName: tmuxSessionName,
        pollIntervalSeconds: inboxPollIntervalSeconds,
      })
    : '';
  const workerInboxConsumerCleanup = shouldRunWorkerInboxConsumer
    ? buildWorkerInboxConsumerCleanupBlock({ launchId: missionId, role })
    : null;

  const preLaunchDelaySeconds = Math.max(0, Number(preLaunchDelayMs) || 0) / 1000;
  const panelTmuxBacked =
    Boolean(String(innerCommand || '').trim()) &&
    !String(innerCommand).includes('tmux attach-session');
  const deferBootstrapUntilAgentStart =
    panelTmuxBacked && Boolean(String(bootstrapPrompt || '').trim());
  const tuiGraceSeconds = Math.max(0, Math.floor(tuiReadyGraceMs / 1000));

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
      projectId,
      runId,
      supervisorUrl,
      tmuxSessionName,
      directorSessionName: directorTmuxSession,
      modelProvider,
      dbPath,
      disableMinimaxMcp,
    }),
    'export DEVHUB_INBOX_POLL_SEC="${DEVHUB_INBOX_POLL_SEC:-5}"',
    '',
    buildBusHelpersPersistBlock({ missionId, busBinaryPath, dbPath }),
    '',
    buildBusHelpersShimBlock({ missionId }),
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
    ...(tmuxSessionName && !deferBootstrapUntilAgentStart
      ? [
          buildTuiWaitForBlock({
            sessionName: tmuxSessionName,
            graceSeconds: tuiGraceSeconds,
            timeoutSeconds: Math.max(1, Math.floor(tuiWaitTimeoutMs / 1000)),
          }),
        ]
      : []),
    '',
    ...(deferBootstrapUntilAgentStart
      ? [
          buildOpencodeReadyWaitBlock({
            maxWaitSeconds: Math.max(3, Math.ceil(tuiReadyGraceMs / 1000)),
          }),
        ]
      : []),
    '',
    buildBootstrapPromptBlock(bootstrapPrompt, {
      preSleepSeconds: deferBootstrapUntilAgentStart
        ? isOrchestratorRole
          ? preBootstrapSleepSeconds
          : 0
        : preBootstrapSleepSeconds,
      invokeInBackground: !deferBootstrapUntilAgentStart,
    }),
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
      workerInboxConsumerCleanup,
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
    ...(workerInboxConsumerBlock ? [workerInboxConsumerBlock] : []),
    '',
    ...(preLaunchDelaySeconds > 0
      ? [
          `# Stagger worker OpenCode startup (${preLaunchDelaySeconds}s) — UI panels attach immediately.`,
          `sleep ${preLaunchDelaySeconds.toFixed(3)}`,
          '',
        ]
      : []),
    '# Execute the actual agent via auto-restart loop',
    '# Captures both stdout and stderr to log; restarts on non-zero exit (max 3)',
    buildAutoRestartLoopCommand({
      innerCommand,
      deferBootstrap: deferBootstrapUntilAgentStart,
      tuiGraceSeconds,
    }),
  ];

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// T1.5 / R-PERF-5 — cached wrapper bash.
//
// The WIP `buildAgentLaunchWrapper` re-emits a 6-10KB bash script for every
// agent role on every launch. Most of the bytes are STATIC across all
// launches of a given agent version: bus helpers, identity, heartbeat
// loop, exit trap. Only the per-launch variable block changes between
// roles/launches.
//
// This module exposes a SHA1-keyed disk cache for the static portion
// of the wrapper. The cache is content-addressed; a new wrapper
// version invalidates it automatically via SHA1 mismatch. The cache
// is co-located with this file at `__dirname/.cache/`.
//
// The integration contract: callers can keep invoking
// `buildAgentLaunchWrapper` directly. New callers that want to
// compose a cached static prefix + a per-launch variable block
// should call `getCachedWrappedBash(staticParts)` and concatenate
// the per-launch block on top. This module does NOT replace the
// WIP builder — it adds a complementary cache layer for callers
// that want the 5-role × ~150ms win without changing existing call
// sites.
// ---------------------------------------------------------------------------

/** Bump this constant when the static-parts contract changes. */
export const WAPPER_BASH_CACHE_VERSION = 1;

/**
 * Get the cached static wrapper prefix, or build + cache it on
 * first call. Returns `{ wrapper, fromCache, cacheFile, sha1 }`.
 *
 * @param {string} staticParts - the static portion of the wrapper
 *   (bus-helpers, identity, heartbeat, exit-trap prologue).
 * @param {object} [options]
 * @param {string} [options.variableBlock=''] - per-launch variable
 *   block appended after the static prefix.
 * @param {string} [options.cacheDir] - override the cache directory
 *   (defaults to `__dirname/.cache`).
 * @returns {{ wrapper: string, fromCache: boolean, cacheFile: string, sha1: string }}
 */
export function getCachedWrappedBash(staticParts, options = {}) {
  if (typeof staticParts !== 'string') {
    throw new TypeError('getCachedWrappedBash: staticParts must be a string');
  }
  return buildWrapperWithCache({
    staticTemplate: staticParts,
    variableBlock: options.variableBlock || '',
    cacheDir: options.cacheDir,
  });
}

// ---------------------------------------------------------------------------
// T2.2 — chunked director prompt emission (R-BUF-2).
//
// The director's bootstrap prompt is a multi-KB string (typically ~24KB).
// Emitting it as a single `tmux load-buffer -` + `tmux paste-buffer` call
// blasts the entire payload into the PTY in one frame, which can overflow
// the tmux pipe-pane and leak fragments like `[[35;60;4M^...` into sibling
// panes. The fix: split the prompt into ~2KB chunks and emit them at ~16ms
// (≈60fps) pacing, then commit with `tmux paste-buffer -d` at the end.
//
// `buildBootstrapPromptBlock` now delegates prompt emission to
// `buildChunkedBootstrapPromptBlock`. Callers can still use
// `planPromptChunks` for a pure chunk plan in tests/tooling.
//
// The pacing uses Bash's `sleep` with a fractional-seconds argument. The
// interval is configurable so callers (and tests) can adjust the cadence;
// the default of 16ms mirrors one frame at 60fps.
// ---------------------------------------------------------------------------

export const T2_2_PROMPT_CHUNK_BYTES_DEFAULT = 2048;
export const T2_2_PROMPT_CHUNK_PACING_MS_DEFAULT = 16;
export const T2_2_PROMPT_CHUNK_MAX_CHUNKS_DEFAULT = 12;

/**
 * T2.2 — split a prompt into ~2KB chunks for paced emission.
 *
 * Returns a plan with explicit `delayMsBefore` per chunk so the caller
 * (or the test) can verify pacing with fake timers. The plan is pure
 * data — no I/O, no side effects.
 *
 * @param {string} prompt - the raw prompt string
 * @param {object} [options]
 * @param {number} [options.chunkBytes=2048] - target chunk size in bytes
 * @param {number} [options.intervalMs=16] - delay between chunks in ms
 * @param {number} [options.maxChunks=12] - hard cap on chunk count
 * @returns {{
 *   chunks: Array<{ index: number, text: string, bytes: number, delayMsBefore: number }>,
 *   totalBytes: number,
 *   chunkCount: number,
 *   plannedDurationMs: number
 * }}
 */
export function planPromptChunks(prompt, options = {}) {
  const text = String(prompt || '');
  if (!text) {
    return { chunks: [], totalBytes: 0, chunkCount: 0, plannedDurationMs: 0 };
  }

  const chunkBytes = Math.max(1, Math.floor(options.chunkBytes ?? T2_2_PROMPT_CHUNK_BYTES_DEFAULT));
  const intervalMs = Math.max(
    0,
    Math.floor(options.intervalMs ?? T2_2_PROMPT_CHUNK_PACING_MS_DEFAULT)
  );
  const maxChunks = Math.max(
    1,
    Math.floor(options.maxChunks ?? T2_2_PROMPT_CHUNK_MAX_CHUNKS_DEFAULT)
  );

  // Encode once so byte counts are stable regardless of multibyte chars.
  const encoded = Buffer.from(text, 'utf8');
  const totalBytes = encoded.length;

  const rawChunks = [];
  for (let offset = 0; offset < totalBytes; offset += chunkBytes) {
    rawChunks.push(encoded.subarray(offset, Math.min(offset + chunkBytes, totalBytes)));
  }
  // Honor maxChunks — if the prompt is larger than maxChunks*chunkBytes,
  // the last raw chunk is a tail that gets appended to the last emitted
  // chunk (so we never exceed the cap; we also never drop data).
  const emitted = rawChunks.slice(0, maxChunks).map((c) => Buffer.from(c));
  if (rawChunks.length > maxChunks) {
    const tail = Buffer.concat(rawChunks.slice(maxChunks));
    emitted[emitted.length - 1] = Buffer.concat([emitted[emitted.length - 1], tail]);
  }

  const chunks = emitted.map((buf, index) => ({
    index,
    text: buf.toString('utf8'),
    bytes: buf.length,
    // The first chunk has 0 delay; subsequent chunks wait `intervalMs`
    // before being emitted (≈60fps for the default 16ms).
    delayMsBefore: index === 0 ? 0 : intervalMs,
  }));

  const plannedDurationMs = chunks.length > 0 ? (chunks.length - 1) * intervalMs : 0;

  return {
    chunks,
    totalBytes,
    chunkCount: chunks.length,
    plannedDurationMs,
  };
}

/**
 * T2.2 — build the bash block that emits a chunked prompt into the tmux
 * pane. Each chunk is `load-buffer`-ed with a fractional `sleep` between
 * chunks; the final `tmux paste-buffer -d` commits and deletes the buffer.
 *
 * Designed to be called from inside `_devhub_bootstrap_prompt` — the
 * caller is responsible for the dedup lock and the tmux-session probe
 * (both happen in the legacy `buildBootstrapPromptBlock`).
 *
 * @param {string} prompt - the raw prompt string
 * @param {object} [options]
 * @param {number} [options.chunkBytes=2048]
 * @param {number} [options.intervalMs=16]
 * @param {number} [options.maxChunks=12]
 * @returns {string} Bash block that emits the prompt in chunks and
 *   commits with `tmux paste-buffer -d`.
 */
export function buildChunkedBootstrapPromptBlock(prompt, options = {}) {
  const text = String(prompt || '');
  if (!text.trim()) {
    return '# Chunked bootstrap skipped (empty prompt)';
  }

  const plan = planPromptChunks(text, options);
  const heredocTag = 'DEVHUB_BOOTSTRAP_PROMPT';

  return [
    '# T2.2 — single-shot bootstrap prompt paste into the OpenCode TUI.',
    `# ${plan.chunkCount} planned chunk(s), ${plan.totalBytes}B total.`,
    '# Load the full prompt once, paste once, then submit. Avoids duplicate',
    '# paste-buffer calls and keeps keyboard input on the foreground TUI.',
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] chunk 1/${plan.chunkCount} (${plan.totalBytes}B)"`,
    `tmux load-buffer - <<'${heredocTag}'`,
    text,
    heredocTag,
    `tmux paste-buffer -d -t "\${_tmux_target}" >/dev/null 2>&1 || TMUX= tmux paste-buffer -d -t "\${_tmux_target}" >/dev/null 2>&1 || { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] ERROR: paste-buffer failed"; return 1; }`,
    `tmux send-keys -t "\${_tmux_target}" C-m >/dev/null 2>&1 || TMUX= tmux send-keys -t "\${_tmux_target}" C-m >/dev/null 2>&1 || echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] WARN: send-keys C-m failed"`,
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] chunked emission complete (${plan.chunkCount} chunks, ${plan.totalBytes}B total)"`,
    `echo "$$" > "$BOOTSTRAP_LOCK"`,
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Prompt injection complete (chunked)."`,
  ].join('\n');
}

/**
 * T2.2 — schedule a chunked prompt emission in the current process.
 *
 * Consumes the plan from `planPromptChunks` and uses `setTimeout` to pace
 * the chunks at the configured interval. Each chunk is delivered to the
 * supplied `onChunk` callback. The last delivery is signaled via the
 * `onCommit` callback (which is where the caller should `tmux
 * paste-buffer -d`).
 *
 * The function is fully synchronous in its plan construction; only the
 * delivery is async via `setTimeout`. Returns a `cancel()` thunk that
 * clears all pending timers.
 *
 * @param {string} prompt - the raw prompt string
 * @param {object} callbacks
 * @param {(chunk: { index: number, text: string, bytes: number }) => void} callbacks.onChunk
 *   - invoked once per chunk (in order) with the chunk payload.
 * @param {() => void} callbacks.onCommit - invoked once after the last
 *   chunk is delivered. The caller is responsible for the final
 *   `tmux paste-buffer -d` invocation.
 * @param {object} [options] - forwarded to `planPromptChunks`.
 * @returns {{ cancel: () => void, plan: ReturnType<typeof planPromptChunks> }}
 */
export function scheduleChunkedPrompt(prompt, callbacks, options = {}) {
  const { onChunk, onCommit } = callbacks || {};
  if (typeof onChunk !== 'function' || typeof onCommit !== 'function') {
    throw new TypeError(
      'scheduleChunkedPrompt: callbacks.onChunk and callbacks.onCommit must be functions'
    );
  }
  const plan = planPromptChunks(prompt, options);
  const intervalMs = Math.max(
    0,
    Math.floor(options.intervalMs ?? T2_2_PROMPT_CHUNK_PACING_MS_DEFAULT)
  );

  const timers = [];
  for (let i = 0; i < plan.chunks.length; i += 1) {
    const chunk = plan.chunks[i];
    const delay = chunk.delayMsBefore;
    const timer = setTimeout(() => {
      onChunk({ index: chunk.index, text: chunk.text, bytes: chunk.bytes });
      if (i === plan.chunks.length - 1) {
        onCommit();
      }
    }, delay);
    timers.push(timer);
  }
  // If there's only one chunk, the loop above still scheduled it
  // (with delay 0) and onCommit runs after it. If the prompt was empty,
  // commit immediately on the next microtask so callers can chain.
  if (plan.chunks.length === 0) {
    const timer = setTimeout(() => onCommit(), 0);
    timers.push(timer);
  }

  return {
    plan,
    cancel: () => {
      for (const t of timers) clearTimeout(t);
    },
  };
}
