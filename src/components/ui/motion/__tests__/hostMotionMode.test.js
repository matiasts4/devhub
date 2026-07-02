'use strict';

const {
  HOST_MOTION_MODES,
  getMotionConstraints,
  validateAnimationProps,
} = require('../hostMotionMode');

describe('hostMotionMode — host-surface safety contract', () => {
  test('HOST_MOTION_MODES exports the two Phase B modes', () => {
    expect(HOST_MOTION_MODES).toEqual({
      TRANSFORM_SAFE: 'transform-safe',
      OPACITY_ONLY: 'opacity-only',
    });
  });

  describe('getMotionConstraints()', () => {
    test('transform-safe allows transform + opacity with common transforms', () => {
      expect(getMotionConstraints(HOST_MOTION_MODES.TRANSFORM_SAFE)).toEqual({
        properties: ['transform', 'opacity'],
        transforms: ['translateX', 'translateY', 'scale', 'rotate'],
      });
    });

    test('opacity-only restricts to opacity only and forbids transforms', () => {
      expect(getMotionConstraints(HOST_MOTION_MODES.OPACITY_ONLY)).toEqual({
        properties: ['opacity'],
        transforms: [],
      });
    });

    test('unknown mode defaults to the safest opacity-only constraint', () => {
      expect(getMotionConstraints('unknown-mode')).toEqual({
        properties: ['opacity'],
        transforms: [],
      });
    });
  });

  describe('validateAnimationProps()', () => {
    test('transform-safe mode accepts transform and opacity props', () => {
      const warnings = validateAnimationProps(
        { x: 10, y: 0, opacity: 0.5, scale: 0.9 },
        HOST_MOTION_MODES.TRANSFORM_SAFE
      );
      expect(warnings).toEqual([]);
    });

    test('opacity-only mode flags transform props as violations', () => {
      const warnings = validateAnimationProps(
        { x: 10, y: 5, scale: 1.1, rotate: 15, opacity: 0.8 },
        HOST_MOTION_MODES.OPACITY_ONLY
      );
      expect(warnings).toContainEqual(
        expect.objectContaining({ prop: 'x', message: expect.stringContaining('x') })
      );
      expect(warnings).toContainEqual(
        expect.objectContaining({ prop: 'scale', message: expect.stringContaining('scale') })
      );
      expect(warnings).toContainEqual(
        expect.objectContaining({ prop: 'rotate', message: expect.stringContaining('rotate') })
      );
    });

    test('opacity-only mode allows pure opacity animations', () => {
      const warnings = validateAnimationProps(
        { opacity: 0, transition: { duration: 0.05 } },
        HOST_MOTION_MODES.OPACITY_ONLY
      );
      expect(warnings).toEqual([]);
    });

    test('flags layout properties regardless of mode', () => {
      const warnings = validateAnimationProps(
        { width: 100, height: 200, top: 10, opacity: 1 },
        HOST_MOTION_MODES.TRANSFORM_SAFE
      );
      expect(warnings).toContainEqual(
        expect.objectContaining({ prop: 'width', message: expect.stringContaining('layout') })
      );
      expect(warnings).toContainEqual(
        expect.objectContaining({ prop: 'height', message: expect.stringContaining('layout') })
      );
    });

    test('returns empty array for null/empty props', () => {
      expect(validateAnimationProps(null, HOST_MOTION_MODES.OPACITY_ONLY)).toEqual([]);
      expect(validateAnimationProps({}, HOST_MOTION_MODES.TRANSFORM_SAFE)).toEqual([]);
    });
  });
});
