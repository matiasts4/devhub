/**
 * @jest-environment jsdom
 */

'use strict';

const React = require('react');
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test/project/1/motion-lab',
  });
  const matchMedia = jest.fn((query) => ({
    matches: false,
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
  global.Element = dom.window.Element;
  global.SVGElement = dom.window.SVGElement;
  global.matchMedia = matchMedia;
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

const MotionProvider = require('@/components/ui/motion/MotionProvider').default;
const MotionLab = require('../MotionLab').default;

describe('MotionLab page', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
    jest.clearAllMocks();
  });

  test('renders header, toggle, and 11 demo cards', async () => {
    dom = installDom();
    const { container } = await render(React.createElement(MotionLab));
    expect(container.textContent).toContain('Motion Lab');
    expect(container.textContent).toContain('reduced');
    expect(container.textContent).toContain('normal');
    expect(container.textContent).toContain('amplified');
    const sections = container.querySelectorAll('section');
    expect(sections.length).toBeGreaterThanOrEqual(11);
  });

  test('records a like vote for a demo', async () => {
    dom = installDom();
    const { container } = await render(React.createElement(MotionLab));
    const likeButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent.includes('like')
    );
    expect(likeButtons.length).toBeGreaterThan(0);
    await React.act(async () => {
      likeButtons[0].click();
    });
    expect(likeButtons[0].getAttribute('aria-pressed')).toBe('true');
  });

  test('toggling reduced motion updates the toggle', async () => {
    dom = installDom();
    const { container } = await render(React.createElement(MotionLab));
    const reducedButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'reduced'
    );
    expect(reducedButton).toBeTruthy();
    expect(reducedButton.getAttribute('aria-pressed')).toBe('false');
    await React.act(async () => {
      reducedButton.click();
    });
    expect(reducedButton.getAttribute('aria-pressed')).toBe('true');
  });

  test('initializes local mode from the global MotionProvider context', async () => {
    dom = installDom();
    window.localStorage.setItem('devhub:motion-mode', 'amplified');
    const { container } = await render(
      React.createElement(MotionProvider, null, React.createElement(MotionLab))
    );
    const presetHeader = container.querySelector('h2');
    expect(presetHeader.textContent).toContain('Amplified presets');
  });

  test('local toggle does not persist the global preference', async () => {
    dom = installDom();
    window.localStorage.setItem('devhub:motion-mode', 'normal');
    const { container } = await render(
      React.createElement(MotionProvider, null, React.createElement(MotionLab))
    );
    const amplifiedButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'amplified'
    );
    await React.act(async () => {
      amplifiedButton.click();
    });
    expect(window.localStorage.getItem('devhub:motion-mode')).toBe('normal');
  });
});
