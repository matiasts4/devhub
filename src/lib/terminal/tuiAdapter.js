 
/**
 * tuiAdapter.js — per-TUI strategy registry.
 *
 * Each TUI (opencode, grok, kimi, codex, plain shell) has scroll/click/focus behavior.
 * Consulted by shouldPassthroughNativeTuiWheel, filterTerminalInputForSession,
 * and prepareActiveTuiTerminalFocus call sites.
 */

import { resolveAgentProgramFromCommand } from './agentTui.js';

const INK_WHEEL_STRATEGY = Object.freeze({
  passThrough: true,
  buttons: [64, 65],
});

const INK_FOCUS_STRATEGY = Object.freeze({
  consume: true,
  stripFocusInOut: true,
});

const TUI_ADAPTER_REGISTRY = Object.freeze({
  opencode: Object.freeze({
    id: 'opencode',
    detectReady: ({ refs } = {}) => Boolean(refs?.tuiSessionFooterConfirmedRef?.current),
    wheelStrategy: INK_WHEEL_STRATEGY,
    clickStrategy: Object.freeze({
      passThrough: true,
      button: 0,
      requireFooterConfirmed: true,
    }),
    focusStrategy: INK_FOCUS_STRATEGY,
  }),
  grok: Object.freeze({
    id: 'grok',
    detectReady: ({ refs } = {}) => Boolean(refs?.grokTuiReadyRef?.current),
    wheelStrategy: INK_WHEEL_STRATEGY,
    clickStrategy: Object.freeze({
      passThrough: true,
      button: 0,
      requireFooterConfirmed: false,
    }),
    focusStrategy: INK_FOCUS_STRATEGY,
  }),
  agent: Object.freeze({
    id: 'agent',
    detectReady: ({ refs } = {}) => Boolean(refs?.agentTuiReadyRef?.current),
    // ponytail: xterm-webgl wheel passthrough reaches OpenCode/Grok but not Kimi/Codex Ink reliably
    wheelStrategy: Object.freeze({
      passThrough: false,
      buttons: [64, 65],
    }),
    clickStrategy: Object.freeze({
      passThrough: true,
      button: 0,
      requireFooterConfirmed: false,
    }),
    focusStrategy: INK_FOCUS_STRATEGY,
  }),
  plain: Object.freeze({
    id: 'plain',
    detectReady: () => false,
    wheelStrategy: Object.freeze({
      passThrough: false,
      buttons: [],
      localScrollback: true,
    }),
    clickStrategy: Object.freeze({
      passThrough: false,
      button: null,
    }),
    focusStrategy: Object.freeze({
      consume: false,
      stripFocusInOut: false,
    }),
  }),
});

const PLAIN_FALLBACK = TUI_ADAPTER_REGISTRY.plain;

export function getTuiAdapter(programSignature) {
  if (
    typeof programSignature === 'string' &&
    Object.prototype.hasOwnProperty.call(TUI_ADAPTER_REGISTRY, programSignature)
  ) {
    return TUI_ADAPTER_REGISTRY[programSignature];
  }
  return PLAIN_FALLBACK;
}

export function resolveTuiAdapterForCommand(initialCommand) {
  const program = resolveAgentProgramFromCommand(initialCommand);
  if (program === 'opencode') return TUI_ADAPTER_REGISTRY.opencode;
  if (program === 'grok' || program === 'groc') return TUI_ADAPTER_REGISTRY.grok;
  if (program) return TUI_ADAPTER_REGISTRY.agent;
  return PLAIN_FALLBACK;
}

export function shouldPassthroughNativeTuiWheel({
  initialCommand = '',
  isGrokSession = false,
  grokTuiReady = false,
  opencodeFooterConfirmed = false,
  agentTuiReady = false,
} = {}) {
  const refs = {
    grokTuiReadyRef: { current: grokTuiReady },
    tuiSessionFooterConfirmedRef: { current: opencodeFooterConfirmed },
    agentTuiReadyRef: { current: agentTuiReady },
  };

  if (isGrokSession) {
    const grokAdapter = TUI_ADAPTER_REGISTRY.grok;
    return grokAdapter.wheelStrategy.passThrough && grokAdapter.detectReady({ refs });
  }

  const adapter = resolveTuiAdapterForCommand(initialCommand);
  if (!adapter.wheelStrategy.passThrough) return false;
  return adapter.detectReady({ refs });
}

export const tuiAdapterRegistry = TUI_ADAPTER_REGISTRY;
