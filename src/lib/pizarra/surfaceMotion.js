'use client';

/**
 * surfaceMotion — shared motion + chrome tokens for pizarra live surfaces
 * (CanvasTerminal, PizarraBrowserSurface) and their resize handles.
 *
 * Goal: a single source of truth for easings, durations, shadows, borders
 * and resize-handle sizing so the terminal and browser cards feel like one
 * cohesive, professional system instead of two divergent ad-hoc styles.
 *
 * Why pure DOM/CSS (no framer-motion on the wrapper): the live surfaces are
 * mirrored by native OS windows (VTE / WebKitGTK) positioned via IPC in
 * absolute screen coordinates. Transforming/animating the React WRAPPER would
 * desync the chrome from the native surface. All motion here is applied to the
 * INNER chrome frame (pure DOM) and only while the native surface is suspended
 * (during drag/resize) or idle — never to the positioned wrapper.
 */

export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const EASE_SOFT = 'cubic-bezier(0.4, 0, 0.2, 1)';

export const DUR = {
  fast: 140,
  base: 220,
  // pizarra-instant-enter A4: 340 → 180. The enter fade runs while the live
  // surface is still reattaching (portal retarget + Konva mount), so a long
  // fade read as "the canvas is empty/slow". 180ms keeps the polish without
  // masking the load; the reduced-motion media query still collapses it.
  enter: 180,
};

export const ACCENT = {
  soft: 'rgba(88, 166, 255, 0.22)',
  mid: 'rgba(88, 166, 255, 0.45)',
  strong: 'rgba(88, 166, 255, 0.85)',
  glow: 'rgba(56, 128, 255, 0.20)',
};

export const SURFACE_SHADOW = {
  rest: '0 8px 24px rgba(3, 7, 18, 0.28)',
  hover:
    '0 0 0 1px rgba(88, 166, 255, 0.22), 0 20px 48px rgba(3, 7, 18, 0.42), 0 0 18px rgba(56, 128, 255, 0.16)',
  selected:
    '0 0 0 1.5px rgba(88, 166, 255, 0.55), 0 24px 64px rgba(3, 7, 18, 0.50), 0 0 32px rgba(56, 128, 255, 0.30)',
  dragging:
    '0 0 0 2px rgba(88, 166, 255, 0.75), 0 40px 96px rgba(2, 6, 16, 0.62), 0 0 48px rgba(56, 128, 255, 0.42)',
};

export const SURFACE_BORDER = {
  rest: '1px solid rgba(88, 166, 255, 0.20)',
  hover: '1px solid rgba(88, 166, 255, 0.58)',
  selected: '1.5px solid rgba(88, 166, 255, 0.95)',
};

/** Pizarra surface container chrome — compact but readable headers.
 * pizarra-drag-fluidity-2: header bumped 26→30px so the drag target is
 * easier to grab (user feedback: "es muy delicado seleccionar para mover"). */
export const PIZARRA_SURFACE_FRAME_INSET = 6;
export const PIZARRA_SURFACE_HEADER_HEIGHT = 30;
export const PIZARRA_SURFACE_BORDER_RADIUS = 12;

