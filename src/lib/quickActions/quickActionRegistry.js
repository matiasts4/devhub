/**
 * quickActionRegistry — predefined actions for the Quick Actions palette.
 *
 * Static, UI-agnostic list of "direct to action" commands. Each entry maps
 * to either a terminal spawn (optionally running an agent CLI) or a browser
 * open. Icons are stored as string names and resolved to lucide components
 * in the palette component (keeps this module UI-agnostic and testable).
 *
 * @module quickActions/quickActionRegistry
 */

export const QUICK_ACTION_GROUPS = Object.freeze({
  TERMINALS: 'Terminales',
  AGENTS: 'Agentes',
  TOOLS: 'Herramientas',
});

/**
 * Predefined quick actions.
 *
 * @type {Array<{
 *   id: string,
 *   group: string,
 *   label: string,
 *   description: string,
 *   icon: string,
 *   type: 'terminal'|'browser',
 *   command?: string|null,
 *   url?: string
 * }>}
 */
export const QUICK_ACTIONS = Object.freeze([
  {
    id: 'terminal-plain',
    group: QUICK_ACTION_GROUPS.TERMINALS,
    label: 'Terminal',
    description: 'Shell en el directorio del proyecto',
    icon: 'terminal',
    type: 'terminal',
    command: null,
  },
  {
    id: 'agent-claude',
    group: QUICK_ACTION_GROUPS.AGENTS,
    label: 'Claude Code',
    description: 'Terminal · Anthropic',
    icon: 'sparkles',
    type: 'terminal',
    command: 'claude',
  },
  {
    id: 'agent-antigravity',
    group: QUICK_ACTION_GROUPS.AGENTS,
    label: 'Antigravity',
    description: 'Terminal · Google',
    icon: 'rocket',
    type: 'terminal',
    command: 'agy',
  },
  {
    id: 'agent-opencode',
    group: QUICK_ACTION_GROUPS.AGENTS,
    label: 'OpenCode',
    description: 'Terminal · open source',
    icon: 'square-terminal',
    type: 'terminal',
    command: 'opencode',
  },
  {
    id: 'agent-kimi',
    group: QUICK_ACTION_GROUPS.AGENTS,
    label: 'Kimi',
    description: 'Terminal · Moonshot',
    icon: 'moon',
    type: 'terminal',
    command: 'kimi',
  },
  {
    id: 'agent-grok',
    group: QUICK_ACTION_GROUPS.AGENTS,
    label: 'Grok',
    description: 'Terminal · xAI',
    icon: 'sparkles',
    type: 'terminal',
    command: 'grok',
  },
  {
    id: 'agent-codex',
    group: QUICK_ACTION_GROUPS.AGENTS,
    label: 'Codex',
    description: 'Terminal · OpenAI',
    icon: 'code',
    type: 'terminal',
    command: 'codex',
  },
  {
    id: 'agent-qodercli',
    group: QUICK_ACTION_GROUPS.AGENTS,
    label: 'Qoder',
    description: 'Terminal · Qoder CLI',
    icon: 'bot',
    type: 'terminal',
    command: 'qodercli',
  },
  {
    id: 'browser',
    group: QUICK_ACTION_GROUPS.TOOLS,
    label: 'Browser',
    description: 'Vista web minimalista',
    icon: 'globe',
    type: 'browser',
    url: 'https://duckduckgo.com/',
  },
]);

/**
 * Filter quick actions by a free-text query. Matches against label and
 * description (case-insensitive substring). An empty/blank query returns
 * every action.
 *
 * @param {string} query - Raw user input.
 * @returns {Array<Object>} Matching actions, in registry order.
 */
export function filterQuickActions(query) {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!q) return [...QUICK_ACTIONS];
  return QUICK_ACTIONS.filter((action) => {
    const label = (action.label || '').toLowerCase();
    const description = (action.description || '').toLowerCase();
    return label.includes(q) || description.includes(q);
  });
}
