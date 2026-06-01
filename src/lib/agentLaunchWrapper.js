/* eslint-env node */
/* eslint-disable no-useless-escape -- pre-existing HMAC bash literals with embedded quotes; removed in T-006. */

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
}) {
  const exports = [
    `export DEVHUB_AGENT_ID="${agentId}"`,
    `export DEVHUB_MISSION_ID="${missionId}"`,
    `export DEVHUB_ROLE="${role}"`,
    `export DEVHUB_WORKSPACE_PATH="${workspacePath}"`,
    `export DEVHUB_WORKSPACE_ID="${workspaceId || ''}"`,
    `export DEVHUB_RUN_ID="${runId || ''}"`,
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

  // MINIMAX-1: Inject MiniMax MCP subscription env vars for Zed agents
  if (modelProvider === 'minimax') {
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
    '',
    '_devhub_chat() {',
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
    '}',
    '',
    '_devhub_event() {',
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
    '}',
    '',
    '_devhub_presence() {',
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
    '}',
    '',
    '_devhub_inbox_check() {',
    '  if [ -z "${DEVHUB_MISSION_ID:-}" ]; then echo "devhub-helper: _devhub_inbox_check: DEVHUB_MISSION_ID not set" >&2; return 64; fi',
    '  if [ -z "${DEVHUB_ROLE:-}" ]; then echo "devhub-helper: _devhub_inbox_check: DEVHUB_ROLE not set" >&2; return 64; fi',
    '  "$_DEVHUB_BUS_NODE" "$_DEVHUB_BUS_BIN" "--db" "$_DEVHUB_BUS_DB" "inbox-check" --mission "$DEVHUB_MISSION_ID" --role "$DEVHUB_ROLE"',
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

function buildBootstrapPromptBlock(prompt = '') {
  if (!String(prompt || '').trim()) {
    return '';
  }

  return [
    '# Queue the bootstrap prompt into the panel tmux session after OpenCode starts.',
    'DEVHUB_LOG_FILE="/tmp/devhub-swarm-${DEVHUB_ROLE:-agent}.log"',
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
    `    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Waiting 10s for OpenCode to initialize..."`,
    '    sleep 10',
    `    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEVHUB_BOOTSTRAP] Loading prompt into tmux session \${_tmux_session}..."`,
    "    tmux load-buffer - <<'DEVHUB_BOOTSTRAP_PROMPT'",
    prompt,
    'DEVHUB_BOOTSTRAP_PROMPT',
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
 * Build a background polling loop for pending deliveries.
 * Runs a subshell that polls operations/health every 60 seconds to get
 * tasks assigned to this agent via pending_deliveries.
 * Uses /api/agenthub/operations/health with action=agent_heartbeat.
 */
export function buildPendingDeliveriesPollingCommand({ supervisorUrl, agentId, missionId }) {
  if (!supervisorUrl) {
    return '# pending_deliveries polling skipped (no supervisor URL)';
  }

  return `(_devhub_pending_deliveries_loop() {
  while true; do
    sleep 30
    PENDING_BODY="{\\"action\\":\\"agent_heartbeat\\",\\"agent_id\\":\\"${agentId}\\",\\"mission_id\\":\\"${missionId}\\",\\"status_summary\\":\\"checking pending deliveries\\"}"
    PENDING_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    PENDING_BODY_HASH=$(printf '%s' "$PENDING_BODY" | openssl dgst -sha256 | awk '{print $NF}')
    PENDING_SIGNATURE=$(printf '%s' "\${PENDING_TIMESTAMP}.\${PENDING_BODY_HASH}" | openssl dgst -sha256 -hmac "$DEVHUB_AGENT_TOKEN" | awk '{print $NF}')
    PENDING_RESP=$(curl -s -X POST "\${DEVHUB_SUPERVISOR_URL}/api/agenthub/operations/health" \\
      -H "Content-Type: application/json" \\
      -H "X-Agent-Id: ${agentId}" \\
      -H "X-Agent-Timestamp: \${PENDING_TIMESTAMP}" \\
      -H "X-Agent-Signature: \${PENDING_SIGNATURE}" \\
      -d "$PENDING_BODY" 2>&1)
    if echo "$PENDING_RESP" | grep -q "pending_deliveries"; then
      COUNT=$(echo "$PENDING_RESP" | grep -o '"delivery_id":"[^"]*"' | wc -l | tr -d ' ')
      if [ "$COUNT" -gt 0 ] 2>/dev/null; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [PENDING_DELIVERIES] $COUNT delivery(ies) found" >> /tmp/devhub-agent-inbox.log
        # Write structured inbox: deliveries as JSON lines for easy parsing
        echo "$PENDING_RESP" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for d in data.get('pending_deliveries', []):
        print(json.dumps(d), flush=True)
except:
    pass
" >> /tmp/devhub-agent-inbox.jsonl 2>/dev/null || true
        # ACK each delivery so they don't reappear in future polls
        echo "$PENDING_RESP" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for d in data.get('pending_deliveries', []):
        print(d.get('delivery_id',''))
except:
    pass
" 2>/dev/null | while read -r _delivery_id; do
          [ -z "$_delivery_id" ] && continue
          _ack_body=\"{\\\"action\\\":\\\"ack_delivery\\\",\\\"delivery_id\\\":\\"$_delivery_id\\"}\"
          _ack_ts=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
          _ack_hash=$(printf '%s' "$_ack_body" | openssl dgst -sha256 | awk '{print $NF}')
          _ack_sig=$(printf '%s' "\${_ack_ts}.\${_ack_hash}" | openssl dgst -sha256 -hmac "$DEVHUB_AGENT_TOKEN" | awk '{print $NF}')
          curl -s -X POST "\${DEVHUB_SUPERVISOR_URL}/api/agenthub/operations/health" \
            -H "Content-Type: application/json" \
            -H "X-Agent-Id: ${agentId}" \
            -H "X-Agent-Timestamp: \${_ack_ts}" \
            -H "X-Agent-Signature: \${_ack_sig}" \
            -d "$_ack_body" > /dev/null 2>&1 || true
        done
        # Also paste summary to agent's own tmux pane so the agent sees it in terminal
        if [ -n "\${DEVHUB_TMUX_SESSION:-}" ] && command -v tmux >/dev/null 2>&1; then
          tmux send-keys -t "\${DEVHUB_TMUX_SESSION}" "" C-m 2>/dev/null || true
          tmux send-keys -t "\${DEVHUB_TMUX_SESSION}" '[DEVHUB INBOX] '"\$COUNT"' message(s) waiting — check /tmp/devhub-agent-inbox.jsonl' C-m 2>/dev/null || true
          tmux send-keys -t "\${DEVHUB_TMUX_SESSION}" 'To read inbox: cat /tmp/devhub-agent-inbox.jsonl' C-m 2>/dev/null || true
        fi
      fi
    fi
  done
}
nohup bash -c '_devhub_pending_deliveries_loop' >/dev/null 2>&1 &
disown
) &`;
}

export function buildDirectorTmuxInjection(directorTmuxSession) {
  if (!directorTmuxSession) {
    return '# _devhub_tell_director skipped (no director tmux session)';
  }

  const match = directorTmuxSession.match(/devhub-swarm-([^-]+)-director/);
  const launchId = match ? match[1] : 'unknown';

  return [
    '# Create a local bin directory for agent helpers',
    'mkdir -p /tmp/devhub-bin',
    "cat << 'EOF' > /tmp/devhub-bin/_devhub_tell_director",
    '#!/usr/bin/env bash',
    '# Worker: send status updates to Director via signed HTTP event (preferred)',
    '# Falls back to tmux log + tmux paste if supervisorUrl unavailable',
    '# Circuit breaker: 3 retries with exponential backoff, state persisted to /tmp/devhub-circuit-{agent_id}',
    '_devhub_tell_director() {',
    '  _msg="${1:-}"',
    '  _circuit_file="/tmp/devhub-circuit-${DEVHUB_AGENT_ID}"',
    '  _max_retries=3',
    '  _base_delay=1',
    '  # Check if circuit is open (3 consecutive failures)',
    '  if [ -f "$_circuit_file" ]; then',
    '    _failures=$(cat "$_circuit_file" 2>/dev/null | grep -o "failures:[0-9]*" | cut -d: -f2)',
    '    if [ "${_failures:-0}" -ge "$_max_retries" ]; then',
    `      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DIRECTOR_TELL] Circuit OPEN — skipping" >> /tmp/devhub-tell-director-debug.log 2>&1`,
    '      return 1',
    '    fi',
    '  fi',
    '  _timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")',
    '  _payload="{\\"event_type\\":\\"status_update\\",\\"agent_id\\":\\"${DEVHUB_AGENT_ID}\\",\\"mission_id\\":\\"${DEVHUB_MISSION_ID}\\",\\"payload\\":{\\"summary\\":\\"$_msg\\"}}"',
    '  _body_hash=$(printf "%s" "$_payload" | openssl dgst -sha256 | awk "{print $NF}")',
    '  _signature=$(printf "%s" "${_timestamp}.${_body_hash}" | openssl dgst -sha256 -hmac "${DEVHUB_AGENT_TOKEN}" | awk "{print $NF}")',
    '  _attempt=0',
    '  _success=false',
    '  while [ $_attempt -lt $_max_retries ] && [ "$_success" = "false" ]; do',
    '    _resp=$(curl -s -w "\\n%{http_code}" -X POST "${DEVHUB_SUPERVISOR_URL}/api/agenthub/events" \\',
    '      -H "Content-Type: application/json" \\',
    '      -H "X-Agent-Id: ${DEVHUB_AGENT_ID}" \\',
    '      -H "X-Agent-Timestamp: ${_timestamp}" \\',
    '      -H "X-Agent-Signature: ${_signature}" \\',
    '      -d "$_payload" 2>&1)',
    '    _http_code=$(echo "$_resp" | tail -1)',
    '    if [ "$_http_code" = "200" ] || [ "$_http_code" = "201" ]; then',
    '      _success=true',
    '      # Reset circuit on success',
    '      rm -f "$_circuit_file" 2>/dev/null',
    `      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DIRECTOR_TELL] HTTP success (attempt $((_attempt+1))): $_msg" >> /tmp/devhub-tell-director-debug.log 2>&1`,
    '    else',
    `      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DIRECTOR_TELL] HTTP failed (code $_http_code, attempt $((_attempt+1)))" >> /tmp/devhub-tell-director-debug.log 2>&1`,
    '      _attempt=$((_attempt+1))',
    '      if [ $_attempt -lt $_max_retries ]; then',
    '        _delay=$((_base_delay * (2 ** (_attempt - 1))))',
    `        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DIRECTOR_TELL] Retrying in \${_delay}s (attempt \$_attempt)..." >> /tmp/devhub-tell-director-debug.log 2>&1`,
    '        sleep $_delay',
    '      fi',
    '    fi',
    '  done',
    '  if [ "$_success" = "false" ]; then',
    '    # Open circuit: record consecutive failures',
    `    echo "failures:$_max_retries" > "$_circuit_file"`,
    `    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DIRECTOR_TELL] Circuit OPENED after $_max_retries failures" >> /tmp/devhub-tell-director-debug.log 2>&1`,
    '    # Fallback: write to shared log AND paste to director tmux',
    `    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [\${DEVHUB_ROLE:-worker}] $_msg" >> "/tmp/devhub-swarm-${launchId}.log" 2>/dev/null || true`,
    '    if [ -n "${DEVHUB_DIRECTOR_SESSION:-}" ] && command -v tmux >/dev/null 2>&1; then',
    '      tmux send-keys -t "${DEVHUB_DIRECTOR_SESSION}" "STATUS_UPDATE: $_msg" C-m >/dev/null 2>&1 || true',
    '    fi',
    '  fi',
    '}',
    'EOF',
    'chmod +x /tmp/devhub-bin/_devhub_tell_director',
    'export PATH="/tmp/devhub-bin:$PATH"',
    '',
    '# Also keep tmux-based log for director to read manually as backup',
    '# (the director tmux pane still gets STATUS_UPDATE via tmux send-keys as fallback)',
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] [\${DEVHUB_ROLE:-agent}] _devhub_tell_director ready (HTTP primary, tmux fallback)" >> "/tmp/devhub-swarm-${launchId}.log"`,
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
 * Signs the request with HMAC-SHA256 using DEVHUB_AGENT_TOKEN.
 * @param {object} params
 * @returns {string} Shell trap command
 */
export function buildExitTrapCommand({ supervisorUrl, agentId, missionId }) {
  if (!supervisorUrl) {
    return '# Exit trap skipped (no supervisor URL)';
  }

  return `_devhub_exit_handler() {
  local EXIT_CODE=$?
  local TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
  local PAYLOAD="{\\"agent_id\\":\\"${agentId}\\",\\"mission_id\\":\\"${missionId}\\",\\"event_type\\":\\"process_exit\\",\\"exit_code\\":$EXIT_CODE}"
  local BODY_HASH=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 | awk '{print $NF}')
  local SIGNATURE=$(printf '%s' "\${TIMESTAMP}.\${BODY_HASH}" | openssl dgst -sha256 -hmac "$DEVHUB_AGENT_TOKEN" | awk '{print $NF}')
  curl -s -X POST "${supervisorUrl}/api/agenthub/events" \\
    -H "Content-Type: application/json" \\
    -H "X-Agent-Id: ${agentId}" \\
    -H "X-Agent-Timestamp: \${TIMESTAMP}" \\
    -H "X-Agent-Signature: \${SIGNATURE}" \\
    -d "$PAYLOAD" \\
    > /dev/null 2>&1 || true
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
    }),
    '',
    // T-003 — bus helpers (only emitted if dbPath + busBinaryPath are provided)
    buildBusHelpersBlock({ busBinaryPath, dbPath }),
    '',
    buildIdentityVerificationBlock({
      agentId,
      missionId,
      role,
      workspacePath,
    }),
    '',
    buildBootstrapPromptBlock(bootstrapPrompt),
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
    }),
    '',
    buildDirectorTmuxInjection(directorTmuxSession),
    '',
    '# Setup logging for agent output',
    'AGENT_LOG="/tmp/devhub-swarm-${DEVHUB_ROLE:-agent}.log"',
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AGENT] Starting agent: \${DEVHUB_ROLE}" >> "$AGENT_LOG"`,
    '',
    '# Execute the actual agent via auto-restart loop',
    '# Captures both stdout and stderr to log; restarts on non-zero exit (max 3)',
    buildAutoRestartLoopCommand({ innerCommand }),
  ];

  return parts.join('\n');
}
