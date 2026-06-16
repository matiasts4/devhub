/**
 * CommandBar shares the same intent resolution core as Zed fast path.
 */
import { resolveZedIntent } from '@/lib/asistente/zedIntentRouter';
import { createRuleIntentRouter } from '@/lib/commandBar/intent/ruleIntentRouter';

export { resolveZedIntent, confidenceToTier } from '@/lib/asistente/zedIntentRouter';

const fallbackRouter = createRuleIntentRouter();

/**
 * @param {import('@/lib/commandBar/types').SurfaceController} [surfaceController]
 */
export function buildCommandBarContext(surfaceController) {
  const terminals = surfaceController?.listTerminals?.() || [];
  return {
    workspace_terminals: terminals.map((t) => ({
      terminalId: t.id,
      displayName: t.label,
    })),
    terminal_panel_count: terminals.length,
  };
}

/**
 * Map unified Zed router output to CommandBar ResolvedIntent.
 *
 * @param {string} text
 * @param {object} [context]
 * @returns {import('@/lib/commandBar/types').ResolvedIntent}
 */
export function resolveCommandBarIntent(text, context = {}) {
  const hit = resolveZedIntent(text, context);
  if (hit.tier === 'llm' || !hit.steps?.length) {
    return fallbackRouter.resolveIntent(text);
  }
  if (hit.steps.length > 1) {
    return { intent: 'unknown', slots: { reason: 'multi-step' } };
  }

  const step = hit.steps[0];
  switch (step.tool) {
    case 'open_terminal':
      return {
        intent: 'terminal-run',
        slots: { command: String(step.input?.command || '') },
        confidence: hit.confidence,
      };
    case 'execute_in_terminal':
      return {
        intent: 'terminal-run',
        slots: {
          command: String(step.input?.input || ''),
          terminalName: step.input?.name ? String(step.input.name) : undefined,
        },
        confidence: hit.confidence,
      };
    case 'open_url': {
      const url = String(step.input?.url || '');
      if (url.includes('google.com/search')) {
        try {
          const q = new URL(url).searchParams.get('q') || '';
          return {
            intent: 'browser-search',
            slots: { query: decodeURIComponent(q) },
            confidence: hit.confidence,
          };
        } catch {
          return { intent: 'browser-navigate', slots: { url }, confidence: hit.confidence };
        }
      }
      return { intent: 'browser-navigate', slots: { url }, confidence: hit.confidence };
    }
    case 'review_terminal_output':
      return {
        intent: 'terminal-read',
        slots: { terminalName: step.input?.name ? String(step.input.name) : undefined },
        confidence: hit.confidence,
      };
    default:
      return fallbackRouter.resolveIntent(text);
  }
}
