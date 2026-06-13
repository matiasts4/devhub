/**
 * motion-tokens.js — Shared motion design tokens for DevHub.
 *
 * Single source of truth for durations, easings, and framer-motion
 * transition presets. All animation-related values must come from here —
 * never hardcode timing values in component files.
 *
 * Design philosophy:
 *  - Fast UI feedback (< 150ms) feels instant, not animated
 *  - Enter animations (150-250ms) guide attention without blocking
 *  - Content transitions (80-180ms) preserve context, don't distract
 *  - All GPU-composited (transform + opacity only — no layout props)
 */

// ─── Durations (ms) ───────────────────────────────────────────────────────────

export const DUR = {
  /** Micro-interactions: hover, focus rings, icon swaps. Feels instant. */
  instant: 80,
  /** Fast state change: active tab indicator, button press. */
  fast: 120,
  /** Standard enter/exit: panels, tooltips, overlays. */
  base: 180,
  /** Content transition: workspace switch, view change. */
  content: 200,
  /** Rich enter: dialogs, drawers, modals. */
  enter: 280,
  /** Slow emphasis: onboarding callouts, loading reveals. */
  slow: 400,
};

// ─── Easings (cubic-bezier strings) ──────────────────────────────────────────

export const EASE = {
  /** Snappy deceleration — best for enter/reveal animations. */
  out: [0.22, 1, 0.36, 1],
  /** Smooth acceleration — best for exit animations. */
  in: [0.55, 0, 1, 0.45],
  /** Symmetric smooth — best for state toggles. */
  inOut: [0.4, 0, 0.2, 1],
  /** Linear — only for opacity cross-fades in reduced-motion. */
  linear: 'linear',
};

// ─── CSS easing strings (for use in style={{ transition: ... }}) ──────────────

export const EASE_CSS = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  in: 'cubic-bezier(0.55, 0, 1, 0.45)',
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

// ─── Framer-motion transition presets ─────────────────────────────────────────

/**
 * Use these as the `transition` prop on `motion.*` elements.
 * All presets animate on the GPU compositor path (transform + opacity).
 */
export const TRANSITION = {
  /** 120ms snappy — workspace tab active indicator, badge swap. */
  fast: { duration: DUR.fast / 1000, ease: EASE.out },

  /** 180ms standard — panel reveals, dropdown open/close. */
  base: { duration: DUR.base / 1000, ease: EASE.out },

  /** 200ms content — workspace body crossfade. */
  content: { duration: DUR.content / 1000, ease: EASE.inOut },

  /** 280ms rich — modal enter, sheet slide-in. */
  enter: { duration: DUR.enter / 1000, ease: EASE.out },

  /** Spring — active pill, drag feedback. Feels physical. */
  spring: { type: 'spring', stiffness: 380, damping: 38, mass: 0.8 },

  /** Reduced motion fallback — opacity only, 50ms max. */
  reduced: { duration: 0.05, ease: EASE.linear },
};

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
