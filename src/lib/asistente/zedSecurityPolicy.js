/**
 * Zed security policy: risk classification, confirmation levels, jailbreak
 * detection and rate limiting (Phase 10).
 */

export const CONFIRMATION_LEVELS = Object.freeze({
  PARANOID: 'paranoid',
  DEFAULT: 'default',
  TRUSTED: 'trusted',
});

const JAILBREAK_PATTERNS = [
  /\bignore\s+(?:all\s+)?previous\s+instructions\b/i,
  /\bignore\s+(?:the\s+)?system\s+prompt\b/i,
  /\bDAN\b.*\bdo\s+anything\s+now\b/i,
  /\bdeveloper\s+mode\s+enabled?\b/i,
  /\bjailbreak\b/i,
  /\broleplay\s+as\s+(?:an?\s+)?unfiltered\b/i,
  /\bno\s+(?:limits|restrictions)\b/i,
  /\bdisregard\s+(?:all\s+)?rules\b/i,
  /\byou\s+are\s+not\s+(?:an?\s+)?(?:AI|assistant|bot)\b/i,
  /\bpretend\s+to\s+be\s+(?:an?\s+)?(?:human|user)\b/i,
  /\bdo\s+not\s+(?:tell|inform|warn)\s+(?:the\s+)?user\b/i,
  /\bthis\s+is\s+a\s+hypothetical\s+(?:scenario|situation)\b/i,
];

const EXFILTRATION_PATTERNS = [
  /\.env\b/i,
  /\.ssh\b/i,
  /\bid_rsa\b/i,
  /\bssh[-_]key\b/i,
  /\bapi[_-]?key\b/i,
  /\bsecret[_-]?key\b/i,
  /\bprivate[_-]?key\b/i,
  /\bpassword\b/i,
  /\btoken\b/i,
  /\bauth[_-]?token\b/i,
  /\bbearer\s+[a-z0-9]/i,
  /\bsk-[a-z0-9]{20,}/i,
];

const OFFUSCATION_PATTERNS = [
  /\beval\s*\(/i,
  /\bbase64\s*\(/i,
  /\batob\s*\(/i,
  /\bbtoa\s*\(/i,
  /\bString\.fromCharCode\b/i,
  /\bfunction\s*\(\s*\)\s*\{\s*return\s+[^}]+\}/i,
  /\bprocess\.env\b/i,
];

const DESTRUCTIVE_TOOLS = new Set([
  'close_terminal',
  'close_all_terminals',
  'delete_project',
]);

const MCP_TOOLS = new Set([
  'create_task',
  'create_milestone',
  'bulk_create_tasks',
  'bulk_create_milestones',
  'update_task',
  'update_milestone',
  'delete_project',
  'register_zed_agent',
]);

const HIGH_RISK_TOOLS = new Set([
  'execute_in_terminal',
  'launch_agent_session',
  'launch_swarm_local',
]);

/**
 * @param {string} message
 * @returns {{ blocked: boolean, reason: string|null, flags: string[] }}
 */
export function detectMaliciousPrompt(message) {
  const text = typeof message === 'string' ? message : '';
  const flags = [];

  for (let i = 0; i < JAILBREAK_PATTERNS.length; i++) {
    if (JAILBREAK_PATTERNS[i].test(text)) {
      flags.push('jailbreak');
      break;
    }
  }

  for (let i = 0; i < EXFILTRATION_PATTERNS.length; i++) {
    if (EXFILTRATION_PATTERNS[i].test(text)) {
      flags.push('exfiltration');
      break;
    }
  }

  for (let i = 0; i < OFFUSCATION_PATTERNS.length; i++) {
    if (OFFUSCATION_PATTERNS[i].test(text)) {
      flags.push('obfuscation');
      break;
    }
  }

  if (flags.length === 0) {
    return { blocked: false, reason: null, flags: [] };
  }

  return {
    blocked: flags.includes('jailbreak') || flags.includes('exfiltration'),
    reason: `Potentially harmful prompt detected: ${flags.join(', ')}`,
    flags,
  };
}

/**
 * @param {string} level
 * @param {{ tool: string, input?: object }[]} steps
 * @returns {{ requiresConfirmation: boolean, reason: string|null }}
 */
export function classifyPlanRisk(level = CONFIRMATION_LEVELS.DEFAULT, steps = []) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return { requiresConfirmation: false, reason: null };
  }

  const hasDestructive = steps.some((s) => DESTRUCTIVE_TOOLS.has(s.tool));
  const hasMcp = steps.some((s) => MCP_TOOLS.has(s.tool));
  const hasHighRisk = steps.some((s) => HIGH_RISK_TOOLS.has(s.tool));
  const isMultiStep = steps.length > 1;

  switch (level) {
    case CONFIRMATION_LEVELS.PARANOID:
      if (hasDestructive || hasMcp || hasHighRisk || isMultiStep) {
        return { requiresConfirmation: true, reason: 'paranoid level requires confirmation' };
      }
      break;
    case CONFIRMATION_LEVELS.TRUSTED:
      if (hasDestructive) {
        return { requiresConfirmation: true, reason: 'destructive action requires confirmation' };
      }
      break;
    case CONFIRMATION_LEVELS.DEFAULT:
    default:
      if (hasDestructive || hasMcp || hasHighRisk || isMultiStep) {
        return { requiresConfirmation: true, reason: 'risky action or multi-step plan' };
      }
      break;
  }

  return { requiresConfirmation: false, reason: null };
}

/**
 * Simple in-memory rate limiter.
 */
export function createRateLimiter({ maxCalls = 60, windowMs = 60000 } = {}) {
  const calls = [];

  return {
    canProceed() {
      const now = Date.now();
      while (calls.length > 0 && calls[0] <= now - windowMs) {
        calls.shift();
      }
      return calls.length < maxCalls;
    },
    record() {
      calls.push(Date.now());
    },
    getUsage() {
      const now = Date.now();
      while (calls.length > 0 && calls[0] <= now - windowMs) {
        calls.shift();
      }
      return { current: calls.length, max: maxCalls, windowMs };
    },
  };
}

/**
 * @param {string} command
 * @returns {{ safe: boolean, reason: string|null }}
 */
export function checkCommandSafety(command) {
  if (typeof command !== 'string') return { safe: false, reason: 'command must be a string' };
  const lower = command.toLowerCase();
  if (/\bsudo\b/.test(lower)) return { safe: false, reason: 'sudo is not allowed' };
  if (/\brm\s+.*-rf\b/.test(lower)) return { safe: false, reason: 'recursive deletion is not allowed' };
  if (/curl\s+.*\|\s*(ba)?sh\b/i.test(command)) return { safe: false, reason: 'curl piped to shell is not allowed' };
  if (/\beval\s+/.test(lower)) return { safe: false, reason: 'eval is not allowed' };
  return { safe: true, reason: null };
}

export default {
  CONFIRMATION_LEVELS,
  detectMaliciousPrompt,
  classifyPlanRisk,
  createRateLimiter,
  checkCommandSafety,
};
