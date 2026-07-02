'use strict';

/**
 * hostMotionMode.js — Host-surface safety contract for Phase B.
 *
 * React subtrees that host native OS overlays (VTE / WebKitGTK / X11)
 * must restrict motion to opacity only; everything else may animate
 * transform + opacity. This module provides the contract values and
 * a lightweight validator so components can assert their animation
 * props are safe for the surface they render in.
 */

const LAYOUT_PROPS = new Set([
  'width',
  'height',
  'top',
  'left',
  'right',
  'bottom',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
]);

const TRANSFORM_PROPS = new Set([
  'x',
  'y',
  'z',
  'translateX',
  'translateY',
  'translateZ',
  'scale',
  'scaleX',
  'scaleY',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'skew',
  'skewX',
  'skewY',
]);

export const HOST_MOTION_MODES = {
  TRANSFORM_SAFE: 'transform-safe',
  OPACITY_ONLY: 'opacity-only',
};

const CONSTRAINTS = {
  [HOST_MOTION_MODES.TRANSFORM_SAFE]: {
    properties: ['transform', 'opacity'],
    transforms: ['translateX', 'translateY', 'scale', 'rotate'],
  },
  [HOST_MOTION_MODES.OPACITY_ONLY]: {
    properties: ['opacity'],
    transforms: [],
  },
};

/**
 * Returns the allowed animatable properties for a given host motion mode.
 *
 * @param {string} mode — one of HOST_MOTION_MODES values
 * @returns {{properties: string[], transforms: string[]}}
 */
export function getMotionConstraints(mode) {
  return CONSTRAINTS[mode] || CONSTRAINTS[HOST_MOTION_MODES.OPACITY_ONLY];
}

/**
 * Validates a framer-motion style/props object against a host motion mode.
 *
 * @param {Record<string, unknown>|null|undefined} props
 * @param {string} mode
 * @returns {Array<{prop: string, message: string}>} warnings for disallowed properties
 */
export function validateAnimationProps(props, mode) {
  if (!props || typeof props !== 'object') return [];

  const constraints = getMotionConstraints(mode);
  const allowed = new Set(constraints.properties);
  const allowedTransforms = new Set(constraints.transforms);
  const warnings = [];

  for (const prop of Object.keys(props)) {
    if (prop === 'transition') continue;

    if (LAYOUT_PROPS.has(prop)) {
      warnings.push({
        prop,
        message: `${prop} is a layout property and must never be animated (only transform + opacity).`,
      });
      continue;
    }

    if (TRANSFORM_PROPS.has(prop)) {
      const canonical =
        prop === 'x'
          ? 'translateX'
          : prop === 'y'
            ? 'translateY'
            : prop === 'z'
              ? 'translateZ'
              : prop.startsWith('translate')
                ? prop
                : prop.startsWith('scale')
                  ? 'scale'
                  : prop.startsWith('rotate')
                    ? 'rotate'
                    : prop;
      if (!allowedTransforms.has(canonical)) {
        warnings.push({
          prop,
          message: `${prop} is a transform and is not allowed in ${mode} mode.`,
        });
      }
      continue;
    }

    if (!allowed.has(prop)) {
      warnings.push({
        prop,
        message: `${prop} is not an allowed animatable property in ${mode} mode.`,
      });
    }
  }

  return warnings;
}
