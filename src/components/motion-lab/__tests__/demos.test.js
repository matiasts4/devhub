'use strict';

const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react');
const { JSDOM } = require('jsdom');

let reducedMotionValue = false;

function setReducedMotion(value) {
  reducedMotionValue = value;
}

jest.doMock('framer-motion', () => {
  const React = require('react');

  const MotionDiv = React.forwardRef(function MotionDiv(props, ref) {
    const {
      transition,
      initial,
      animate: animateProp,
      exit,
      custom: _custom,
      variants: _variants,
      onDragEnd,
      drag: _drag,
      dragConstraints: _dragConstraints,
      dragMomentum: _dragMomentum,
      children,
      style,
      ...rest
    } = props;

    const setRef = React.useCallback(
      (node) => {
        if (node) {
          node.__framerMotionDragEnd = onDragEnd || null;
        }
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [onDragEnd, ref]
    );

    return React.createElement(
      'div',
      {
        ref: setRef,
        'data-testid': 'motion-div',
        'data-transition': transition ? JSON.stringify(transition) : undefined,
        'data-initial': initial !== undefined ? JSON.stringify(initial) : undefined,
        'data-animate': animateProp !== undefined ? JSON.stringify(animateProp) : undefined,
        'data-exit': exit !== undefined ? JSON.stringify(exit) : undefined,
        'data-has-ondragend': onDragEnd ? 'true' : 'false',
        style,
        ...rest,
      },
      children
    );
  });

  return {
    motion: { div: MotionDiv },
    AnimatePresence: function AnimatePresence({ children }) {
      return React.createElement(React.Fragment, null, children);
    },
    useReducedMotion: function useReducedMotion() {
      return reducedMotionValue;
    },
    useMotionValue: function useMotionValue(value) {
      return {
        get: () => value,
        set: () => {},
        onChange: () => () => {},
      };
    },
    animate: jest.fn(),
    MotionConfig: function MotionConfig({ children }) {
      return React.createElement(React.Fragment, null, children);
    },
  };
});

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/project/1/motion-lab',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.SVGElement = dom.window.SVGElement;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

function renderWithMode(element, mode = 'normal') {
  const React = require('react');
  const { MotionModeProvider } = require('../MotionModeContext');
  return render(React.createElement(MotionModeProvider, { value: mode }, element));
}

function getTransitionStrings(container) {
  return Array.from(container.querySelectorAll('[data-testid="motion-div"]'))
    .map((el) => el.getAttribute('data-transition'))
    .filter(Boolean)
    .map((s) => JSON.parse(s));
}

function triggerDragEnd(container, info) {
  const el = container.querySelector('[data-testid="motion-div"][data-has-ondragend="true"]');
  if (!el || typeof el.__framerMotionDragEnd !== 'function') {
    throw new Error('No draggable motion.div found');
  }
  act(() => el.__framerMotionDragEnd(null, info));
}

function clickButtonByText(container, text) {
  const button = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent.toLowerCase().includes(text.toLowerCase())
  );
  if (!button) {
    throw new Error(`Button with text "${text}" not found`);
  }
  act(() => button.click());
}

describe('demos registry', () => {
  test('exports exactly 11 demos with required fields', () => {
    const { demos } = require('../demos');
    expect(demos).toHaveLength(11);
    demos.forEach((demo) => {
      expect(typeof demo.title).toBe('string');
      expect(typeof demo.description).toBe('string');
      expect(typeof demo.config).toBe('function');
      expect(typeof demo.render).toBe('function');
    });
  });

  test('demo titles match spec', () => {
    const { demos } = require('../demos');
    const titles = demos.map((d) => d.title);
    expect(titles).toEqual([
      'View transition',
      'Window open',
      'Window close',
      'Auto-fit / resize settle',
      'Workspace change',
      'Modal / sheet',
      'Tab indicator',
      'Stagger list',
      'Side collapse',
      'Drag-settle',
      'Generic cross-fade',
    ]);
  });

  test('config readout includes spring display values for normal mode', () => {
    const { demos } = require('../demos');
    const navDemo = demos.find((d) => d.title === 'View transition');
    expect(navDemo.config('normal')).toContain('stiffness:260');
  });

  test('config readout includes amplified display values for amplified mode', () => {
    const { demos } = require('../demos');
    const navDemo = demos.find((d) => d.title === 'View transition');
    expect(navDemo.config('amplified')).toContain('stiffness:220');
  });
});

describe('DemoWindowOpen', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('renders open window and can close', () => {
    dom = installDom();
    const { DemoWindowOpen } = require('../demos');
    const { container } = render(
      React.createElement(DemoWindowOpen, { replayKey: 0, isReduced: false })
    );
    const openButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('open')
    );
    expect(openButton).not.toBeNull();
    act(() => openButton.click());
    expect(container.textContent).toContain('window');
  });
});

describe('DemoTabIndicator', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('switches active tab on click', () => {
    dom = installDom();
    const { DemoTabIndicator } = require('../demos');
    const { container } = render(
      React.createElement(DemoTabIndicator, { replayKey: 0, isReduced: false })
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons).toHaveLength(3);
    act(() => buttons[2].click());
    expect(container.textContent).toContain('Settings content');
  });
});

