/**
 * usePizarraModeTransition — deferred workspace↔pizarra toggle.
 *
 * The dock state must NOT swap on click. Instead:
 *   1. leaving  — opaque scrim fades IN over the current view
 *   2. commit   — caller applies dock state (layout + pizarra mount)
 *   3. entering — scrim fades OUT revealing the new view
 *
 * Content stays at full opacity throughout; only the scrim moves.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MODE_TRANSITION } from '@/components/ui/system/motion-tokens';

const REDUCED_MOTION_TOTAL_MS = 50;
const PROGRESS_TICK_MS = 16;

function easeInOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Scrim opacity: 0 at rest, 1 while covered, never fades content to 0.
 */
export function resolveModeTransitionScrimOpacity(phase, progress, reducedMotion = false) {
  if (reducedMotion) return 0;
  const eased = easeInOutCubic(progress);
  if (phase === 'leaving') return eased;
  if (phase === 'entering') return 1 - eased;
  return 0;
}

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

export function usePizarraModeTransition({
  leaveMs = MODE_TRANSITION.leaveMs,
  enterMs = MODE_TRANSITION.enterMs,
  reducedMotion: reducedMotionProp,
} = {}) {
  const reducedMotion =
    typeof reducedMotionProp === 'boolean' ? reducedMotionProp : detectReducedMotion();

  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const phaseStartRef = useRef(0);
  const activeDurationRef = useRef(0);
  const progressIntervalRef = useRef(null);
  const timersRef = useRef([]);
  const runningRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (phase === 'idle') {
      setProgress(0);
      return undefined;
    }
    const tick = () => {
      const elapsed = Date.now() - phaseStartRef.current;
      const duration = activeDurationRef.current || 1;
      setProgress(Math.min(1, Math.max(0, elapsed / duration)));
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

  useEffect(() => () => clearTimers(), [clearTimers]);

  const runTransition = useCallback(
    (commitFn) => {
      if (runningRef.current) return Promise.resolve(false);
      runningRef.current = true;
      clearTimers();

      return new Promise((resolve) => {
        const finish = () => {
          runningRef.current = false;
          resolve(true);
        };

        if (reducedMotion) {
          try {
            commitFn?.();
          } catch {
            // commit errors are surfaced by the caller
          }
          setPhase('idle');
          setProgress(0);
          finish();
          return;
        }

        activeDurationRef.current = leaveMs;
        phaseStartRef.current = Date.now();
        setPhase('leaving');
        setProgress(0);

        const afterLeave = setTimeout(() => {
          try {
            commitFn?.();
          } catch {
            finish();
            return;
          }

          activeDurationRef.current = enterMs;
          phaseStartRef.current = Date.now();
          setPhase('entering');
          setProgress(0);

          const afterEnter = setTimeout(() => {
            setPhase('idle');
            setProgress(0);
            finish();
          }, enterMs);
          timersRef.current.push(afterEnter);
        }, leaveMs);
        timersRef.current.push(afterLeave);
      });
    },
    [clearTimers, enterMs, leaveMs, reducedMotion]
  );

  const scrimOpacity = resolveModeTransitionScrimOpacity(phase, progress, reducedMotion);

  return {
    phase,
    progress,
    scrimOpacity,
    isTransitioning: phase !== 'idle',
    runTransition,
    reducedMotion,
    durations: { leaveMs, enterMs },
  };
}

export default usePizarraModeTransition;