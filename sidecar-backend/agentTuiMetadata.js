/**
 * agentTuiMetadata — single source of truth for agent TUI detection (CJS sidecar mirror).
 *
 * Covers: opencode, kimi, claude, codex, grok/groc, hermes, agy (antigravity), qodercli.
 * Keep in sync with src/lib/terminal/agentTuiMetadata.js (ESM source of truth).
 */

const AGENT_TUI_TYPES = [
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
  opencode: /opencode\s+(?:--session\s+|session\s+resume\s+)([\w-]+)/i,
  hermes: null,
  kimi: /kimi\s+(?:--session\s+|session\s+resume\s+|resume\s+)([\w-]+)/i,
  claude: /claude\s+(?:--session\s+|session\s+resume\s+|resume\s+)([\w-]+)/i,
  codex: /codex\s+(?:--session\s+|session\s+resume\s+|resume\s+)([\w-]+)/i,
  grok: null,
  agy: null,
  // qodercli -r <id> | qodercli --resume <id> (docs.qoder.com/en/cli/using-cli)
  qodercli: /qodercli\s+(?:--resume\s+|-r\s+|resume\s+)([\w-]+)/i,
};

const AGENT_TUI_PATTERN = new RegExp(
  `\\b(?:${AGENT_TUI_TYPES.map((t) => (t === 'grok' ? 'grok|groc' : t)).join('|')})\\b`,
  'i'
);

const AGENT_STATE_PATTERNS = {
  running: /\b(?:thinking|working|busy|running)\b/i,
  idle: /\b(?:idle|ready|waiting)\b/i,
};

function normalizeAgentCommand(command) {
  if (!command || typeof command !== 'string') return '';
  return command.replace(/\s*#recovery-\d+\s*$/i, '').trim();
}

function detectAgentTypeFromCommand(command) {
  const normalized = normalizeAgentCommand(command);
  if (!normalized) return null;
  for (const type of AGENT_TUI_TYPES) {
    if (AGENT_TYPE_PATTERNS[type].test(normalized)) return type;
  }
  return null;
}

function extractAgentSessionId(type, command) {
  if (!type || !AGENT_SESSION_PATTERNS[type]) return null;
  const normalized = normalizeAgentCommand(command);
  const match = normalized.match(AGENT_SESSION_PATTERNS[type]);
  return match?.[1] || null;
}

function isAgentTuiCommand(command) {
  return detectAgentTypeFromCommand(command) !== null;
}

function resolveAgentTuiLabel(type) {
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

function synthesizeAgentSessionId(type, stableSessionId) {
  if (!type || !stableSessionId) return null;
  return `${type}-${stableSessionId}`;
}

function detectAgentStateFromOutput(output, agentType) {
  if (!output || typeof output !== 'string' || !agentType) return null;
  if (AGENT_STATE_PATTERNS.running.test(output)) return 'running';
  if (AGENT_STATE_PATTERNS.idle.test(output)) return 'idle';
  return null;
}

module.exports = {
  AGENT_TUI_TYPES,
  AGENT_TUI_PATTERN,
  detectAgentStateFromOutput,
  detectAgentTypeFromCommand,
  extractAgentSessionId,
  isAgentTuiCommand,
  resolveAgentTuiLabel,
  synthesizeAgentSessionId,
};
