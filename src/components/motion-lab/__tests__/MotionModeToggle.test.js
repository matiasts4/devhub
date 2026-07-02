'use strict';

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
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

function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  return { container, root };
}

describe('MotionModeToggle', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('renders three mode options', () => {
    dom = installDom();
    const { MotionModeToggle } = require('../MotionModeToggle');
    const { container } = render(
      React.createElement(MotionModeToggle, { mode: 'normal', onModeChange: jest.fn() })
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.textContent)).toEqual(['reduced', 'normal', 'amplified']);
  });

  test('marks the active mode as pressed', () => {
    dom = installDom();
    const { MotionModeToggle } = require('../MotionModeToggle');
    const { container } = render(
      React.createElement(MotionModeToggle, { mode: 'amplified', onModeChange: jest.fn() })
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
  });

  test('calls onModeChange when a different mode is selected', () => {
    dom = installDom();
    const onChange = jest.fn();
    const { MotionModeToggle } = require('../MotionModeToggle');
    const { container } = render(
      React.createElement(MotionModeToggle, { mode: 'normal', onModeChange: onChange })
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    flushSync(() => {
      buttons[2].click();
    });
    expect(onChange).toHaveBeenCalledWith('amplified');
  });

  test('does not call onModeChange when the active mode is reselected', () => {
    dom = installDom();
    const onChange = jest.fn();
    const { MotionModeToggle } = require('../MotionModeToggle');
    const { container } = render(
      React.createElement(MotionModeToggle, { mode: 'reduced', onModeChange: onChange })
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    flushSync(() => {
      buttons[0].click();
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
