/**
 * ModeTransitionShell — workspace↔pizarra mode transition shell.
 *
 * Phase 6 of pizarra-shared-view-state. The shell consumes
 * `useModeTransition` and renders its children inside an
 * `AnimatePresence` keyed on `maximizedView`. It blocks pointer
 * events while the transition is active.
 *
 * Contract (this file pins):
 *   1. Renders a wrapping div with `data-transition-phase` set
 *      to the current phase ('idle' | 'leaving' | 'entering').
 *   2. When the phase is 'leaving' or 'entering', the wrapping
 *      div has `pointer-events: none` (and a data-transition-
 *      active="true" attribute).
 *   3. When the phase is 'idle', the wrapping div has
 *      `pointer-events: auto` (and data-transition-active="false").
 *   4. On `maximizedView` change, the shell enters the leaving
 *      phase, then entering, then idle, with the data attribute
 *      reflecting the current phase.
 *   5. The shell does NOT unmount its children when the
 *      maximizedView changes; a single stable motion layer
 *      animates opacity without AnimatePresence remount (blank-
 *      pizarra hardening).
 */

const React = require('react');
const { render, act } = require('@testing-library/react');

const domHarness = require('@/test-support/domHarness');

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
    } catch (e) {
      // ignore
    }
  }
});

const { ModeTransitionShell } = require('../ModeTransitionShell');

function makeRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = require('react-dom/client').createRoot(container);
  return { container, root };
}

function Probe({ view }) {
  return React.createElement(
    ModeTransitionShell,
    {
      maximizedView: view,
      testId: 'shell',
    },
    React.createElement('div', { 'data-testid': `child-${view}` }, `child for ${view}`)
  );
}

describe('ModeTransitionShell — idle state', () => {
  test('renders with phase=idle, data-transition-active=false, pointer-events auto', () => {
    jest.useFakeTimers('modern');
    try {
      const { container, root } = makeRoot();
      act(() => {
        root.render(React.createElement(Probe, { view: 'workspace' }));
      });
      const shell = document.querySelector('[data-testid="shell"]');
      expect(shell).toBeTruthy();
      expect(shell.getAttribute('data-transition-phase')).toBe('idle');
      expect(shell.getAttribute('data-transition-active')).toBe('false');
      expect(shell.style.pointerEvents).toBe('auto');
      expect(shell.style.display).toBe('grid');
      expect(shell.style.isolation).toBe('isolate');
      // The child for the current view must be in the DOM.
      expect(document.querySelector('[data-testid="child-workspace"]')).toBeTruthy();
      const layer = document.querySelector('[data-testid="mode-transition-layer-workspace"]');
      expect(layer.style.gridArea).toBe('1 / 1');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ModeTransitionShell — pointer-events guard', () => {
  test('during leaving/entering, pointer-events is none; at idle, auto', () => {
    jest.useFakeTimers('modern');
    try {
      const { container, root } = makeRoot();
      let probe;
      function Wrapper() {
        return React.createElement(Probe, { view: 'workspace' });
      }
      function SwitchingWrapper({ view }) {
        return React.createElement(Probe, { view });
      }
      let setView;
      function Stateful() {
        const [view, set] = React.useState('workspace');
        setView = set;
        return React.createElement(Probe, { view });
      }

      act(() => {
        root.render(React.createElement(Stateful));
      });
      const shell = document.querySelector('[data-testid="shell"]');
      expect(shell.style.pointerEvents).toBe('auto');

      act(() => {
        setView('pizarra');
      });
      // debounceMs default is 0 — leaving starts immediately.
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(shell.getAttribute('data-transition-phase')).toBe('leaving');
      expect(shell.getAttribute('data-transition-active')).toBe('true');
      expect(shell.style.pointerEvents).toBe('none');

      // Past leaving — entering — still pointer-events none.
      act(() => {
        jest.advanceTimersByTime(110);
      });
      expect(shell.getAttribute('data-transition-phase')).toBe('entering');
      expect(shell.style.pointerEvents).toBe('none');

      // Past entering — idle — pointer-events back to auto.
      act(() => {
        jest.advanceTimersByTime(220);
      });
      expect(shell.getAttribute('data-transition-phase')).toBe('idle');
      expect(shell.style.pointerEvents).toBe('auto');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ModeTransitionShell — does not unmount children during transition', () => {
  test('phase transitions idle → leaving → entering → idle on maximizedView change', () => {
    jest.useFakeTimers('modern');
    try {
      let setView;
      function Stateful() {
        const [view, set] = React.useState('workspace');
        setView = set;
        return React.createElement(Probe, { view });
      }
      const { container, root } = makeRoot();
      act(() => {
        root.render(React.createElement(Stateful));
      });
      const shell = document.querySelector('[data-testid="shell"]');
      expect(shell.getAttribute('data-transition-phase')).toBe('idle');

      act(() => {
        setView('pizarra');
      });
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(shell.getAttribute('data-transition-phase')).toBe('leaving');

      // Past leaving.
      act(() => {
        jest.advanceTimersByTime(110);
      });
      expect(shell.getAttribute('data-transition-phase')).toBe('entering');

      // Past entering.
      act(() => {
        jest.advanceTimersByTime(220);
      });
      expect(shell.getAttribute('data-transition-phase')).toBe('idle');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ModeTransitionShell — reduced motion', () => {
  test('full transition completes in <= 50ms when prefers-reduced-motion is set', () => {
    jest.useFakeTimers('modern');
    const orig = dom.window.matchMedia;
    dom.window.matchMedia = (q) => ({
      matches: /prefers-reduced-motion/.test(q),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    try {
      let setView;
      function Stateful() {
        const [view, set] = React.useState('workspace');
        setView = set;
        return React.createElement(Probe, { view });
      }
      const { container, root } = makeRoot();
      act(() => {
        root.render(React.createElement(Stateful));
      });
      act(() => {
        setView('pizarra');
      });
      // debounceMs=0; reduced-motion total <= 50ms after flip.
      act(() => {
        jest.advanceTimersByTime(55);
      });
      // <= 50ms should have completed.
      act(() => {
        jest.advanceTimersByTime(250);
      });
      const shell = document.querySelector('[data-testid="shell"]');
      expect(shell.getAttribute('data-transition-phase')).toBe('idle');
      expect(shell.style.pointerEvents).toBe('auto');
    } finally {
      dom.window.matchMedia = orig;
      jest.useRealTimers();
    }
  });
});
