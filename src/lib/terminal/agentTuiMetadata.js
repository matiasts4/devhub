/**
 * agentTuiMetadata — single source of truth for agent TUI detection.
 *
 * Covers: opencode, kimi, claude, codex, grok/groc, hermes.
 */

export const AGENT_TUI_TYPES = ['opencode', 'kimi', 'claude', 'codex', 'grok', 'hermes'];

const AGENT_TYPE_PATTERNS = {
  opencode: /\bopencode\b/i,
  kimi: /\bkimi\b/i,
  claude: /\bclaude\b/i,
  codex: /\bcodex\b/i,
  grok: /\b(?:grok|groc)\b/i,
  hermes: /\bhermes\b/i,
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
  // grok does not expose a session id; we synthesize one.
  grok: null,
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
 */
export function detectAgentStateFromOutput(output, agentType) {
  if (!output || typeof output !== 'string' || !agentType) return null;
  if (AGENT_STATE_PATTERNS.running.test(output)) return 'running';
  if (AGENT_STATE_PATTERNS.idle.test(output)) return 'idle';
  return null;
}
