/**
 * ModeTransitionShell — framer-motion-backed orchestrator for the
 * workspace↔pizarra mode toggle (Phase 6 of pizarra-shared-view-state).
 *
 * Consumes `useModeTransition(maximizedView)` and renders its
 * children inside a single stable motion layer (no remount on mode
 * change). Each shell receives a `data-transition-phase` attribute and
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
 * Important (blank-pizarra fix): we deliberately do NOT key the
 * motion layer on `maximizedView`. AnimatePresence + key remounted
 * the entire dock body (including PizarraPane) on every toggle,
 * starting at opacity 0. If the enter animation was interrupted or
 * delayed, users saw a persistent black content area until restart.
 * Opacity is forced to 1 whenever the phase machine is idle so a
 * stuck fade can never leave the shell invisible.
 *
 * Usage:
 *   <ModeTransitionShell maximizedView={maximizedView} reducedMotion={reducedMotion}>
 *     {maximizedView === 'pizarra' ? <PizarraCanvas /> : <WorkspaceChrome />}
 *   </ModeTransitionShell>
 */

'use client';

import { motion } from 'framer-motion';
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

  // During leaving, dip slightly for a soft handoff; never hit 0 so a
  // cancelled animation cannot blank the dock. Idle/entering → full opacity.
  const targetOpacity = phase === 'leaving' ? 0.92 : 1;

  return (
    <div
      data-testid={testId || 'mode-transition-shell'}
      data-transition-phase={phase}
      data-transition-active={isAnimating ? 'true' : 'false'}
      data-maximized-view={maximizedView}
      className={className}
      style={{
        display: 'grid',
        minHeight: 0,
        isolation: 'isolate',
        // Block pointer events while the chrome is animating so
        // the user can't click on a half-faded-in control.
        pointerEvents: isAnimating ? 'none' : 'auto',
        ...style,
      }}
    >
      <motion.div
        data-testid={`mode-transition-layer-${maximizedView}`}
        data-mode-transition-layer="true"
        initial={false}
        animate={{ opacity: targetOpacity }}
        transition={isAnimating ? animProps.transition : { duration: 0 }}
        style={{
          gridArea: '1 / 1',
          width: '100%',
          height: '100%',
          minHeight: 0,
          // Hard floor: idle must never leave residual opacity 0 from a
          // previous interrupted transition (framer-motion can stick).
          opacity: isAnimating ? undefined : 1,
          willChange: isAnimating ? 'opacity' : 'auto',
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export default ModeTransitionShell;
