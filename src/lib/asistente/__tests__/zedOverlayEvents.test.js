const {
  resolveZedAmbientPhase,
  shouldShowZedAura,
  ZED_OVERLAY_TOGGLE_EVENT,
  ZED_AURA_TOOL_TYPE_EVENT,
  dispatchZedAuraToolType,
} = require('../zedOverlayEvents');

describe('zedOverlayEvents', () => {
  test('resolveZedAmbientPhase prioritizes executing over open', () => {
    expect(resolveZedAmbientPhase(true, true, null)).toBe('executing');
    expect(resolveZedAmbientPhase(false, true, null)).toBe('open');
    expect(resolveZedAmbientPhase(false, false, 'listo')).toBe('responding');
    expect(resolveZedAmbientPhase(false, false, null)).toBe('idle');
  });

  test('shouldShowZedAura hides on idle', () => {
    expect(shouldShowZedAura('idle')).toBe(false);
    expect(shouldShowZedAura('open')).toBe(true);
    expect(shouldShowZedAura('executing')).toBe(true);
  });

  test('toggle event name is stable', () => {
    expect(ZED_OVERLAY_TOGGLE_EVENT).toBe('devhub:zed-overlay-toggle');
  });

  test('tool-type event name is stable', () => {
    expect(ZED_AURA_TOOL_TYPE_EVENT).toBe('devhub:zed-aura-tool-type');
  });

  test('dispatchZedAuraToolType is SSR-safe (no window => no throw)', () => {
    const originalWindow = global.window;
    delete global.window;
    try {
      expect(() => dispatchZedAuraToolType('terminal')).not.toThrow();
      const result = dispatchZedAuraToolType('terminal');
      expect(result).toBeUndefined();
    } finally {
      global.window = originalWindow;
    }
  });

  test('dispatchZedAuraToolType fires a CustomEvent with detail.toolType', () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://devhub.test',
    });
    const previousWindow = global.window;
    const previousCustomEvent = global.CustomEvent;
    global.window = dom.window;
    global.CustomEvent = dom.window.CustomEvent;
    try {
      const seen = [];
      const handler = (e) => seen.push(e.detail);
      dom.window.addEventListener(ZED_AURA_TOOL_TYPE_EVENT, handler);
      dispatchZedAuraToolType('terminal');
      dispatchZedAuraToolType(null);
      expect(seen).toEqual([{ toolType: 'terminal' }, { toolType: null }]);
      dom.window.removeEventListener(ZED_AURA_TOOL_TYPE_EVENT, handler);
    } finally {
      global.window = previousWindow;
      if (previousCustomEvent === undefined) delete global.CustomEvent;
      else global.CustomEvent = previousCustomEvent;
      dom.window.close();
    }
  });
});
