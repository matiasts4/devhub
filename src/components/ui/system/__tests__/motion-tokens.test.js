/**
 * @jest-environment node
 */

'use strict';

const {
  DUR,
  EASE,
  EASE_CSS,
  EASE_OUT,
  EASE_SOFT,
  HOST_MOTION_MODES,
  SURFACE_DUR,
  TRANSITION,
  VARIANTS_FADE,
  VARIANTS_FADE_UP,
  VARIANTS_SLIDE_RIGHT,
  VARIANTS_DOCK_SLIDE_FROM_RIGHT,
  getTransition,
} = require('../motion-tokens');

describe('motion-tokens v2', () => {
  test('exports the full token surface', () => {
    expect(DUR).toBeDefined();
    expect(EASE).toBeDefined();
    expect(EASE_CSS).toBeDefined();
    expect(TRANSITION).toBeDefined();
    expect(VARIANTS_FADE).toBeDefined();
    expect(VARIANTS_FADE_UP).toBeDefined();
    expect(VARIANTS_SLIDE_RIGHT).toBeDefined();
    expect(VARIANTS_DOCK_SLIDE_FROM_RIGHT).toBeDefined();
  });

  test('TRANSITION.spring resolves to the real spring.toggle preset', () => {
    const { spring } = require('../../motion/motionPresets');
    expect(TRANSITION.spring).toEqual(spring.toggle.transition);
    expect(TRANSITION.spring).toMatchObject({
      type: 'spring',
      stiffness: 500,
      damping: 30,
      mass: 0.8,
    });
  });

  test('absorbed pizarra EASE_OUT matches EASE_CSS.out', () => {
    expect(EASE_OUT).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
    expect(EASE_OUT).toBe(EASE_CSS.out);
  });

  test('absorbed pizarra EASE_SOFT matches EASE_CSS.inOut', () => {
    expect(EASE_SOFT).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
    expect(EASE_SOFT).toBe(EASE_CSS.inOut);
  });

  test('absorbed pizarra surface durations are present and match the fork', () => {
    expect(SURFACE_DUR).toEqual({
      fast: 140,
      base: 220,
      enter: 340,
    });
  });

  test('HOST_MOTION_MODES defines the Phase B safety contract', () => {
    expect(HOST_MOTION_MODES).toEqual({
      TRANSFORM_SAFE: 'transform-safe',
      OPACITY_ONLY: 'opacity-only',
    });
  });

  test('legacy DUR values remain backward-compatible', () => {
    expect(DUR.instant).toBe(80);
    expect(DUR.fast).toBe(120);
    expect(DUR.base).toBe(180);
    expect(DUR.content).toBe(200);
    expect(DUR.enter).toBe(280);
    expect(DUR.slow).toBe(400);
  });

  describe('getTransition()', () => {
    test('reduced mode returns the reduced opacity-only transition', () => {
      expect(getTransition('toggle', 'reduced')).toEqual(TRANSITION.reduced);
      expect(getTransition('nav', 'reduced')).toEqual(TRANSITION.reduced);
    });

    test('normal mode returns the spring preset for the intent', () => {
      const { spring } = require('../../motion/motionPresets');
      expect(getTransition('toggle', 'normal')).toEqual(spring.toggle.transition);
      expect(getTransition('nav', 'normal')).toEqual(spring.nav.transition);
      expect(getTransition('open', 'normal')).toEqual(spring.open.transition);
    });

    test('amplified mode returns the amplified spring preset for the intent', () => {
      const { amplified } = require('../../motion/motionPresets');
      expect(getTransition('toggle', 'amplified')).toEqual(amplified.toggle.transition);
      expect(getTransition('nav', 'amplified')).toEqual(amplified.nav.transition);
      expect(getTransition('open', 'amplified')).toEqual(amplified.open.transition);
    });
  });
});
