/**
 * @jest-environment jsdom
 */

'use strict';

const React = require('react');
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');

const motionConfigProps = [];

jest.mock('framer-motion', () => ({
  MotionConfig: (props) => {
    motionConfigProps.push(props);
    return props.children;
  },
}));

const { MOTION_MODE_STORAGE_KEY, setMotionMode } = require('@/lib/theme/themes');
const { MotionProvider } = require('../MotionProvider');
const { useMotionMode } = require('../MotionModeContext');

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
  global.CustomEvent = dom.window.CustomEvent;
  global.StorageEvent = dom.window.StorageEvent;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => {
    root.render(element);
  });
  return { container, root };
}

function ModeReader() {
  const mode = useMotionMode();
  return React.createElement('span', { 'data-testid': 'mode-value' }, mode);
}

describe('MotionProvider', () => {
  let dom;
  beforeEach(() => {
    motionConfigProps.length = 0;
    dom = installDom();
    window.localStorage.clear();
  });
  afterEach(() => {
    if (dom) dom.window.close();
    jest.clearAllMocks();
  });

  test('initializes from stored motion mode and provides it via context', async () => {
    window.localStorage.setItem(MOTION_MODE_STORAGE_KEY, 'amplified');
    const { container } = await render(
      React.createElement(MotionProvider, null, React.createElement(ModeReader))
    );
    expect(container.querySelector('[data-testid="mode-value"]').textContent).toBe('amplified');
  });

  test('defaults to normal when no motion mode is stored', async () => {
    const { container } = await render(
      React.createElement(MotionProvider, null, React.createElement(ModeReader))
    );
    expect(container.querySelector('[data-testid="mode-value"]').textContent).toBe('normal');
  });

  test('passes reducedMotion=user for normal mode', async () => {
    await render(React.createElement(MotionProvider, null, React.createElement(ModeReader)));
    const last = motionConfigProps[motionConfigProps.length - 1];
    expect(last.reducedMotion).toBe('user');
  });

  test('passes reducedMotion=always for reduced mode', async () => {
    window.localStorage.setItem(MOTION_MODE_STORAGE_KEY, 'reduced');
    await render(React.createElement(MotionProvider, null, React.createElement(ModeReader)));
    const last = motionConfigProps[motionConfigProps.length - 1];
    expect(last.reducedMotion).toBe('always');
  });

  test('passes reducedMotion=user for amplified mode', async () => {
    window.localStorage.setItem(MOTION_MODE_STORAGE_KEY, 'amplified');
    await render(React.createElement(MotionProvider, null, React.createElement(ModeReader)));
    const last = motionConfigProps[motionConfigProps.length - 1];
    expect(last.reducedMotion).toBe('user');
  });

  test('updates context when a devhub:motion-mode-change event fires', async () => {
    const { container } = await render(
      React.createElement(MotionProvider, null, React.createElement(ModeReader))
    );
    expect(container.querySelector('[data-testid="mode-value"]').textContent).toBe('normal');
    setMotionMode('reduced');
    await React.act(async () => {
      window.dispatchEvent(new window.Event('devhub:motion-mode-change'));
    });
    expect(container.querySelector('[data-testid="mode-value"]').textContent).toBe('reduced');
  });

  test('updates context when the storage event fires for the motion-mode key', async () => {
    const { container } = await render(
      React.createElement(MotionProvider, null, React.createElement(ModeReader))
    );
    window.localStorage.setItem(MOTION_MODE_STORAGE_KEY, 'amplified');
    await React.act(async () => {
      window.dispatchEvent(new window.Event('storage'));
    });
    expect(container.querySelector('[data-testid="mode-value"]').textContent).toBe('amplified');
  });
});
