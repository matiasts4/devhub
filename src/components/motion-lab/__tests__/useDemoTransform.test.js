'use strict';

const { JSDOM } = require('jsdom');

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/project/1/motion-lab',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  return dom;
}

function renderWithMode(element, mode = 'normal') {
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { flushSync } = require('react-dom');
  const { MotionModeProvider } = require('../MotionModeContext');

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(React.createElement(MotionModeProvider, { value: mode }, element)));
  return { container, root };
}

describe('useDemoTransform', () => {
  let dom;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (dom) dom.window.close();
    jest.clearAllMocks();
  });

  test('returns base value in normal mode', () => {
    dom = installDom();
    const React = require('react');
    const { useDemoTransform } = require('../useDemoTransform');

    function TestComponent() {
      const value = useDemoTransform(0.96, 0.85);
      return React.createElement('div', { 'data-testid': 'value' }, String(value));
    }

    const { container } = renderWithMode(React.createElement(TestComponent), 'normal');
    expect(container.querySelector('[data-testid="value"]').textContent).toBe('0.96');
  });

  test('returns amplified value in amplified mode', () => {
    dom = installDom();
    const React = require('react');
    const { useDemoTransform } = require('../useDemoTransform');

    function TestComponent() {
      const value = useDemoTransform(0.96, 0.85);
      return React.createElement('div', { 'data-testid': 'value' }, String(value));
    }

    const { container } = renderWithMode(React.createElement(TestComponent), 'amplified');
    expect(container.querySelector('[data-testid="value"]').textContent).toBe('0.85');
  });

  test('returns base value in reduced mode', () => {
    dom = installDom();
    const React = require('react');
    const { useDemoTransform } = require('../useDemoTransform');

    function TestComponent() {
      const value = useDemoTransform(48, 72);
      return React.createElement('div', { 'data-testid': 'value' }, String(value));
    }

    const { container } = renderWithMode(React.createElement(TestComponent), 'reduced');
    expect(container.querySelector('[data-testid="value"]').textContent).toBe('48');
  });

  test('works with string values', () => {
    dom = installDom();
    const React = require('react');
    const { useDemoTransform } = require('../useDemoTransform');

    function TestComponent() {
      const value = useDemoTransform('100%', '120%');
      return React.createElement('div', { 'data-testid': 'value' }, value);
    }

    const { container } = renderWithMode(React.createElement(TestComponent), 'amplified');
    expect(container.querySelector('[data-testid="value"]').textContent).toBe('120%');
  });
});
