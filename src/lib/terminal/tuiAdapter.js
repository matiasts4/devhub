/**
 * tuiAdapter.js — per-TUI strategy registry.
 *
 * Each TUI (opencode, grok, plain shell) has its own scroll/click/focus behavior.
 * Consulted by shouldPassthroughNativeTuiWheel, filterTerminalInputForSession,
 * and prepareActiveTuiTerminalFocus call sites.
 */

const TUI_ADAPTER_REGISTRY = Object.freeze({
  opencode: Object.freeze({
    id: 'opencode',
    detectReady: ({ refs } = {}) => Boolean(refs?.tuiSessionFooterConfirmedRef?.current),
    wheelStrategy: Object.freeze({
      passThrough: true,
      buttons: [64, 65],
    }),
    clickStrategy: Object.freeze({
      passThrough: true,
      button: 0,
      requireFooterConfirmed: true,
    }),
    focusStrategy: Object.freeze({
      consume: true,
      stripFocusInOut: true,
    }),
  }),
  grok: Object.freeze({
    id: 'grok',
    detectReady: ({ refs } = {}) => Boolean(refs?.grokTuiReadyRef?.current),
    wheelStrategy: Object.freeze({
      passThrough: true,
      buttons: [64, 65],
    }),
    clickStrategy: Object.freeze({
      passThrough: true,
      button: 0,
      requireFooterConfirmed: false,
    }),
    focusStrategy: Object.freeze({
      consume: true,
      stripFocusInOut: true,
    }),
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

export const tuiAdapterRegistry = TUI_ADAPTER_REGISTRY;