describe('DemoViewTransition', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('uses nav preset and collapses to reduced-motion fallback', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoViewTransition } = require('../demos');

    const { container } = render(
      React.createElement(DemoViewTransition, { replayKey: 0, isReduced: false })
    );
    const transitions = getTransitionStrings(container);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      type: 'spring',
      stiffness: 260,
      damping: 28,
      mass: 0.9,
    });

    setReducedMotion(true);
    const { container: reducedContainer } = render(
      React.createElement(DemoViewTransition, { replayKey: 1, isReduced: true })
    );
    const reducedTransitions = getTransitionStrings(reducedContainer);
    expect(reducedTransitions).toHaveLength(1);
    expect(reducedTransitions[0]).toEqual({ duration: 0.05, ease: 'linear' });
  });

  test('uses amplified nav preset in amplified mode', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoViewTransition } = require('../demos');

    const { container } = renderWithMode(
      React.createElement(DemoViewTransition, { replayKey: 0, isReduced: false }),
      'amplified'
    );
    const transitions = getTransitionStrings(container);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      type: 'spring',
      stiffness: 220,
      damping: 20,
      mass: 1.0,
    });
  });
});

describe('DemoWindowOpen transition', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('uses open preset and collapses to reduced-motion fallback', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoWindowOpen } = require('../demos');

    const { container } = render(
      React.createElement(DemoWindowOpen, { replayKey: 0, isReduced: false })
    );
    clickButtonByText(container, 'open window');
    const transitions = getTransitionStrings(container);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      type: 'spring',
      stiffness: 320,
      damping: 26,
      mass: 0.9,
    });

    setReducedMotion(true);
    const { container: reducedContainer } = render(
      React.createElement(DemoWindowOpen, { replayKey: 1, isReduced: true })
    );
    clickButtonByText(reducedContainer, 'open window');
    const reducedTransitions = getTransitionStrings(reducedContainer);
    expect(reducedTransitions).toHaveLength(1);
    expect(reducedTransitions[0]).toEqual({ duration: 0.05, ease: 'linear' });
  });
});

describe('DemoWindowClose', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('uses open preset and collapses to reduced-motion fallback', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoWindowClose } = require('../demos');

    const { container } = render(
      React.createElement(DemoWindowClose, { replayKey: 0, isReduced: false })
    );
    const transitions = getTransitionStrings(container);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      type: 'spring',
      stiffness: 320,
      damping: 26,
      mass: 0.9,
    });

    setReducedMotion(true);
    const { container: reducedContainer } = render(
      React.createElement(DemoWindowClose, { replayKey: 1, isReduced: true })
    );
    const reducedTransitions = getTransitionStrings(reducedContainer);
    expect(reducedTransitions).toHaveLength(1);
    expect(reducedTransitions[0]).toEqual({ duration: 0.05, ease: 'linear' });
  });
});

describe('DemoAutoFitSettle', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('uses settle preset and collapses to reduced-motion fallback', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoAutoFitSettle } = require('../demos');

    const { container } = render(
      React.createElement(DemoAutoFitSettle, { replayKey: 0, isReduced: false })
    );
    const transitions = getTransitionStrings(container);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      type: 'spring',
      stiffness: 180,
      damping: 22,
      mass: 1.0,
    });

    setReducedMotion(true);
    const { container: reducedContainer } = render(
      React.createElement(DemoAutoFitSettle, { replayKey: 1, isReduced: true })
    );
    const reducedTransitions = getTransitionStrings(reducedContainer);
    expect(reducedTransitions).toHaveLength(1);
    expect(reducedTransitions[0]).toEqual({ duration: 0.05, ease: 'linear' });
  });
});

describe('DemoWorkspaceChange', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('uses nav preset and collapses to reduced-motion fallback', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoWorkspaceChange } = require('../demos');

    const { container } = render(
      React.createElement(DemoWorkspaceChange, { replayKey: 0, isReduced: false })
    );
    const transitions = getTransitionStrings(container);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      type: 'spring',
      stiffness: 260,
      damping: 28,
      mass: 0.9,
    });

    setReducedMotion(true);
    const { container: reducedContainer } = render(
      React.createElement(DemoWorkspaceChange, { replayKey: 1, isReduced: true })
    );
    const reducedTransitions = getTransitionStrings(reducedContainer);
    expect(reducedTransitions).toHaveLength(1);
    expect(reducedTransitions[0]).toEqual({ duration: 0.05, ease: 'linear' });
  });
});