export const PIZARRA_SURFACE_HEADER_STYLE = {
  background: 'rgba(7, 17, 28, 0.97)',
  borderBottom: '1px solid rgba(88, 166, 255, 0.14)',
  color: '#d6e2ff',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

export const PIZARRA_SURFACE_FRAME_BG = 'rgba(6, 12, 22, 0.94)';

/**
 * Resize handle sizing. Hit areas are sized generously (and inverse-scaled
 * with zoom) so resize is easy to target via cursor change even without
 * strong permanent visuals. We keep the hit areas large for usability
 * ("puedo seleccionarla mucho mas facil") while the visual chrome on the
 * inner frame (selected state) + cursor provide the cues. No permanent
 * edge rails or corner cuadritos by default (aesthetics).
 */
const HANDLE_BASE = {
  edge: 28, // edge hit strip thickness — forgiving target
  corner: 38, // corner hit square side
  inset: 18, // gap from the corner where edge strips start
};

export function resolveHandleSizing(zoom = 1) {
  const z = zoom > 0 ? zoom : 1;
  // Keep handles grabbable when zoomed out (z < 1 → bigger), and avoid them
  // ballooning when zoomed in (clamp the scale factor).
  const scale = Math.min(Math.max(1 / z, 1), 2.4);
  return {
    edge: Math.round(HANDLE_BASE.edge * scale),
    corner: Math.round(HANDLE_BASE.corner * scale),
    inset: Math.round(HANDLE_BASE.inset * scale),
  };
}

/**
 * Build the transition string used by the inner chrome frame. Intentionally
 * excludes `left`/`top`/`width`/`height` so dragging/resizing (which mutate
 * geometry directly) is never delayed by a transition.
 */
export const FRAME_TRANSITION = `box-shadow ${DUR.base}ms ${EASE_SOFT}, border-color ${DUR.base}ms ${EASE_SOFT}, transform ${DUR.fast}ms ${EASE_OUT}`;

/**
 * Resolve the chrome frame visual state from interaction flags.
 * Returns the border, boxShadow and transform to apply to the inner frame.
 *
 * @param {{ selected?: boolean, hovered?: boolean, dragging?: boolean }} state
 */
export function resolveFrameVisual({ selected = false, hovered = false, dragging = false } = {}) {
  if (dragging) {
    return {
      border: SURFACE_BORDER.selected,
      boxShadow: SURFACE_SHADOW.dragging,
      // Clear "pick up" lift so the drag reads as a deliberate, animated
      // gesture. Safe because the native surface is suspended during drag and
      // the positioned wrapper itself is never transformed — only this inner
      // chrome frame. (Consumers that ban transforms, e.g. the browser
      // surface, simply don't apply this value.)
      transform: 'translateY(-4px) scale(1.015)',
    };
  }
  if (selected) {
    return {
      border: SURFACE_BORDER.selected,
      boxShadow: SURFACE_SHADOW.selected,
      transform: 'none',
    };
  }
  if (hovered) {
    return {
      border: SURFACE_BORDER.hover,
      boxShadow: SURFACE_SHADOW.hover,
      transform: 'none',
    };
  }
  return {
    border: SURFACE_BORDER.rest,
    boxShadow: SURFACE_SHADOW.rest,
    transform: 'none',
  };
}

const ENTER_ANIMATION_NAME = 'pizarraSurfaceEnter';
const KEYFRAMES_STYLE_ID = 'pizarra-surface-motion-keyframes';

/**
 * Inject the shared enter keyframes once per document. Idempotent and SSR-safe.
 */
export function ensureSurfaceMotionKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_STYLE_ID;
  style.textContent = `
@keyframes ${ENTER_ANIMATION_NAME} {
  0%   { opacity: 0; transform: translateY(18px) scale(0.92); }
  60%  { opacity: 1; transform: translateY(-2px) scale(1.008); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes pizarraSurfaceEnterOpacity {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes ${ENTER_ANIMATION_NAME} {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes pizarraSurfaceEnterOpacity {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
}`;
  document.head.appendChild(style);
}

export const SURFACE_ENTER_ANIMATION = `${ENTER_ANIMATION_NAME} ${DUR.enter}ms ${EASE_OUT} both`;
// Safe variant for live surfaces that host native overlays (browser, terminal).
// Only opacity — never transform — so the positioned wrapper never moves relative
// to the IPC-placed native content rect. Applied once at LiveSurfaceItem wrapper mount.
export const SURFACE_ENTER_OPACITY_ONLY = `pizarraSurfaceEnterOpacity ${DUR.enter}ms ${EASE_OUT} both`;

/**
 * MOTION_DRIVER — single source of truth for the animation
 * library that drives the workspace↔pizarra mode transition
 * (see useModeTransition.js). The spec (pizarra-mode-transition)
 * requires that exactly one of GSAP or framer-motion is used.
 * The codebase already uses framer-motion (^12.38.0) for
 * `WorkspaceSidebar`, `TerminalTabsManager`, `CommandBar`, and
 * `PizarraElement`, so this is set to `'framer-motion'`.
 */
export const MOTION_DRIVER = 'framer-motion';
