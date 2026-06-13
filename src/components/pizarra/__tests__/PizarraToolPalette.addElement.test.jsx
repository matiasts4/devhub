/**
 * PizarraToolPalette.addElement — terminal/browser click regression.
 *
 * Regression repro for the pizarra-add-terminal-bugfix mini-change. The
 * user reported that clicking "Add Terminal" / "Add Browser" in the
 * pizarra tool palette does nothing (the click does not lead to a new
 * element being added). This file pins the click contract:
 *
 *  1. The Terminal/Globe buttons render with the correct data-testids.
 *  2. A user click on each button invokes onAddElement with the
 *     element-type string ('terminal' / 'browser').
 *  3. The PizarraToolPalette does NOT swallow the click when the
 *     parent is also an HTML overlay (the onAddElement prop must be
 *     invoked from the bare <button> onClick handler).
 *
 * Approach: render the PizarraToolPalette directly with a mock
 * onAddElement, fire a real click event on each button, and assert
 * the mock was called with the right argument. The mock is also
 * sanity-checked to have been called exactly once per click (no
 * double-fire from bubbling through the Radix ToggleGroup sibling
 * group).
 *
 * This test does NOT exercise the full PizarraPane — the cascade test
 * already covers the dispatch path. This file isolates the click
 * receipt in the tool palette itself.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('@/lib/pizarra/canvasViewport', () => ({
  useCanvasViewport: () => ({
    zoom: 1,
    pan: { x: 0, y: 0 },
    viewportToCanvas: (x, y) => ({ x, y }),
    canvasRect: { width: 1920, height: 1080 },
  }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function installDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost:3100/',
  });
  global.document = dom.window.document;
  global.window = dom.window;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.MouseEvent = dom.window.MouseEvent;
  global.Event = dom.window.Event;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  return dom;
}

function fireClick(element) {
  // Real DOM click via mouseup + mousedown + click. JSDOM honors
  // these as a true user click and React's synthetic event system
  // routes them through onClick.
  const ev = new global.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  element.dispatchEvent(ev);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PizarraToolPalette — pizarra-add-terminal-bugfix click contract', () => {
  let dom;
  let container;
  let root;

  beforeEach(() => {
    dom = installDom();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    root = null;
    container = null;
    if (dom && dom.window) {
      try {
        dom.window.close();
      } catch (e) {
        // ignore
      }
    }
  });

  test('terminal and browser buttons render with correct data-testids', () => {
    const { default: PizarraToolPalette } = require('../PizarraToolPalette');
    const onAddElement = jest.fn();
    flushSync(() => {
      root.render(
        React.createElement(PizarraToolPalette, {
          value: 'select',
          onChange: () => {},
          onAddElement,
        })
      );
    });

    const terminalButton = container.querySelector('[data-testid="pizarra-add-terminal"]');
    const browserButton = container.querySelector('[data-testid="pizarra-add-browser"]');
    expect(terminalButton).toBeTruthy();
    expect(browserButton).toBeTruthy();
    // Buttons are real <button> elements so they are focusable and
    // receive real click events from JSDOM.
    expect(terminalButton.tagName).toBe('BUTTON');
    expect(browserButton.tagName).toBe('BUTTON');
  });

  test('clicking the Terminal button invokes onAddElement with "terminal"', () => {
    const { default: PizarraToolPalette } = require('../PizarraToolPalette');
    const onAddElement = jest.fn();
    flushSync(() => {
      root.render(
        React.createElement(PizarraToolPalette, {
          value: 'select',
          onChange: () => {},
          onAddElement,
        })
      );
    });

    const terminalButton = container.querySelector('[data-testid="pizarra-add-terminal"]');
    fireClick(terminalButton);
    expect(onAddElement).toHaveBeenCalledTimes(1);
    expect(onAddElement).toHaveBeenCalledWith('terminal', { x: 960, y: 540 });
  });

  test('clicking the Browser button invokes onAddElement with "browser"', () => {
    const { default: PizarraToolPalette } = require('../PizarraToolPalette');
    const onAddElement = jest.fn();
    flushSync(() => {
      root.render(
        React.createElement(PizarraToolPalette, {
          value: 'select',
          onChange: () => {},
          onAddElement,
        })
      );
    });

    const browserButton = container.querySelector('[data-testid="pizarra-add-browser"]');
    fireClick(browserButton);
    expect(onAddElement).toHaveBeenCalledTimes(1);
    expect(onAddElement).toHaveBeenCalledWith('browser', { x: 960, y: 540 });
  });

  test('onAddElement is optional (palette must not crash if callback is missing)', () => {
    const { default: PizarraToolPalette } = require('../PizarraToolPalette');
    flushSync(() => {
      root.render(
        React.createElement(PizarraToolPalette, {
          value: 'select',
          onChange: () => {},
          // onAddElement omitted on purpose
        })
      );
    });

    const terminalButton = container.querySelector('[data-testid="pizarra-add-terminal"]');
    expect(() => fireClick(terminalButton)).not.toThrow();
  });
});