describe('DemoModalSheet', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('uses sheet and open presets and collapses both to reduced-motion fallback', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoModalSheet } = require('../demos');

    const { container } = render(
      React.createElement(DemoModalSheet, { replayKey: 0, isReduced: false })
    );
    clickButtonByText(container, 'sheet from bottom');
    clickButtonByText(container, 'scale-center modal');
    const transitions = getTransitionStrings(container);
    expect(transitions).toHaveLength(2);
    expect(transitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'spring', stiffness: 280, damping: 26, mass: 1.0 }),
        expect.objectContaining({ type: 'spring', stiffness: 320, damping: 26, mass: 0.9 }),
      ])
    );

    setReducedMotion(true);
    const { container: reducedContainer } = render(
      React.createElement(DemoModalSheet, { replayKey: 1, isReduced: true })
    );
    clickButtonByText(reducedContainer, 'sheet from bottom');
    clickButtonByText(reducedContainer, 'scale-center modal');
    const reducedTransitions = getTransitionStrings(reducedContainer);
    expect(reducedTransitions).toHaveLength(2);
    expect(reducedTransitions).toEqual([
      { duration: 0.05, ease: 'linear' },
      { duration: 0.05, ease: 'linear' },
    ]);
  });
});

describe('DemoTabIndicator transition', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('uses toggle preset and collapses to reduced-motion fallback', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoTabIndicator } = require('../demos');

    const { container } = render(
      React.createElement(DemoTabIndicator, { replayKey: 0, isReduced: false })
    );
    const transitions = getTransitionStrings(container);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      type: 'spring',
      stiffness: 500,
      damping: 30,
      mass: 0.8,
    });

    setReducedMotion(true);
    const { container: reducedContainer } = render(
      React.createElement(DemoTabIndicator, { replayKey: 1, isReduced: true })
    );
    const reducedTransitions = getTransitionStrings(reducedContainer);
    expect(reducedTransitions).toHaveLength(1);
    expect(reducedTransitions[0]).toEqual({ duration: 0.05, ease: 'linear' });
  });
});

describe('DemoStaggerList', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('uses toggle preset and collapses to reduced-motion fallback', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoStaggerList } = require('../demos');

    const { container } = render(
      React.createElement(DemoStaggerList, { replayKey: 0, isReduced: false })
    );
    const transitions = getTransitionStrings(container);
    expect(transitions).toHaveLength(6);
    expect(transitions[0]).toMatchObject({
      type: 'spring',
      stiffness: 500,
      damping: 30,
      mass: 0.8,
    });

    setReducedMotion(true);
    const { container: reducedContainer } = render(
      React.createElement(DemoStaggerList, { replayKey: 1, isReduced: true })
    );
    const reducedTransitions = getTransitionStrings(reducedContainer);
    expect(reducedTransitions).toHaveLength(6);
    reducedTransitions.forEach((transition) => {
      expect(transition).toEqual({ duration: 0.05, ease: 'linear' });
    });
  });
});

describe('DemoSideCollapse', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('uses toggle preset and collapses to reduced-motion fallback', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoSideCollapse } = require('../demos');

    const { container } = render(
      React.createElement(DemoSideCollapse, { replayKey: 0, isReduced: false })
    );
    const transitions = getTransitionStrings(container);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      type: 'spring',
      stiffness: 500,
      damping: 30,
      mass: 0.8,
    });

    setReducedMotion(true);
    const { container: reducedContainer } = render(
      React.createElement(DemoSideCollapse, { replayKey: 1, isReduced: true })
    );
    const reducedTransitions = getTransitionStrings(reducedContainer);
    expect(reducedTransitions).toHaveLength(1);
    expect(reducedTransitions[0]).toEqual({ duration: 0.05, ease: 'linear' });
  });
});

describe('DemoDragSettle', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('uses drag preset for snap animation and collapses to reduced-motion fallback', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoDragSettle } = require('../demos');
    const { animate } = require('framer-motion');

    const { container } = render(
      React.createElement(DemoDragSettle, { replayKey: 0, isReduced: false })
    );
    triggerDragEnd(container, { point: { x: 0, y: 0 } });
    expect(animate).toHaveBeenCalled();
    const transition = animate.mock.calls[0][2];
    expect(transition).toMatchObject({
      type: 'spring',
      stiffness: 350,
      damping: 28,
      mass: 0.6,
    });

    animate.mockClear();
    setReducedMotion(true);
    const { container: reducedContainer } = render(
      React.createElement(DemoDragSettle, { replayKey: 1, isReduced: true })
    );
    triggerDragEnd(reducedContainer, { point: { x: 0, y: 0 } });
    const reducedTransition = animate.mock.calls[0][2];
    expect(reducedTransition).toEqual({ duration: 0.05, ease: 'linear' });
  });
});

describe('DemoCrossfade', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('uses toggle preset and collapses to reduced-motion fallback', () => {
    dom = installDom();
    setReducedMotion(false);
    const { DemoCrossfade } = require('../demos');

    const { container } = render(
      React.createElement(DemoCrossfade, { replayKey: 0, isReduced: false })
    );
    const transitions = getTransitionStrings(container);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      type: 'spring',
      stiffness: 500,
      damping: 30,
      mass: 0.8,
    });

    setReducedMotion(true);
    const { container: reducedContainer } = render(
      React.createElement(DemoCrossfade, { replayKey: 1, isReduced: true })
    );
    const reducedTransitions = getTransitionStrings(reducedContainer);
    expect(reducedTransitions).toHaveLength(1);
    expect(reducedTransitions[0]).toEqual({ duration: 0.05, ease: 'linear' });
  });
});
