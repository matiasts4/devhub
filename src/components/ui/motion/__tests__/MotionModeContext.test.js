/**
 * @jest-environment jsdom
 */

'use strict';

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const { MotionModeContext, MotionModeProvider, useMotionMode } = require('../MotionModeContext');

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.SVGElement = dom.window.SVGElement;
  return dom;
}

function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  return { container, root };
}

function ModeReader() {
  const mode = useMotionMode();
  return React.createElement('span', { 'data-testid': 'mode-value' }, mode);
}

describe('global MotionModeContext', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
    jest.clearAllMocks();
  });

  test('useMotionMode returns the value provided by MotionModeProvider', () => {
    dom = installDom();
    const { container } = render(
      React.createElement(
        MotionModeProvider,
        { value: 'amplified' },
        React.createElement(ModeReader)
      )
    );
    expect(container.querySelector('[data-testid="mode-value"]').textContent).toBe('amplified');
  });

  test('useMotionMode falls back to normal when rendered outside a provider', () => {
    dom = installDom();
    const { container } = render(React.createElement(ModeReader));
    expect(container.querySelector('[data-testid="mode-value"]').textContent).toBe('normal');
  });

  test('MotionModeContext exposes the expected exports', () => {
    expect(MotionModeContext).toBeDefined();
    expect(MotionModeProvider).toBeDefined();
    expect(typeof useMotionMode).toBe('function');
  });
});
