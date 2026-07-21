/**
 * Subscription Quota Data Structures & Types
 */

/**
 * @typedef {Object} QuotaWindow
 * @property {string} name - e.g., '5-Hour Limit', '7-Day Limit', 'Monthly Credit'
 * @property {number} usagePercent - 0.0 to 100.0
 * @property {number} [remainingFraction] - 0.0 to 1.0
 * @property {string|null} resetsAt - ISO timestamp or formatted string
 * @property {number|null} timeUntilResetMs - Milliseconds until quota reset
 * @property {boolean} isExhausted
 */

/**
 * @typedef {Object} ProviderQuotaStatus
 * @property {string} providerId - 'grok' | 'claude' | 'antigravity' | 'kimi' | 'opencode' | 'codex'
 * @property {string} displayName - e.g. 'Grok', 'Claude Code', 'Antigravity'
 * @property {boolean} isAvailable - Whether credentials/service were detected
 * @property {boolean} isAuth - Whether user is logged in
 * @property {number} primaryUsagePercent - Overall or main window usage % (0-100)
 * @property {number} primaryRemainingPercent - Overall remaining % (0-100)
 * @property {string|null} primaryResetAt - Reset ISO timestamp
 * @property {number|null} timeUntilResetMs - Reset countdown in ms
 * @property {QuotaWindow[]} windows - List of specific usage windows (e.g. 5h, 7d)
 * @property {Object.<string, any>} [metadata] - Additional provider details (model, user email, balance)
 * @property {number} lastUpdatedMs - Timestamp of last fetch
 * @property {string|null} [error] - Error message if fetch failed
 */

export const PROVIDERS = {
  GROK: 'grok',
  CLAUDE: 'claude',
  ANTIGRAVITY: 'antigravity',
  KIMI: 'kimi',
  OPENCODE: 'opencode',
  CODEX: 'codex',
  ZAI: 'zai',
};

export const PROVIDER_LABELS = {
  [PROVIDERS.GROK]: 'Grok',
  [PROVIDERS.CLAUDE]: 'Claude Code',
  [PROVIDERS.ANTIGRAVITY]: 'Antigravity',
  [PROVIDERS.KIMI]: 'Kimi Code',
  [PROVIDERS.OPENCODE]: 'OpenCode',
  [PROVIDERS.CODEX]: 'Codex',
  [PROVIDERS.ZAI]: 'Z.ai',
};
