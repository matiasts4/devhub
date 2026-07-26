/**
 * agentTuiMetadata.shared — pure, runtime-agnostic helpers for agent TUI detection.
 *
 * This module intentionally contains NO Node.js-only imports (no fs, net, etc.)
 * so it can be safely loaded in both the Next.js client bundle and the Node.js
 * PTY server. Server-only consumers should import from agentTuiMetadata.node.js
 * to avoid accidentally dragging server dependencies into the client graph.
 */

import { detectAgentState, hasManifest, AgentStateMachine } from './agentStateDetection/index.js';

export const AGENT_TUI_TYPES = [
  'opencode',
  'kimi',
  'claude',
  'codex',
  'grok',
  'hermes',
  'agy',
  'qodercli',
];

const AGENT_TYPE_PATTERNS = {
  opencode: /\bopencode\b/i,
  kimi: /\bkimi\b/i,
  claude: /\bclaude\b/i,
  codex: /\bcodex\b/i,
  grok: /\b(?:grok|groc)\b/i,
  hermes: /\bhermes\b/i,
  agy: /\b(?:agy|antigravity)\b/i,
  // Exact binary name only — `qoder` alone would false-positive on `.qoder/`
  // config paths (e.g. `vim .qoder/AGENTS.md`).
  qodercli: /\bqodercli\b/i,
};

const AGENT_SESSION_PATTERNS = {
  // opencode --session <id>
  opencode: /opencode\s+(?:--session\s+|session\s+resume\s+)([\w-]+)/i,
  // hermes does not expose a session id; we synthesize one.
  hermes: null,
  // kimi --session <id> | kimi resume <id>
  kimi: /kimi\s+(?:--session\s+|session\s+resume\s+|resume\s+)([\w-]+)/i,
  // claude --session <id> | claude resume <id>
  claude: /claude\s+(?:--session\s+|session\s+resume\s+|resume\s+)([\w-]+)/i,
  // codex --session <id> | codex resume <id>
  codex: /codex\s+(?:--session\s+|session\s+resume\s+|resume\s+)([\w-]+)/i,
  // grok --resume <id> | grok -r <id> | grok --session-id <id> (pre-assigned at launch)
  grok: /grok\s+(?:--resume\s+|-r\s+|--session-id\s+)([\w-]+)/i,
  // agy does not expose a session id; we synthesize one.
  agy: null,
  // qodercli -r <id> | qodercli --resume <id> | qodercli --session-id <id>
  // (docs.qoder.com/en/cli/using-cli)
  qodercli: /qodercli\s+(?:--resume\s+|-r\s+|resume\s+|--session-id\s+)([\w-]+)/i,
};

export const AGENT_TUI_PATTERN = new RegExp(
  `\\b(?:${AGENT_TUI_TYPES.map((t) => (t === 'grok' ? 'grok|groc' : t)).join('|')})\\b`,
  'i'
);

/**
 * Strip recovery tags and surrounding whitespace from a launch command.
 */
export function normalizeAgentCommand(command) {
  if (!command || typeof command !== 'string') return '';
  return command.replace(/\s*#recovery-\d+\s*$/i, '').trim();
}

/**
 * Detect the agent TUI type from a launch command.
 * Returns one of the AGENT_TUI_TYPES or null.
 */
export function detectAgentTypeFromCommand(command) {
  const normalized = normalizeAgentCommand(command);
  if (!normalized) return null;

  for (const type of AGENT_TUI_TYPES) {
    if (AGENT_TYPE_PATTERNS[type].test(normalized)) {
      return type;
    }
  }
  return null;
}

/**
 * Extract a stable session id from the command when the agent exposes one.
 * Returns null when the agent does not support explicit session ids.
 */
export function extractAgentSessionId(type, command) {
  if (!type || !AGENT_SESSION_PATTERNS[type]) return null;
  const normalized = normalizeAgentCommand(command);
  const match = normalized.match(AGENT_SESSION_PATTERNS[type]);
  return match?.[1] || null;
}

/**
 * Whether the command launches a known agent TUI.
 */
export function isAgentTuiCommand(command) {
  return detectAgentTypeFromCommand(command) !== null;
}

/**
 * Human-readable label for an agent type.
 */
export function resolveAgentTuiLabel(type) {
  switch (type) {
    case 'opencode':
      return 'OpenCode';
    case 'kimi':
      return 'Kimi Code';
    case 'claude':
      return 'Claude';
    case 'codex':
      return 'Codex';
    case 'grok':
      return 'Grok';
    case 'hermes':
      return 'Hermes';
    case 'agy':
      return 'Antigravity';
    case 'qodercli':
      return 'Qoder';
    default:
      return 'Agente TUI';
  }
}

/**
 * Build a deterministic session id for agents that do not expose one.
 */
export function synthesizeAgentSessionId(type, stableSessionId) {
  if (!type || !stableSessionId) return null;
  return `${type}-${stableSessionId}`;
}

const AGENT_STATE_PATTERNS = {
  running: /\b(?:thinking|working|busy|running)\b/i,
  idle: /\b(?:idle|ready|waiting)\b/i,
};

/**
 * Infer a high-level agent state from a TUI output chunk.
 * Returns 'running' when the agent is actively processing (e.g. Kimi's
 * "thinking" footer), 'idle' when it explicitly signals readiness, or null
 * when no state signal is present.
 *
 * NOTE: This is the legacy single-chunk fallback. For accumulated-buffer
 * detection with per-agent manifests, use detectAgentState() from this module.
 */
export function detectAgentStateFromOutput(output, agentType) {
  if (!output || typeof output !== 'string' || !agentType) return null;

  // Delegate to the herdr-style manifest engine when available.
  if (hasManifest(agentType)) {
    const detected = detectAgentState(agentType, output);
    if (detected && detected.state && detected.state !== 'unknown') {
      return detected.state;
    }
  }

  if (AGENT_STATE_PATTERNS.running.test(output)) return 'running';
  if (AGENT_STATE_PATTERNS.idle.test(output)) return 'idle';
  return null;
}

/**
 * Re-exported herdr-style detector for accumulated terminal buffers.
 */
export { detectAgentState, hasManifest, AgentStateMachine };
