/**
 * agentLaunchPreferences — per-agent launch mode configuration.
 *
 * Stores user preferences for launching agent TUIs with elevated permissions
 * ("yolo mode") so that agents auto-approve tool actions without human prompts.
 *
 * Persisted in localStorage under `devhub_agent_launch_prefs`.
 *
 * @module agentLaunchPreferences
 */

/**
 * Canonical agent catalog for launch preferences.
 * Aligned with quota PROVIDERS and quick action registry agents.
 *
 * `yoloFlag` is the CLI flag appended when the user enables elevated permissions.
 * `null` means the agent does not support a yolo/auto-approve CLI flag.
 */
export const AGENT_LAUNCH_CATALOG = Object.freeze([
  {
    id: 'kimi',
    label: 'Kimi Code',
    command: 'kimi',
    yoloFlag: '--yolo',
    description: 'Moonshot · TUI con auto-aprobación de acciones',
  },
  {
    id: 'grok',
    label: 'Grok',
    command: 'grok',
    yoloFlag: '--yolo',
    description: 'xAI · TUI con modo yolo',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    yoloFlag: null,
    description: 'Open source · permisos gestionados en TUI',
  },
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    yoloFlag: '--dangerously-skip-permissions',
    description: 'Anthropic · omite chequeos de permisos',
  },
  {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    yoloFlag: '--full-auto',
    description: 'OpenAI · modo full-auto sin aprobación manual',
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    command: 'agy',
    yoloFlag: '--yolo',
    description: 'Google · TUI con auto-aprobación',
  },
  {
    id: 'qodercli',
    label: 'Qoder',
    command: 'qodercli',
    yoloFlag: '--yolo',
    description: 'Qoder CLI · omite permission checks',
  },
]);

/** Lookup map by agent id. */
const CATALOG_BY_ID = Object.freeze(
  Object.fromEntries(AGENT_LAUNCH_CATALOG.map((entry) => [entry.id, entry]))
);

/** Lookup map by command name (for matching quick action / preset commands). */
const CATALOG_BY_COMMAND = Object.freeze(
  Object.fromEntries(AGENT_LAUNCH_CATALOG.map((entry) => [entry.command, entry]))
);

const STORAGE_KEY = 'devhub_agent_launch_prefs';

/**
 * @typedef {Object} AgentLaunchPreferences
 * @property {Object.<string, boolean>} yolo - Map of agentId → yolo enabled.
 */

const DEFAULTS = { yolo: {} };

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS, yolo: {} };
  const yolo = {};
  if (raw.yolo && typeof raw.yolo === 'object') {
    for (const entry of AGENT_LAUNCH_CATALOG) {
      if (raw.yolo[entry.id] === true) {
        yolo[entry.id] = true;
      }
    }
  }
  return { yolo };
}

/**
 * Read agent launch preferences from localStorage.
 * @param {Storage|null} [storage]
 * @returns {AgentLaunchPreferences}
 */
export function readAgentLaunchPreferences(storage) {
  let store = storage;
  if (!store) {
    try {
      store = typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
    } catch {
      store = null;
    }
  }
  if (!store || typeof store.getItem !== 'function') {
    return { ...DEFAULTS, yolo: {} };
  }
  try {
    const raw = store.getItem(STORAGE_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULTS, yolo: {} };
  }
}

/**
 * Write agent launch preferences to localStorage.
 * @param {AgentLaunchPreferences} prefs
 * @param {Storage|null} [storage]
 * @returns {AgentLaunchPreferences} The written prefs (for state updates).
 */
export function writeAgentLaunchPreferences(prefs, storage) {
  let store = storage;
  if (!store) {
    try {
      store = typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
    } catch {
      store = null;
    }
  }
  const normalized = normalize(prefs);
  if (store && typeof store.setItem === 'function') {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // non-fatal
    }
  }
  return normalized;
}

/**
 * Toggle yolo mode for a specific agent.
 * @param {AgentLaunchPreferences} prefs
 * @param {string} agentId
 * @returns {AgentLaunchPreferences}
 */
export function toggleAgentYolo(prefs, agentId) {
  const current = prefs?.yolo?.[agentId] === true;
  const nextYolo = { ...prefs?.yolo, [agentId]: !current };
  if (current) {
    // Remove false entries to keep storage clean
    delete nextYolo[agentId];
  }
  return { yolo: nextYolo };
}

/**
 * Check if yolo mode is enabled for an agent.
 * @param {AgentLaunchPreferences} prefs
 * @param {string} agentId
 * @returns {boolean}
 */
export function isAgentYoloEnabled(prefs, agentId) {
  return prefs?.yolo?.[agentId] === true;
}

/**
 * Resolve the yolo CLI flag for an agent, or null if not enabled / not supported.
 * @param {string} agentId
 * @param {AgentLaunchPreferences} [prefs] - If omitted, reads from localStorage.
 * @returns {string|null}
 */
export function resolveAgentYoloFlag(agentId, prefs) {
  const resolvedPrefs = prefs ?? readAgentLaunchPreferences();
  if (!isAgentYoloEnabled(resolvedPrefs, agentId)) return null;
  const entry = CATALOG_BY_ID[agentId];
  return entry?.yoloFlag ?? null;
}

/**
 * Given a bare agent command (e.g. "kimi"), append the yolo flag if the user
 * has enabled it for that agent. Returns the original command unchanged if:
 * - The command is not a recognized agent
 * - The agent doesn't support yolo
 * - The user hasn't enabled yolo for it
 *
 * @param {string|null} command - The initial command (e.g. "kimi", "grok", "agy").
 * @param {AgentLaunchPreferences} [prefs] - If omitted, reads from localStorage.
 * @returns {string|null} The command with yolo flag appended, or unchanged.
 */
export function applyAgentYoloToCommand(command, prefs) {
  if (!command || typeof command !== 'string') return command;
  const trimmed = command.trim();
  if (!trimmed) return command;

  // Extract the base program name (first token)
  const baseProgram = trimmed.split(/\s+/)[0];
  const entry = CATALOG_BY_COMMAND[baseProgram];
  if (!entry) return command;

  const resolvedPrefs = prefs ?? readAgentLaunchPreferences();
  const flag = resolveAgentYoloFlag(entry.id, resolvedPrefs);
  if (!flag) return command;

  // Don't double-append if the flag is already present
  if (trimmed.includes(flag)) return command;

  return `${trimmed} ${flag}`;
}

/**
 * Get the catalog entry for an agent by id.
 * @param {string} agentId
 * @returns {Object|null}
 */
export function getAgentCatalogEntry(agentId) {
  return CATALOG_BY_ID[agentId] ?? null;
}

/**
 * Get the catalog entry for an agent by command name.
 * @param {string} command
 * @returns {Object|null}
 */
export function getAgentCatalogEntryByCommand(command) {
  return CATALOG_BY_COMMAND[command] ?? null;
}
