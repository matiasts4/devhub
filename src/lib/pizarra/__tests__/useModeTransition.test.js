/**
 * useModeTransition — workspace↔pizarra mode transition orchestrator.
 *
 * Phase 6 of pizarra-shared-view-state (see design.md §7).
 *
 * Contract (this file pins):
 *   1. Returns `{ phase, progress, isAnimating, animProps }`.
 *      - `phase`: 'idle' | 'leaving' | 'entering'
 *      - `progress`: number in [0, 1]
 *      - `isAnimating`: boolean
 *      - `animProps`: motion props suitable for framer-motion's
 *        `motion.div` initial / animate / transition.
 *   2. At steady state (maximizedView unchanged), phase is 'idle'
 *      and progress is 0.
 *   3. On maximizedView change:
 *      a. After a `debounceMs` window (default 0 ms), the hook
 *         flips to `phase: 'leaving'`.
 *      b. `progress` animates from 0 to 1 over `leaveMs`
 *         (default 40 ms since pizarra-instant-enter A4).
 *      c. On leaving completion, `phase` flips to 'entering'.
 *      d. `progress` animates from 0 to 1 over `enterMs`
 *         (default 110 ms since pizarra-instant-enter A4).
 *      e. On entering completion, `phase` returns to 'idle' and
 *         `progress` returns to 0.
 *   4. Total transition time is debounce + leave + enter
 *      (0 + 40 + 110 = 150 ms by default).
 *   5. Rapid toggles within the debounce window collapse to a
 *      single coherent transition (only the latest maximizedView
 *      value is applied). Toggles DURING leaving/entering cancel
 *      the in-flight transition and start a new one.
 *   6. When `prefers-reduced-motion: reduce` is active, the
 *      transition collapses to a single cross-fade that completes
 *      in <= 50 ms total.
 *   7. The hook reads easings from `surfaceMotion.js` tokens
 *      (`EASE_OUT`) and still exposes them via `motionTokens`;
 *      the default phase durations are explicit shell-chrome
 *      constants (pizarra-instant-enter A4), not token-derived.
 *   8. `MOTION_DRIVER` is exported from `surfaceMotion.js` and
 *      equals 'framer-motion'.
 */

const { act, renderHook } = require('@testing-library/react');

const domHarness = require('@/test-support/domHarness');
const surfaceMotion = require('../surfaceMotion');

let dom;
let mountedRoots = [];

beforeEach(() => {
  mountedRoots = [];
  dom = domHarness.installDom();
});

afterEach(() => {
  domHarness.cleanupMountedRoots(mountedRoots);
  if (dom && dom.window && dom.window.close) {
    try {
      dom.window.close();
    } catch {
      // ignore
    }
  }
});

// Lazy-require the hook so each test gets a fresh module cache
// (and a fresh internal timer set).
function getHook() {
  delete require.cache[require.resolve('../useModeTransition')];
  return require('../useModeTransition');
}

