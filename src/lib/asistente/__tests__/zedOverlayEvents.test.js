const {
  resolveZedAmbientPhase,
  shouldShowZedAura,
  ZED_OVERLAY_TOGGLE_EVENT,
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
});