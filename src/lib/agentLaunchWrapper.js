/* eslint-env node */

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
}) {
  const exports = [
    `export DEVHUB_AGENT_ID="${agentId}"`,
    `export DEVHUB_MISSION_ID="${missionId}"`,
    `export DEVHUB_ROLE="${role}"`,
    `export DEVHUB_WORKSPACE_PATH="${workspacePath}"`,
    `export DEVHUB_WORKSPACE_ID="${workspaceId || ''}"`,
    `export DEVHUB_RUN_ID="${runId || ''}"`,
  ];

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
    state: 'busy',
    status_summary: 'Agent starting up',
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
    state: 'busy',
    status_summary: 'Agent running - periodic heartbeat',
  });

  const escapedPayload = payload.replace(/'/g, "'\\''");

  return `(_devhub_heartbeat_loop() {
  while true; do
    sleep 120
    HEARTBEAT_PAYLOAD='${escapedPayload}'
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    BODY_HASH=$(printf '%s' "$HEARTBEAT_PAYLOAD" | openssl dgst -sha256 | awk '{print $NF}')
    SIGNATURE=$(printf '%s' "\${TIMESTAMP}.\${BODY_HASH}" | openssl dgst -sha256 -hmac "$DEVHUB_AGENT_TOKEN" | awk '{print $NF}')
    curl -s -X POST "${supervisorUrl}/api/agenthub/presence/heartbeat" \\
      -H "Content-Type: application/json" \\
      -H "X-Agent-Id: ${agentId}" \\
      -H "X-Agent-Timestamp: \${TIMESTAMP}" \\
      -H "X-Agent-Signature: \${SIGNATURE}" \\
      -d "$HEARTBEAT_PAYLOAD" > /dev/null 2>&1 || true
  done
}
_devhub_heartbeat_loop &)`;
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
    sleep 60
    PENDING_RESP=$(curl -s -X POST "\${DEVHUB_SUPERVISOR_URL}/api/agenthub/operations/health" \\
      -H "Content-Type: application/json" \\
      -H "X-Agent-Id: ${agentId}" \\
      -d "{\\"action\\":\\"agent_heartbeat\\",\\"agent_id\\":\\"${agentId}\\",\\"mission_id\\":\\"${missionId}\\",\\"status_summary\\":\\"checking pending deliveries\\"}" 2>&1)
    if echo "$PENDING_RESP" | grep -q "pending_deliveries"; then
      COUNT=$(echo "$PENDING_RESP" | grep -o '"pending_deliveries":\\[[^]]*\\]' | grep -o '"delivery_id":"[^"]*"' | wc -l)
      if [ "$COUNT" -gt 0 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [PENDING_DELIVERIES] Found $COUNT pending deliveries" >> /tmp/devhub-pending-deliveries.log
        # Log each pending delivery for the agent to pick up
        echo "$PENDING_RESP" | grep -o '"payload":{[^}]*}' >> /tmp/devhub-pending-deliveries.log 2>&1 || true
      fi
    fi
  done
}
_devhub_pending_deliveries_loop &)`;
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
    '# Worker: send status updates to Director via tmux',
    '_msg="${1:-}"',
    'if [ -z "${DEVHUB_DIRECTOR_SESSION:-}" ]; then',
    '  echo "[$(date \'+%Y-%m-%d %H:%M:%S\')] [DIRECTOR_TELL] SKIP: DEVHUB_DIRECTOR_SESSION not set" >> /tmp/devhub-tell-director-debug.log 2>&1',
    '  exit 0',
    'fi',
    'if ! command -v tmux >/dev/null 2>&1; then',
    '  echo "[$(date \'+%Y-%m-%d %H:%M:%S\')] [DIRECTOR_TELL] SKIP: tmux not available" >> /tmp/devhub-tell-director-debug.log 2>&1',
    '  exit 0',
    'fi',
    'echo "[$(date \'+%Y-%m-%d %H:%M:%S\')] [DIRECTOR_TELL] Sending to ${DEVHUB_DIRECTOR_SESSION}: $_msg" >> /tmp/devhub-tell-director-debug.log 2>&1',
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] [\${DEVHUB_ROLE:-worker}] $_msg" >> "/tmp/devhub-swarm-${launchId}.log" 2>/dev/null || true`,
    'tmux send-keys -t "${DEVHUB_DIRECTOR_SESSION}" "STATUS_UPDATE: $_msg" C-m >/dev/null 2>&1 || true',
    'EOF',
    'chmod +x /tmp/devhub-bin/_devhub_tell_director',
    'export PATH="/tmp/devhub-bin:$PATH"',
    '',
    '# Define as bash function in current shell context for convenience/direct usage',
    '_devhub_tell_director() {',
    '  /tmp/devhub-bin/_devhub_tell_director "$1"',
    '}',
  ].join('\n');
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
    }),
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
    '# Execute the actual agent - capture both stdout and stderr to log',
    '# This helps diagnose crashes like ArrayLimit errors',
    '{',
    '  ' + innerCommand + ' 2>&1',
    '} >> "$AGENT_LOG" 2>&1',
    'AGENT_EXIT_CODE=$?',
    `echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AGENT] Agent exited with code: \${AGENT_EXIT_CODE}" >> "$AGENT_LOG"`,
  ];

  return parts.join('\n');
}
