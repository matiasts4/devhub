/**
 * detector — public API for herdr-style agent-state detection.
 *
 * Maps DevHub agent type names to herdr manifests and evaluates the terminal
 * buffer + optional OSC title.
 *
 * NOTE: manifests are imported statically so this module is safe to load in
 * the Next.js client bundle (no node:fs usage).
 */

import { evaluateManifest } from './ruleEngine.js';
import kimiManifest from './manifests/kimi.js';
import { stripAnsi } from '../stripAnsi.js';
import claudeManifest from './manifests/claude.js';
import codexManifest from './manifests/codex.js';
import opencodeManifest from './manifests/opencode.js';
import grokManifest from './manifests/grok.js';
import antigravityManifest from './manifests/antigravity.js';

const MANIFESTS = new Map([
  ['kimi', kimiManifest],
  ['claude', claudeManifest],
  ['codex', codexManifest],
  ['opencode', opencodeManifest],
  ['grok', grokManifest],
  ['agy', antigravityManifest],
]);

const AGENT_TYPE_ALIASES = {
  opencode: 'opencode',
  'open-code': 'opencode',
  kimi: 'kimi',
  'kimi-code': 'kimi',
  'kimi code': 'kimi',
  claude: 'claude',
  'claude-code': 'claude',
  codex: 'codex',
  grok: 'grok',
  groc: 'grok',
  'grok-build': 'grok',
  hermes: 'hermes',
  agy: 'agy',
  antigravity: 'agy',
  'antigravity-cli': 'agy',
};

const manifestCache = new Map();

export function normalizeAgentType(agentType) {
  if (!agentType) return null;
  const key = String(agentType).trim().toLowerCase();
  return AGENT_TYPE_ALIASES[key] || key;
}

export function loadManifest(agentType) {
  const normalized = normalizeAgentType(agentType);
  if (!normalized) return null;

  if (manifestCache.has(normalized)) {
    return manifestCache.get(normalized);
  }

  const manifest = MANIFESTS.get(normalized) || null;
  manifestCache.set(normalized, manifest);
  return manifest;
}

export function hasManifest(agentType) {
  return loadManifest(agentType) !== null;
}

const UNKNOWN_DETECTION = {
  state: 'unknown',
  skipStateUpdate: false,
  visibleIdle: false,
  visibleWorking: false,
  visibleBlocker: false,
  matchedRule: null,
};

const IDLE_FALLBACK_DETECTION = {
  state: 'idle',
  skipStateUpdate: false,
  visibleIdle: false,
  visibleWorking: false,
  visibleBlocker: false,
  matchedRule: null,
};

/**
 * Detect the agent state from terminal output.
 *
 * @param {string} agentType — e.g. 'kimi', 'claude', 'codex'
 * @param {string} screen — recent terminal buffer text
 * @param {object} [options]
 * @param {string} [options.oscTitle] — last OSC 0/2 title emitted by the terminal
 * @returns {object}
 *   { state: 'idle'|'running'|'blocked'|'unknown', skipStateUpdate: boolean,
 *     visibleIdle: boolean, visibleWorking: boolean, visibleBlocker: boolean,
 *     matchedRule: object|null }
 */
export function detectAgentState(agentType, screen, options = {}) {
  const manifest = loadManifest(agentType);
  if (!manifest) {
    return UNKNOWN_DETECTION;
  }

  const cleanScreen = stripAnsi(screen || '');
  const isCancellation = /(?:\^C|\binterrupted\b|\bcancelled\b|\bcanceled\b|\baborted\b)/i.test(cleanScreen);

  const detected = evaluateManifest(manifest, {
    screen: cleanScreen,
    oscTitle: options.oscTitle || '',
    oscProgress: options.oscProgress || '',
  });

  if (isCancellation) {
    detected.wasCancelled = true;
  }

  // Known agent with no manifest match → assume idle, not unknown.
  if (detected.state === 'unknown') {
    return IDLE_FALLBACK_DETECTION;
  }

  return detected;
}
