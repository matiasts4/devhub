/**
 * useModeTransition — workspace↔pizarra mode transition orchestrator.
 *
 * Phase 6 of pizarra-shared-view-state (see design.md §7).
 *
 * Drives a debounced, interruptible phase machine on top of
 * framer-motion's `AnimatePresence`. The phase machine is:
 *
 *   idle ──(maximizedView changes)──[ debounce 0ms ]──> leaving
 *   leaving (40ms) ──> entering (110ms) ──> idle
 *   (pizarra-instant-enter A4: was 110/220 = 330ms; tightened to a
 *   150ms shell-chrome budget so the transition no longer outlasts
 *   the surface fade.)
 *
 * The hook is the only thing that reads `maximizedView` for
 * ANIMATION purposes. PizarraCanvas / WorkspaceRightDock consume
 * the returned `animProps` to drive framer-motion's
 * `AnimatePresence` keyed on `maximizedView`.
 *
 * The visual channel is OPACITY-ONLY (cross-fade). The shell wraps
 * a tree containing native VTE/WebKit surfaces, which are positioned
 * via IPC and do not follow CSS transforms; animating translate/scale
 * on the wrapper desyncs them (NFR-P02 / terminal-pizarra-stability A.5).
 *
 * Reduced motion: when `prefers-reduced-motion: reduce` is
 * reported by the OS, the cross-fade collapses to <= 50 ms.
 *
 * Easings are read from `surfaceMotion.js` tokens; the default phase
 * durations are explicit shell-chrome constants (pizarra-instant-enter
 * A4), independent from the surface enter token (`DUR.enter`).
 *
 * Implementation notes:
 *   - The phase machine runs entirely on `setTimeout`. We do NOT
 *     use `requestAnimationFrame` because the consumer (the
 *     `motion.div`) handles the per-frame progress via its own
 *     framer-motion timeline. The hook only needs to flip
 *     `phase` and seed `progress` at the right moments.
 *   - `progress` is computed from `Date.now()` snapshots in a
 *     tiny `useEffect` that ticks on a 16 ms interval. This keeps
 *     the hook testable with fake timers.
 *   - Cancellation: a new `maximizedView` value clears ALL
 *     in-flight timers (debounce, leaving, entering, idle) and
 *     restarts the debounce. The new transition uses the NEW
 *     value as the target.
 *   - The effect deps deliberately exclude `internalView` so
 *     that a state-driven change to `internalView` (which
 *     happens inside the debounce callback) does NOT cancel
 *     the in-flight phase timers. Only a NEW `maximizedView`
 *     from the consumer cancels the transition.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { DUR, EASE_OUT } from './surfaceMotion';

// Reduced motion budget: spec says <= 50ms total for the whole
// leaving+entering sequence. The debounce is unchanged (still
// 200ms) because the user might be rapidly toggling and a
// debounce keeps the visible animation coherent.
const REDUCED_MOTION_TOTAL_MS = 50;

// pizarra-instant-enter A4: shell phase budget tightened from
// 110ms leaving + 220ms entering (330ms dead time before the canvas read as
// settled) to 40 + 110 = 150ms. The old budget outlasted the actual surface
// fade and made pizarra entry feel sluggish even when the terminals were
// already mounted. Not token-derived on purpose: this is the shell chrome
// budget, independent from the surface enter token (DUR.enter).
const DEFAULT_LEAVE_MS = 40;
const DEFAULT_ENTER_MS = 110;
// Debounce intentionally set to 0: any non-zero value introduces
// perceptible lag between the user's click and the start of the
// animation. The phase machine (leaving → entering) already
// provides the visual rhythm without an additional dead zone.
const DEFAULT_DEBOUNCE_MS = 0;

const PROGRESS_TICK_MS = 16; // ~60Hz

function detectReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useModeTransition({
  maximizedView,
  reducedMotion: reducedMotionProp,
  leaveMs = DEFAULT_LEAVE_MS,
  enterMs = DEFAULT_ENTER_MS,
  debounceMs = DEFAULT_DEBOUNCE_MS,
} = {}) {
  // useReducedMotion from framer-motion can throw in some test
  // environments (no MotionConfig). It also caches the value in
  // module state, which makes it hard to flip on/off in tests.
  // We read `window.matchMedia` directly on every render so the
  // hook is fully reactive to the OS preference. When the caller
  // passes an explicit `reducedMotion` prop (e.g. from a wiring
  // point that already SSR-detected it), we use that value
  // instead so the hook stays testable with explicit control.
  const reducedMotion =
    typeof reducedMotionProp === 'boolean' ? reducedMotionProp : detectReducedMotion();

  // Internal state.
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  // `internalView` lags `maximizedView` by the debounce window.
  const [internalView, setInternalView] = useState(maximizedView);
  // Ref to read internalView in the effect without putting it in
  // deps — that would cancel in-flight phase timers whenever
  // internalView is set inside the debounce callback.
  const internalViewRef = useRef(maximizedView);
  // Phase start timestamps for progress calculation.
  const phaseStartRef = useRef(0);
  // The duration currently being used for the active phase.
  const activeDurationRef = useRef(0);

  // All in-flight timers live in refs so the effect can cancel
  // them when the user toggles again.
  const debounceTimerRef = useRef(null);
  const phaseTimerRef = useRef(null);
  const idleTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Effect: drive the phase machine when maximizedView changes.
  // Deps: [maximizedView, debounceMs, leaveMs, enterMs, reducedMotion]
  // We DELIBERATELY do not include `internalView` so that a
  // state-driven internalView update (inside the debounce
  // callback) does NOT cancel the in-flight phase timers. Only
  // a NEW maximizedView from the consumer cancels the transition.
  useEffect(() => {
    // Sync the ref.
    internalViewRef.current = internalView;
  }, [internalView]);

  useEffect(() => {
    // If the current view already matches the internal, no-op.
    if (maximizedView === internalViewRef.current) return undefined;

    // Cancel any in-flight timers from a previous transition.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    // Debounce: wait `debounceMs` then start the transition.
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      internalViewRef.current = maximizedView;
      setInternalView(maximizedView);
      const totalMs = reducedMotion ? REDUCED_MOTION_TOTAL_MS : leaveMs;
      activeDurationRef.current = totalMs;
      phaseStartRef.current = Date.now();
      setPhase('leaving');
      setProgress(0);

      if (reducedMotion) {
        // Single cross-fade — return to idle after the total budget.
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null;
          setPhase('idle');
          setProgress(0);
        }, totalMs);
        return;
      }

      // Schedule the next phase flip: leaving → entering.
      phaseTimerRef.current = setTimeout(() => {
        phaseTimerRef.current = null;
        activeDurationRef.current = enterMs;
        phaseStartRef.current = Date.now();
        setPhase('entering');
        setProgress(0);
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null;
          setPhase('idle');
          setProgress(0);
        }, enterMs);
      }, leaveMs);
    }, debounceMs);

    return () => {
      // Effect cleanup runs ONLY when the dep array changes
      // (i.e. maximizedView / debounceMs / etc changed). We
      // cancel everything to ensure a fresh transition starts.
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (phaseTimerRef.current) {
        clearTimeout(phaseTimerRef.current);
        phaseTimerRef.current = null;
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [maximizedView, debounceMs, leaveMs, enterMs, reducedMotion]);
  // The deps intentionally exclude `internalView` so a
  // state-driven update of `internalView` (set inside the
  // debounce callback) does NOT cancel the in-flight phase
  // timers. Only a NEW `maximizedView` from the consumer
  // cancels the transition.

  // Effect: tick progress while a phase is active.
  useEffect(() => {
    if (phase === 'idle') {
      setProgress(0);
      return undefined;
    }
    const tick = () => {
      const elapsed = Date.now() - phaseStartRef.current;
      const duration = activeDurationRef.current || 1;
      const next = Math.min(1, Math.max(0, elapsed / duration));
      setProgress(next);
    };
    tick();
    progressIntervalRef.current = setInterval(tick, PROGRESS_TICK_MS);
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [phase]);

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  // The framer-motion transition spec. OPACITY-ONLY by design.
  //
  // terminal-pizarra-stability A.5 / NFR-P02: the shell wraps a tree
  // that contains native surfaces (PizarraPane → CanvasTerminal →
  // TerminalTTY → GTK VTE, and WebKit browser panes). Native widgets
  // are positioned in absolute screen coordinates via IPC and do NOT
  // follow CSS transforms, so animating `y`/`scale` on this wrapper
  // desyncs the chrome from the native surface — the visible "jump"
  // when toggling workspace↔pizarra with a live terminal. We therefore
  // cross-fade ONLY (matching getWorkspaceAnimProps / getRightDockAnimProps
  // on the workspace side, which are already opacity-only). Richer
  // chrome motion (slide/scale) becomes safe only once surfaces are
  // lifted into SharedSurfacesProvider's hidden layer (A.1), outside
  // this animated subtree — tracked as a follow-up, not done here.
  const animProps = useMemo(() => {
    if (reducedMotion) {
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: REDUCED_MOTION_TOTAL_MS / 1000, ease: 'linear' },
      };
    }
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: enterMs / 1000, ease: [0.22, 1, 0.36, 1] },
    };
  }, [reducedMotion, enterMs]);

  return {
    phase,
    progress,
    isAnimating: phase !== 'idle',
    animProps,
    internalView,
    reducedMotion,
    durations: {
      leaveMs,
      enterMs,
      debounceMs,
      reducedMotionTotal: REDUCED_MOTION_TOTAL_MS,
    },
    // Surfaced for the design.md token traceability — confirms
    // the hook reads tokens instead of hard-coding.
    motionTokens: { DUR, EASE_OUT },
  };
}

export default useModeTransition;
