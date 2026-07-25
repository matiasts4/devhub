/**
 * agentDisplayNames — single source of truth for human-facing agent names.
 *
 * Used by the notification bridge/titles (client) and any server code that
 * renders agent identities. Plain ESM, no Node or browser dependencies, so it
 * is importable from both runtimes.
 *
 * Unknown types return null so callers can pick their own fallback
 * (e.g. 'Agente'), instead of inventing a name from a raw command string.
 */

const AGENT_DISPLAY_NAMES = {
  kimi: 'Kimi Code',
  'kimi-code': 'Kimi Code',
  claude: 'Claude Code',
  'claude-code': 'Claude Code',
  agy: 'Antigravity',
  antigravity: 'Antigravity',
  opencode: 'OpenCode',
  grok: 'Grok',
  qoder: 'Qoder',
  qodercli: 'Qoder',
  codex: 'Codex',
  hermes: 'Hermes',
};

/**
 * @param {string|null|undefined} agentType — detector/agentTuiMetadata type
 * @returns {string|null} display name, or null when unknown
 */
export function getAgentDisplayName(agentType) {
  if (!agentType || typeof agentType !== 'string') return null;
  return AGENT_DISPLAY_NAMES[agentType.trim().toLowerCase()] ?? null;
}

export default getAgentDisplayName;
