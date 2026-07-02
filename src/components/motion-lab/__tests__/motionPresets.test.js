'use strict';

const { spring, amplified } = require('../../ui/motion/motionPresets');

describe('motionPresets', () => {
  test('exports spring presets with transition and display for all intents', () => {
    const intents = ['toggle', 'drag', 'sheet', 'open', 'settle', 'nav'];
    intents.forEach((intent) => {
      expect(spring[intent]).toBeDefined();
      expect(spring[intent].transition).toMatchObject({
        type: 'spring',
        stiffness: expect.any(Number),
        damping: expect.any(Number),
        mass: expect.any(Number),
      });
      expect(typeof spring[intent].display).toBe('string');
      expect(spring[intent].display).toContain(`stiffness:${spring[intent].transition.stiffness}`);
    });
  });

  test('exports amplified presets with transition and display for all intents', () => {
    const intents = ['toggle', 'drag', 'sheet', 'open', 'settle', 'nav'];
    intents.forEach((intent) => {
      expect(amplified[intent]).toBeDefined();
      expect(amplified[intent].transition).toMatchObject({
        type: 'spring',
        stiffness: expect.any(Number),
        damping: expect.any(Number),
        mass: expect.any(Number),
      });
      expect(typeof amplified[intent].display).toBe('string');
      expect(amplified[intent].display).toContain(
        `stiffness:${amplified[intent].transition.stiffness}`
      );
    });
  });

  test('amplified presets use looser damping than spring for visible settle', () => {
    expect(amplified.toggle.transition.damping).toBeLessThan(spring.toggle.transition.damping);
    expect(amplified.toggle.transition.damping).toBeGreaterThanOrEqual(18);
  });

  test('spring default export matches named spring export', () => {
    const presets = require('../../ui/motion/motionPresets');
    expect(presets.default).toBe(spring);
  });
});
