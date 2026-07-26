/**
 * PizarraToolPalette.view-lock — view lock toggle contract.
 *
 * Pins the behaviour of the new "Fijar/Liberar vista" button:
 *  1. The toggle button renders with the correct data-testid.
 *  2. Clicking it invokes onToggleViewLocked.
 *  3. The pressed state reflects isViewLocked.
 *  4. The button is optional and the palette must not crash if omitted.
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
  const ev = new global.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  element.dispatchEvent(ev);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PizarraToolPalette — view lock toggle contract', () => {
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
      } catch (_e) {
        // ignore
      }
    }
  });

  test('view lock button renders with correct data-testid', () => {
    const { default: PizarraToolPalette } = require('../PizarraToolPalette');
    flushSync(() => {
      root.render(
        React.createElement(PizarraToolPalette, {
          value: 'select',
          onChange: () => {},
          isViewLocked: true,
          onToggleViewLocked: () => {},
        })
      );
    });

    const lockButton = container.querySelector('[data-testid="pizarra-toggle-view-locked"]');
    expect(lockButton).toBeTruthy();
    expect(lockButton.tagName).toBe('BUTTON');
    expect(lockButton.getAttribute('aria-pressed')).toBe('true');
  });

  test('clicking the lock button invokes onToggleViewLocked', () => {
    const { default: PizarraToolPalette } = require('../PizarraToolPalette');
    const onToggleViewLocked = jest.fn();
    flushSync(() => {
      root.render(
        React.createElement(PizarraToolPalette, {
          value: 'select',
          onChange: () => {},
          isViewLocked: false,
          onToggleViewLocked,
        })
      );
    });

    const lockButton = container.querySelector('[data-testid="pizarra-toggle-view-locked"]');
    fireClick(lockButton);
    expect(onToggleViewLocked).toHaveBeenCalledTimes(1);
    expect(lockButton.getAttribute('aria-pressed')).toBe('false');
  });

  test('palette does not crash when lock props are omitted', () => {
    const { default: PizarraToolPalette } = require('../PizarraToolPalette');
    flushSync(() => {
      root.render(
        React.createElement(PizarraToolPalette, {
          value: 'select',
          onChange: () => {},
        })
      );
    });

    const lockButton = container.querySelector('[data-testid="pizarra-toggle-view-locked"]');
    expect(lockButton).toBeTruthy();
    expect(() => fireClick(lockButton)).not.toThrow();
  });
});
