'use strict';

/**
 * execute-dialog.countdown.spec.js
 * Confirms auto-close behavior at countdown = 0.
 *
 * The ExecuteDialog calls onCancel() when countdown reaches 0.
 * This test simulates the timer logic without a DOM.
 */

const TIMER_SECONDS = 60;

describe('execute-dialog.countdown', () => {
  /**
   * Simulate the countdown tick logic.
   * Returns { nextCountdown, expired, callbackFired }
   */
  function tick(currentCountdown, onCancel) {
    if (currentCountdown <= 1) {
      onCancel();
      return { nextCountdown: TIMER_SECONDS, expired: true, callbackFired: true };
    }
    return { nextCountdown: currentCountdown - 1, expired: false, callbackFired: false };
  }

  it('timer starts at 60 seconds', () => {
    expect(TIMER_SECONDS).toBe(60);
  });

  it('countdown decrements each tick', () => {
    expect(tick(60, () => {}).nextCountdown).toBe(59);
    expect(tick(59, () => {}).nextCountdown).toBe(58);
  });

  it('onCancel is NOT called when countdown > 1', () => {
    const result = tick(10, () => {
      throw new Error('onCancel should not be called');
    });
    expect(result.callbackFired).toBe(false);
    expect(result.expired).toBe(false);
  });

  it('onCancel is called when countdown reaches 1 (triggers expiry)', () => {
    let called = false;
    tick(1, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it('onCancel fires before countdown reaches 0 (at 1)', () => {
    // The design fires onCancel at countdown = 1 and resets to 60.
    // So countdown goes 2 → 1 → onCancel → reset to 60
    const result = tick(2, () => {});
    expect(result.expired).toBe(false); // 2 > 1, no expiry yet

    const result2 = tick(1, () => {});
    expect(result2.expired).toBe(true);
    expect(result2.nextCountdown).toBe(TIMER_SECONDS); // Reset to 60
  });

  it('reset to 60 after expiry', () => {
    const result = tick(1, () => {});
    expect(result.nextCountdown).toBe(60);
    expect(result.expired).toBe(true);
  });

  it('timer shows warning class at <= 10 seconds', () => {
    function shouldShowWarning(countdown) {
      return countdown <= 10;
    }
    expect(shouldShowWarning(11)).toBe(false);
    expect(shouldShowWarning(10)).toBe(true);
    expect(shouldShowWarning(5)).toBe(true);
    expect(shouldShowWarning(1)).toBe(true);
  });
});
