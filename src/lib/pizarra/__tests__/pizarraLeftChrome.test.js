import {
  PIZARRA_LEFT_HUD_STACK_HEIGHT_PX,
  PIZARRA_LEFT_SWIPE_INSET_BOTTOM_PX,
  PIZARRA_LEFT_SWIPE_WIDTH_PX,
} from '../pizarraLeftChrome';

describe('pizarraLeftChrome', () => {
  test('swipe inset bottom matches HUD stack height', () => {
    expect(PIZARRA_LEFT_SWIPE_INSET_BOTTOM_PX).toBe(PIZARRA_LEFT_HUD_STACK_HEIGHT_PX);
  });

  test('swipe band is narrower than legacy 56px edge', () => {
    expect(PIZARRA_LEFT_SWIPE_WIDTH_PX).toBeLessThanOrEqual(44);
  });
});
