/**
 * Unified Zed intent router — merges zedFastPath, CommandBar rules, and 2-step phrases.
 */

import { resolveZedFastPathIntent } from './zedFastPath';
import { createRuleIntentRouter } from '@/lib/commandBar/intent/ruleIntentRouter';
import { buildZedTerminalCatalog } from './workspaceTerminalRegistry';
import { recordIntentResolution } from './zedMetrics';

const commandRouter = createRuleIntentRouter();
const TWO_STEP_SPLIT = /\s+(?:y(?:\s+luego)?|and\s+then|;\s*then|y\s+después|y\s+despues)\s+/i;

const TIER_HIGH = 0.85;
const TIER_MEDIUM = 0.7;

/**
 * @typedef {'local-high' | 'local-medium' | 'llm'} ZedIntentTier
 */

/**
 * @param {number} confidence
 * @returns {ZedIntentTier}
 */
export function confidenceToTier(confidence) {
  if (confidence >= TIER_HIGH) return 'local-high';
  if (confidence >= TIER_MEDIUM) return 'local-medium';
  return 'llm';
}

/**
 * @param {import('@/lib/commandBar/intent/IntentRouter').ResolvedIntent} cmd
 * @param {object} context
 * @returns {{ steps: Array<{ tool: string, input: Record<string, unknown> }>, intent: string, confidence: number, matched: string } | null}
 */
function mapCommandBarIntent(cmd, context = {}) {
  if (!cmd || cmd.intent === 'unknown') return null;

  if (cmd.intent === 'browser-navigate') {
    const url = cmd.slots?.url || '';
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    return {
      steps: [{ tool: 'open_url', input: { url: normalized, focus: true } }],
      intent: 'open_url',
      confidence: 0.9,
      matched: 'commandbar:browser-navigate',
    };
  }

  if (cmd.intent === 'browser-search') {
    const query = encodeURIComponent(cmd.slots?.query || '');
    return {
      steps: [
        {
          tool: 'open_url',
          input: { url: `https://www.google.com/search?q=${query}`, focus: true },
        },
      ],
      intent: 'browser-search',
      confidence: 0.88,
      matched: 'commandbar:browser-search',
    };
  }

  if (cmd.intent === 'terminal-read') {
    const name = cmd.slots?.terminalName;
    if (!name) return null;
    return {
      steps: [{ tool: 'review_terminal_output', input: { name } }],
      intent: 'terminal-read',
      confidence: 0.87,
      matched: 'commandbar:terminal-read',
    };
  }

  if (cmd.intent === 'terminal-run') {
    const command = cmd.slots?.command;
    if (!command) return null;
    const terminalName = cmd.slots?.terminalName;
    const terminals = buildZedTerminalCatalog(context);
    const hasNamed =
      terminalName &&
      terminals.some((t) => t.displayName?.toLowerCase() === terminalName.toLowerCase());

    if (hasNamed) {
      return {
        steps: [{ tool: 'execute_in_terminal', input: { name: terminalName, input: command } }],
        intent: 'terminal-run',
        confidence: 0.9,
        matched: 'commandbar:terminal-run-existing',
      };
    }

    return {
      steps: [{ tool: 'open_terminal', input: { command } }],
      intent: 'terminal-run',
      confidence: 0.9,
      matched: 'commandbar:terminal-run-new',
    };
  }

  return null;
}

/**
 * @param {string} message
 * @param {object} context
 * @returns {{ steps: Array, intent: string, confidence: number, matched: string } | null}
 */
function resolveTwoStepIntent(message, context = {}) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || !TWO_STEP_SPLIT.test(text)) return null;

  const parts = text
    .split(TWO_STEP_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;

  const first = resolveZedIntentSingle(parts[0], context);
  const second = resolveZedIntentSingle(parts[1], context);
  if (!first || !second) return null;
  if (first.tier === 'llm' || second.tier === 'llm') return null;

  const confidence = Math.min(first.confidence, second.confidence);
  return {
    steps: [...first.steps, ...second.steps],
    intent: `${first.intent}+${second.intent}`,
    confidence,
    matched: `two-step:${first.matched}+${second.matched}`,
  };
}

/**
 * @param {string} message
 * @param {object} context
 * @returns {{ tier: ZedIntentTier, steps: Array, intent: string, confidence: number, matched: string, needsConfirmation: boolean } | { tier: 'llm', steps: [], intent: 'unknown', confidence: 0, matched: '', needsConfirmation: false }}
 */
export function resolveZedIntentSingle(message, context = {}) {
  const text = typeof message === 'string' ? message.trim() : '';
  const source = context?.source || 'text';
  let result = null;

  if (!text) {
    result = {
      tier: 'llm',
      steps: [],
      intent: 'unknown',
      confidence: 0,
      matched: '',
      needsConfirmation: false,
    };
  } else {
    const spanishRun = text.match(/^(ejecuta|ejecutar|corre|correr)\s+(.+)/i);
    if (spanishRun?.[2]) {
      const mapped = mapCommandBarIntent(
        { intent: 'terminal-run', slots: { command: spanishRun[2].trim() } },
        context
      );
      if (mapped) {
        const tier = confidenceToTier(mapped.confidence);
        if (tier !== 'llm') {
          result = {
            tier,
            steps: mapped.steps,
            intent: mapped.intent,
            confidence: mapped.confidence,
            matched: 'spanish:terminal-run',
            needsConfirmation: tier === 'local-medium',
          };
        }
      }
    }

    if (!result) {
      const fast = resolveZedFastPathIntent(message, context);
      if (fast) {
        const tier = confidenceToTier(fast.confidence);
        if (tier !== 'llm') {
          result = {
            tier,
            steps: fast.steps,
            intent: fast.intent,
            confidence: fast.confidence,
            matched: fast.matched,
            needsConfirmation: tier === 'local-medium',
          };
        }
      }
    }

    if (!result) {
      const cmd = commandRouter.resolveIntent(message);
      const mapped = mapCommandBarIntent(cmd, context);
      if (mapped) {
        const tier = confidenceToTier(mapped.confidence);
        if (tier !== 'llm') {
          result = {
            tier,
            steps: mapped.steps,
            intent: mapped.intent,
            confidence: mapped.confidence,
            matched: mapped.matched,
            needsConfirmation: tier === 'local-medium',
          };
        }
      }
    }

    if (!result) {
      result = {
        tier: 'llm',
        steps: [],
        intent: 'unknown',
        confidence: 0,
        matched: '',
        needsConfirmation: false,
      };
    }
  }

  recordIntentResolution({
    message: text,
    tier: result.tier,
    confidence: result.confidence,
    matched: result.matched,
    source,
  });

  return result;
}

/**
 * @param {string} message
 * @param {object} [context]
 */
export function resolveZedIntent(message, context = {}) {
  const source = context?.source || 'text';
  const twoStep = resolveTwoStepIntent(message, context);
  if (twoStep) {
    const tier = confidenceToTier(twoStep.confidence);
    if (tier !== 'llm') {
      const result = {
        tier,
        steps: twoStep.steps,
        intent: twoStep.intent,
        confidence: twoStep.confidence,
        matched: twoStep.matched,
        needsConfirmation: tier === 'local-medium',
      };
      recordIntentResolution({
        message,
        tier: result.tier,
        confidence: result.confidence,
        matched: result.matched,
        source,
      });
      return result;
    }
  }

  return resolveZedIntentSingle(message, context);
}

export default resolveZedIntent;
