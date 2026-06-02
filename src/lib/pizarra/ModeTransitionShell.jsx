/**
 * ModeTransitionShell — framer-motion-backed orchestrator for the
 * workspace↔pizarra mode toggle (Phase 6 of pizarra-shared-view-state).
 *
 * Consumes `useModeTransition(maximizedView)` and renders its
 * children inside an `AnimatePresence` keyed on `maximizedView`.
 * Each child receives a `data-transition-phase` attribute and
 * `pointer-events: none` while the transition is animating, so
 * users can't click on a half-faded-in chrome.
 *
 * The shell does NOT mount/unmount surfaces; it only animates
 * chrome. Surfaces live in the SharedSurfacesProvider's hidden
 * layer (see Phase 4) and are projected into both hosts via
 * SurfacePortal (see Phase 4). The transition is a purely visual
 * concern; the underlying React tree of terminals and browser
 * surfaces is untouched.
 *
 * Usage:
 *   <ModeTransitionShell maximizedView={maximizedView} reducedMotion={reducedMotion}>
 *     {maximizedView === 'pizarra' ? <PizarraCanvas /> : <WorkspaceChrome />}
 *   </ModeTransitionShell>
 *
 * The shell is intentionally tiny so it can be dropped into any
 * chrome tree without disturbing the existing layout. The
 * `useModeTransition` hook does all the timing work; the shell
 * just wires the result to framer-motion's `motion.div` and the
 * pointer-events guard.
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useModeTransition } from './useModeTransition';

export function ModeTransitionShell({
  maximizedView,
  reducedMotion,
  children,
  className,
  style,
  testId,
}) {
  // `reducedMotion` is optional. When provided, the wiring point
  // owns the OS preference read (so it can SSR-fallback safely
  // before window is available) and the hook consumes the value
  // directly. When undefined, the hook re-reads window.matchMedia
  // on every render — see useModeTransition for the rationale.
  const { phase, isAnimating, animProps } = useModeTransition({ maximizedView, reducedMotion });

  return (
    <div
      data-testid={testId || 'mode-transition-shell'}
      data-transition-phase={phase}
      data-transition-active={isAnimating ? 'true' : 'false'}
      className={className}
      style={{
        // Block pointer events while the chrome is animating so
        // the user can't click on a half-faded-in control.
        pointerEvents: isAnimating ? 'none' : 'auto',
        ...style,
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={maximizedView}
          data-testid={`mode-transition-layer-${maximizedView}`}
          initial={animProps.initial}
          animate={animProps.animate}
          exit={animProps.initial}
          transition={animProps.transition}
          style={{ width: '100%', height: '100%' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default ModeTransitionShell;
