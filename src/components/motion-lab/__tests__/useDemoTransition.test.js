'use strict';

const { JSDOM } = require('jsdom');

function installDom({ prefersReducedMotion = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/project/1/motion-lab',
  });
  const matchMedia = jest.fn((query) => ({
    matches: prefersReducedMotion && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
  dom.window.matchMedia = matchMedia;
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.matchMedia = matchMedia;
  return dom;
}

function renderWithConfig(element, { reducedMotion = 'user', mode = 'normal' } = {}) {
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { flushSync } = require('react-dom');
  const { MotionConfig } = require('framer-motion');
  const { MotionModeProvider } = require('../MotionModeContext');

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      React.createElement(
        MotionConfig,
        { reducedMotion },
        React.createElement(MotionModeProvider, { value: mode }, element)
      )
    )
  );
  return { container, root };
}

describe('useDemoTransition', () => {
  let dom;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (dom) dom.window.close();
    jest.clearAllMocks();
  });

  test('returns spring transition in normal mode', () => {
    dom = installDom({ prefersReducedMotion: false });
    const React = require('react');
    const { useDemoTransition } = require('../useDemoTransition');

    function TestComponent() {
      const transition = useDemoTransition('toggle');
      return React.createElement(
        'div',
        { 'data-testid': 'transition' },
        JSON.stringify(transition)
      );
    }

    const { container } = renderWithConfig(React.createElement(TestComponent), {
      reducedMotion: 'user',
      mode: 'normal',
    });
    const transition = JSON.parse(
      container.querySelector('[data-testid="transition"]').textContent
    );
    expect(transition).toMatchObject({
      type: 'spring',
      stiffness: 500,
      damping: 30,
      mass: 0.8,
    });
  });

  test('returns amplified transition in amplified mode', () => {
    dom = installDom({ prefersReducedMotion: false });
    const React = require('react');
    const { useDemoTransition } = require('../useDemoTransition');

    function TestComponent() {
      const transition = useDemoTransition('toggle');
      return React.createElement(
        'div',
        { 'data-testid': 'transition' },
        JSON.stringify(transition)
      );
    }

    const { container } = renderWithConfig(React.createElement(TestComponent), {
      reducedMotion: 'user',
      mode: 'amplified',
    });
    const transition = JSON.parse(
      container.querySelector('[data-testid="transition"]').textContent
    );
    expect(transition).toMatchObject({
      type: 'spring',
      stiffness: 500,
      damping: 22,
      mass: 0.9,
    });
  });

  test('returns 50ms opacity-only fallback when system reduced motion is active', () => {
    dom = installDom({ prefersReducedMotion: true });
    const React = require('react');
    const { useDemoTransition } = require('../useDemoTransition');

    function TestComponent() {
      const transition = useDemoTransition('toggle');
      return React.createElement(
        'div',
        { 'data-testid': 'transition' },
        JSON.stringify(transition)
      );
    }

    const { container } = renderWithConfig(React.createElement(TestComponent), {
      reducedMotion: 'user',
      mode: 'normal',
    });
    const transition = JSON.parse(
      container.querySelector('[data-testid="transition"]').textContent
    );
    expect(transition).toEqual({ duration: 0.05, ease: 'linear' });
  });

  test('returns 50ms opacity-only fallback when mode is reduced', () => {
    dom = installDom({ prefersReducedMotion: false });
    const React = require('react');
    const { useDemoTransition } = require('../useDemoTransition');

    function TestComponent() {
      const transition = useDemoTransition('toggle');
      return React.createElement(
        'div',
        { 'data-testid': 'transition' },
        JSON.stringify(transition)
      );
    }

    const { container } = renderWithConfig(React.createElement(TestComponent), {
      reducedMotion: 'user',
      mode: 'reduced',
    });
    const transition = JSON.parse(
      container.querySelector('[data-testid="transition"]').textContent
    );
    expect(transition).toEqual({ duration: 0.05, ease: 'linear' });
  });

  test('system reduced motion overrides amplified mode', () => {
    dom = installDom({ prefersReducedMotion: true });
    const React = require('react');
    const { useDemoTransition } = require('../useDemoTransition');

    function TestComponent() {
      const transition = useDemoTransition('toggle');
      return React.createElement(
        'div',
        { 'data-testid': 'transition' },
        JSON.stringify(transition)
      );
    }

    const { container } = renderWithConfig(React.createElement(TestComponent), {
      reducedMotion: 'always',
      mode: 'amplified',
    });
    const transition = JSON.parse(
      container.querySelector('[data-testid="transition"]').textContent
    );
    expect(transition).toEqual({ duration: 0.05, ease: 'linear' });
  });

  test('returns the requested intent transition', () => {
    dom = installDom({ prefersReducedMotion: false });
    const React = require('react');
    const { useDemoTransition } = require('../useDemoTransition');

    function TestComponent() {
      const transition = useDemoTransition('sheet');
      return React.createElement(
        'div',
        { 'data-testid': 'transition' },
        JSON.stringify(transition)
      );
    }

    const { container } = renderWithConfig(React.createElement(TestComponent), {
      reducedMotion: 'user',
      mode: 'normal',
    });
    const transition = JSON.parse(
      container.querySelector('[data-testid="transition"]').textContent
    );
    expect(transition).toMatchObject({
      type: 'spring',
      stiffness: 280,
      damping: 26,
      mass: 1.0,
    });
  });
});
