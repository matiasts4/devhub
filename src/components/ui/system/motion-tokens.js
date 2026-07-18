/**
 * motion-tokens.js — Shared motion design tokens for DevHub.
 *
 * Single source of truth for durations, easings, and framer-motion
 * transition presets. CSS mirrors live in globals.css as --motion-dur-* /
 * --motion-ease-* (premium decelerate kit).
 *
 * Design philosophy:
 *  - Fast UI feedback (~160ms) with premium ease
 *  - Enter animations (~240–320ms) guide attention without blocking
 *  - All GPU-composited (transform + opacity only — no layout props)
 */

import { spring, amplified } from '../motion/motionPresets';

// ─── Durations (ms) ───────────────────────────────────────────────────────────

export const DUR = {
  /** Micro-interactions: hover, focus rings, icon swaps. */
  instant: 80,
  /** Fast state change — aligns with --motion-dur-fast. */
  fast: 160,
  /** Standard enter/exit — aligns with --motion-dur-base. */
  base: 240,
  /** Content transition: workspace switch, view change. */
  content: 240,
  /** Rich enter: page enter, panel reveal — aligns with --motion-dur-slow. */
  enter: 320,
  /** Slow emphasis: onboarding callouts, loading reveals. */
  slow: 400,
};

/**
 * Surface durations absorbed from src/lib/pizarra/surfaceMotion.js.
 * Kept as a separate namespace so the existing DUR values stay
 * backward-compatible while Phase B can retire the pizarra fork.
 */
export const SURFACE_DUR = {
  fast: 140,
  base: 220,
  enter: 340,
};

// ─── Easings (cubic-bezier strings) ──────────────────────────────────────────

export const EASE = {
  /** Premium decelerate — enter/reveal (matches --motion-ease-premium). */
  out: [0.16, 1, 0.3, 1],
  /** Smooth acceleration — best for exit animations. */
  in: [0.55, 0, 1, 0.45],
  /** Soft symmetric — matches --motion-ease-soft. */
  inOut: [0.4, 0, 0.2, 1],
  /** Linear — only for opacity cross-fades in reduced-motion. */
  linear: 'linear',
};

// ─── CSS easing strings (for use in style={{ transition: ... }}) ──────────────

export const EASE_CSS = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  in: 'cubic-bezier(0.55, 0, 1, 0.45)',
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

/**
 * Absorbed pizarra easings (surfaceMotion.js). Re-exported under the same
 * names so Phase B can swap the fork to these tokens without renames.
 */
export const EASE_OUT = EASE_CSS.out;
export const EASE_SOFT = EASE_CSS.inOut;

/**
 * Host-surface safety contract for Phase B. React subtrees that host
 * native OS overlays (VTE / WebKitGTK) must restrict motion to opacity
 * only; everything else may animate transform + opacity.
 */
export const HOST_MOTION_MODES = {
  TRANSFORM_SAFE: 'transform-safe',
  OPACITY_ONLY: 'opacity-only',
};

// ─── Framer-motion transition presets ─────────────────────────────────────────

/**
 * Use these as the `transition` prop on `motion.*` elements.
 * All presets animate on the GPU compositor path (transform + opacity).
 */
export const TRANSITION = {
  /** 160ms — badges, micro feedback. */
  fast: { duration: DUR.fast / 1000, ease: EASE.out },

  /** 240ms — panels, dropdowns, soft chrome. */
  base: { duration: DUR.base / 1000, ease: EASE.out },

  /** 240ms content — workspace body crossfade. */
  content: { duration: DUR.content / 1000, ease: EASE.inOut },

  /** 320ms rich — page enter, panel reveal. */
  enter: { duration: DUR.enter / 1000, ease: EASE.out },

  /** Spring — active pill, drag feedback, toggle. Uses the approved preset. */
  spring: spring.toggle.transition,

  /** Reduced motion fallback — opacity only, 50ms max. */
  reduced: { duration: 0.05, ease: EASE.linear },
};

export { spring, amplified };

/**
 * Returns the transition object for a given animation intent and motion mode.
 *
 * @param {'toggle'|'open'|'nav'|'sheet'|'drag'|'settle'} intent
 * @param {'reduced'|'normal'|'amplified'} mode
 * @returns {object} framer-motion transition object
 */
export function getTransition(intent, mode) {
  if (mode === 'reduced') return TRANSITION.reduced;
  const source = mode === 'amplified' ? amplified : spring;
  return source[intent]?.transition || spring[intent]?.transition || TRANSITION.base;
}

// ─── Shared initial/animate/exit variant sets ─────────────────────────────────

/** Standard fade-in from below. Use for content panels and cards. */
export const VARIANTS_FADE_UP = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.99 },
};

/** Lightweight crossfade only. Use when geometry must not shift. */
export const VARIANTS_FADE = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

/** Slide in from right — workspace/page navigation. */
export const VARIANTS_SLIDE_RIGHT = {
  hidden: { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12 },
};

/** Right dock layer — enters from off-screen right into its anchored slot. */
export const VARIANTS_DOCK_SLIDE_FROM_RIGHT = {
  hidden: { opacity: 0, x: '100%' },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: '100%' },
};
