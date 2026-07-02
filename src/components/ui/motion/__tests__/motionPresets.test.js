'use strict';

const { spring } = require('../motionPresets');

describe('motionPresets — nested spring shape', () => {
  const intents = ['toggle', 'drag', 'sheet', 'open', 'settle', 'nav'];

  test('exports spring object with all six intents', () => {
    expect(spring).toBeDefined();
    intents.forEach((intent) => {
      expect(spring[intent]).toBeDefined();
      expect(spring[intent]).toHaveProperty('transition');
      expect(spring[intent]).toHaveProperty('display');
    });
  });

  test.each(intents)('spring.%s.transition is a spring transition object', (intent) => {
    const { transition } = spring[intent];
    expect(transition).toMatchObject({
      type: 'spring',
      stiffness: expect.any(Number),
      damping: expect.any(Number),
      mass: expect.any(Number),
    });
  });

  test.each(intents)('spring.%s.display is a non-empty config string', (intent) => {
    expect(typeof spring[intent].display).toBe('string');
    expect(spring[intent].display.length).toBeGreaterThan(0);
  });

  test('toggle preset matches design values', () => {
    expect(spring.toggle.transition).toMatchObject({ stiffness: 500, damping: 30, mass: 0.8 });
    expect(spring.toggle.display).toContain('stiffness:500');
  });
});
