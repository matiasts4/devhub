'use client';

/**
 * motionPresets.js — iOS-style spring presets for the Motion Lab showcase.
 *
 * These are CANDIDATE presets the team will approve/reject on the
 * /project/:projectId/motion-lab page. They intentionally live OUTSIDE
 * motion-tokens.js (we must not modify that file) so the showcase can
 * iterate without touching production motion code.
 *
 * Design rules (from animate / overdrive skills):
 *  - Only transform + opacity are ever animated by consumers.
 *  - No bounce / elastic easings on enter.
 *  - Values approximate iOS UIKit spring feeling: responsive settle,
 *    no overshoot, light mass for snappy UI.
 *
 * Export shape (nested):
 *   spring.<intent>.transition → framer-motion `transition` object
 *   spring.<intent>.display    → human-readable config string for the UI readout
 */

const makePreset = (stiffness, damping, mass) => ({
  transition: { type: 'spring', stiffness, damping, mass },
  display: `stiffness:${stiffness} damping:${damping} mass:${mass}`,
});

export const spring = {
  /** Toggles / tab indicator — snappy, high damping, settles fast. */
  toggle: makePreset(500, 30, 0.8),
  /** Drag release — medium, follows finger then settles. */
  drag: makePreset(350, 28, 0.6),
  /** Sheets / modals from bottom — soft iOS sheet feel. */
  sheet: makePreset(280, 26, 1.0),
  /** Window / panel open — scale-in, bounce-free settle. */
  open: makePreset(320, 26, 0.9),
  /** Resize / auto-fit settle — gentle. */
  settle: makePreset(180, 22, 1.0),
  /** View push / pop — responsive, communicates direction. */
  nav: makePreset(260, 28, 0.9),
};

export const amplified = {
  /** Toggles / tab indicator — more pronounced but still no bounce. */
  toggle: makePreset(500, 22, 0.9),
  /** Drag release — looser settle so the snap is visible. */
  drag: makePreset(320, 20, 0.7),
  /** Sheets / modals from bottom — bigger, slower travel. */
  sheet: makePreset(240, 20, 1.1),
  /** Window / panel open — larger scale swing, no overshoot. */
  open: makePreset(280, 20, 1.0),
  /** Resize / auto-fit settle — longer visible settle. */
  settle: makePreset(150, 18, 1.2),
  /** View push / pop — pronounced directional movement. */
  nav: makePreset(220, 20, 1.0),
};

export default spring;