function advance(ms) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function withReducedMotionStub() {
  // Stub BEFORE the hook reads it.
  const orig = dom.window.matchMedia;
  dom.window.matchMedia = (q) => ({
    matches: /prefers-reduced-motion/.test(q),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  return () => {
    dom.window.matchMedia = orig;
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('surfaceMotion — MOTION_DRIVER', () => {
  test('exports MOTION_DRIVER === "framer-motion"', () => {
    expect(surfaceMotion.MOTION_DRIVER).toBe('framer-motion');
  });

  test('exports EASE_OUT and DUR tokens used by the hook', () => {
    expect(typeof surfaceMotion.EASE_OUT).toBe('string');
    expect(typeof surfaceMotion.DUR).toBe('object');
    expect(typeof surfaceMotion.DUR.base).toBe('number');
    expect(typeof surfaceMotion.DUR.enter).toBe('number');
  });
});

describe('useModeTransition — idle steady state', () => {
  test('returns phase=idle, progress=0 when maximizedView is unchanged', () => {
    jest.useFakeTimers('modern');
    try {
      const { useModeTransition } = getHook();
      const { result } = renderHook(() => useModeTransition({ maximizedView: 'workspace' }));
      expect(result.current.phase).toBe('idle');
      expect(result.current.progress).toBe(0);
      expect(result.current.isAnimating).toBe(false);
      expect(result.current.animProps).toBeDefined();
      expect(result.current.animProps.transition).toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  });

  test('stays idle across multiple renders with the same maximizedView', () => {
    jest.useFakeTimers('modern');
    try {
      const { useModeTransition } = getHook();
      const { result, rerender } = renderHook(
        ({ view }) => useModeTransition({ maximizedView: view }),
        { initialProps: { view: 'workspace' } }
      );
      expect(result.current.phase).toBe('idle');
      rerender({ view: 'workspace' });
      rerender({ view: 'workspace' });
      advance(2000);
      expect(result.current.phase).toBe('idle');
      expect(result.current.progress).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useModeTransition — debounce + phase machine', () => {
  test('changing maximizedView enters leaving after the debounce window', () => {
    jest.useFakeTimers('modern');
    try {
      const { useModeTransition } = getHook();
      const { result, rerender } = renderHook(
        ({ view }) => useModeTransition({ maximizedView: view, debounceMs: 200 }),
        { initialProps: { view: 'workspace' } }
      );
      expect(result.current.phase).toBe('idle');

      rerender({ view: 'pizarra' });
      // Within the debounce window (200ms), still idle.
      advance(150);
      expect(result.current.phase).toBe('idle');

      // Past the debounce: phase flips to leaving.
      advance(60);
      expect(result.current.phase).toBe('leaving');
    } finally {
      jest.useRealTimers();
    }
  });

  test('progress during leaving is in (0, 1]', () => {
    jest.useFakeTimers('modern');
    try {
      const { useModeTransition } = getHook();
      const { result, rerender } = renderHook(
        ({ view }) => useModeTransition({ maximizedView: view, debounceMs: 0 }),
        { initialProps: { view: 'workspace' } }
      );
      rerender({ view: 'pizarra' });
      advance(5); // past debounce=0
      expect(result.current.phase).toBe('leaving');

      advance(20); // halfway through 40ms leaving
      expect(result.current.phase).toBe('leaving');
      expect(result.current.progress).toBeGreaterThan(0);
      expect(result.current.progress).toBeLessThanOrEqual(1);

      advance(25); // past leaving (40ms total)
      expect(result.current.phase).toBe('entering');
    } finally {
      jest.useRealTimers();
    }
  });

  test('after full transition, returns to idle with progress 0', () => {
    jest.useFakeTimers('modern');
    try {
      const { useModeTransition } = getHook();
      const { result, rerender } = renderHook(
        ({ view }) => useModeTransition({ maximizedView: view, debounceMs: 0 }),
        { initialProps: { view: 'workspace' } }
      );
      rerender({ view: 'pizarra' });
      // 0 debounce + 40 leaving + 110 entering
      advance(5 + 40 + 110 + 5);
      expect(result.current.phase).toBe('idle');
      expect(result.current.progress).toBe(0);
      expect(result.current.isAnimating).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('default transition time is 40ms leaving + 110ms entering = 150ms active', () => {
    jest.useFakeTimers('modern');
    try {
      const { useModeTransition } = getHook();
      const { result, rerender } = renderHook(
        ({ view }) => useModeTransition({ maximizedView: view, debounceMs: 0 }),
        { initialProps: { view: 'workspace' } }
      );
      rerender({ view: 'pizarra' });
      advance(5);
      expect(result.current.phase).toBe('leaving');
      advance(40);
      expect(result.current.phase).toBe('entering');
      advance(110);
      expect(result.current.phase).toBe('idle');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useModeTransition — rapid toggle / cancellation', () => {
  test('three toggles inside the debounce window apply only the last value', () => {
    jest.useFakeTimers('modern');
    try {
      const { useModeTransition } = getHook();
      const { result, rerender } = renderHook(
        ({ view }) => useModeTransition({ maximizedView: view, debounceMs: 200 }),
        { initialProps: { view: 'workspace' } }
      );
      rerender({ view: 'pizarra' });
      advance(50);
      rerender({ view: 'workspace' });
      advance(50);
      rerender({ view: 'pizarra' });
      // Past the debounce window relative to the LAST toggle.
      advance(200);
      // The transition should start fresh toward pizarra.
      expect(result.current.phase).toBe('leaving');
      advance(40);
      expect(result.current.phase).toBe('entering');
    } finally {
      jest.useRealTimers();
    }
  });

  test('toggle during leaving cancels the in-flight transition and restarts', () => {
    jest.useFakeTimers('modern');
    try {
      const { useModeTransition } = getHook();
      const { result, rerender } = renderHook(
        ({ view }) => useModeTransition({ maximizedView: view, debounceMs: 200 }),
        { initialProps: { view: 'workspace' } }
      );
      rerender({ view: 'pizarra' });
      advance(200); // debounce → leaving
      expect(result.current.phase).toBe('leaving');
      advance(20); // halfway through leaving (40ms budget)
      // Toggle back to workspace mid-leaving. The in-flight
      // leaving→entering timer must be cleared and a new
      // debounce must start.
      rerender({ view: 'workspace' });
      // Still in leaving because the new debounce hasn't fired.
      expect(result.current.phase).toBe('leaving');
      // After the new debounce, leaving restarts.
      advance(200);
      expect(result.current.phase).toBe('leaving');
      advance(40);
      expect(result.current.phase).toBe('entering');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useModeTransition — reduced motion', () => {
  test('collapses total transition to <= 50ms when prefers-reduced-motion is set', () => {
    jest.useFakeTimers('modern');
    const restore = withReducedMotionStub();
    try {
      const { useModeTransition } = getHook();
      const { result, rerender } = renderHook(
        ({ view }) => useModeTransition({ maximizedView: view, debounceMs: 0 }),
        { initialProps: { view: 'workspace' } }
      );
      rerender({ view: 'pizarra' });
      // After debounce=0 + <=50ms, phase should be idle again.
      advance(5);
      advance(60);
      expect(result.current.phase).toBe('idle');
    } finally {
      restore();
      jest.useRealTimers();
    }
  });

  test('animProps under reduced motion is opacity-only with very short duration', () => {
    jest.useFakeTimers('modern');
    const restore = withReducedMotionStub();
    try {
      const { useModeTransition } = getHook();
      const { result } = renderHook(() => useModeTransition({ maximizedView: 'workspace' }));
      // The steady-state animProps should be the reduced-motion path
      // (no translateY / scale, very short duration).
      expect(result.current.animProps.initial.opacity).toBe(0);
      expect(result.current.animProps.transition.duration).toBeLessThanOrEqual(0.05);
    } finally {
      restore();
      jest.useRealTimers();
    }
  });
});

describe('useModeTransition — animProps shape', () => {
  test('default animProps are opacity-only (no transform on native-surface wrapper) with a framer-motion transition', () => {
    jest.useFakeTimers('modern');
    try {
      const { useModeTransition } = getHook();
      const { result } = renderHook(() => useModeTransition({ maximizedView: 'workspace' }));
      expect(result.current.animProps.initial).toMatchObject({ opacity: 0 });
      expect(result.current.animProps.animate).toMatchObject({ opacity: 1 });
      expect(result.current.animProps.exit).toMatchObject({ opacity: 0 });
      expect(result.current.animProps.transition).toBeDefined();
      expect(typeof result.current.animProps.transition.duration).toBe('number');
      // terminal-pizarra-stability A.5 / NFR-P02: the shell wraps a tree
      // that contains native VTE/WebKit surfaces. Transforming the wrapper
      // (y / scale) desyncs those IPC-positioned widgets, so the transition
      // MUST stay opacity-only. Guard against a regression that reintroduces
      // translate/scale.
      expect(result.current.animProps.initial).not.toHaveProperty('y');
      expect(result.current.animProps.initial).not.toHaveProperty('scale');
      expect(result.current.animProps.animate).not.toHaveProperty('y');
      expect(result.current.animProps.animate).not.toHaveProperty('scale');
    } finally {
      jest.useRealTimers();
    }
  });

  test('transition duration is a sane positive number', () => {
    jest.useFakeTimers('modern');
    try {
      const { useModeTransition } = getHook();
      const { result } = renderHook(() => useModeTransition({ maximizedView: 'workspace' }));
      expect(result.current.animProps.transition.duration).toBeGreaterThan(0);
      expect(result.current.animProps.transition.duration).toBeLessThanOrEqual(1);
      // pizarra-instant-enter A4: the shell phase budget is now explicit
      // (40 leave + 110 enter), no longer DUR.base-derived.
      expect(result.current.animProps.transition.duration).toBe(0.11);
      expect(result.current.durations.enterMs).toBe(110);
      expect(result.current.durations.leaveMs).toBe(40);
    } finally {
      jest.useRealTimers();
    }
  });

  test('overrides: leaveMs/enterMs propagate into the leaving/entering durations', () => {
    jest.useFakeTimers('modern');
    try {
      const { useModeTransition } = getHook();
      const { result, rerender } = renderHook(
        ({ view, leaveMs, enterMs }) =>
          useModeTransition({ maximizedView: view, leaveMs, enterMs, debounceMs: 0 }),
        { initialProps: { view: 'workspace', leaveMs: 50, enterMs: 100 } }
      );
      rerender({ view: 'pizarra', leaveMs: 50, enterMs: 100 });
      advance(5); // past debounce=0
      expect(result.current.phase).toBe('leaving');
      advance(55);
      expect(result.current.phase).toBe('entering');
      advance(105);
      expect(result.current.phase).toBe('idle');
    } finally {
      jest.useRealTimers();
    }
  });
});
