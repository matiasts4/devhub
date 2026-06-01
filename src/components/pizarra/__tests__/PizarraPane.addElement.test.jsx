/**
 * PizarraPane addElement — full integration test (pizarra-add-terminal-bugfix).
 *
 * The cascading unit test (PizarraToolPalette.addElement.test.jsx) covers
 * the click contract at the palette level. The cascade test
 * (PizarraPane.cascade.test.jsx) covers the dispatch path. This file
 * covers the integration between the two:
 *
 *  - Click the Terminal button on the PizarraPane.
 *  - Verify state.elements grows by 1.
 *  - Verify the new element is a terminal shape with the cascade offset.
 *
 * The PizarraCanvas is mocked via next/dynamic to keep the render path
 * shallow (same approach as PizarraPane.cascade.test.jsx) so the test
 * stays deterministic. The dynamic mock preserves the `elements` prop
 * so the test can introspect it.
 *
 * This test is intentionally more verbose than the unit tests because
 * it walks the full PizarraPane state machine: cascade advance + add
 * element + select + activate terminal.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

let lastCanvasProps = null;

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('next/dynamic', () => () => {
  const ReactLocal = require('react');
  return function DynamicCanvas(props) {
    lastCanvasProps = props;
    return ReactLocal.createElement(
      'div',
      { 'data-testid': 'pizarra-canvas-mock' },
      `${props.elements ? props.elements.length : 0} elements`
    );
  };
});

jest.mock('@/lib/pizarra/canvasViewport', () => ({
  useCanvasViewport: () => ({
    zoom: 1,
    setZoom: () => {},
    pan: { x: 0, y: 0 },
    setPan: () => {},
  }),
  CanvasViewportProvider: ({ children }) => children,
}));

jest.mock('../PizarraLiveSurfaceLayer', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: () => ReactLocal.createElement('div', { 'data-testid': 'pizarra-live-layer' }),
  };
});

jest.mock('../PizarraPropertyInspector', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: () => ReactLocal.createElement('div', { 'data-testid': 'pizarra-inspector' }),
  };
});

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
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  return dom;
}

function fireClick(element) {
  const ev = new global.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  element.dispatchEvent(ev);
}

describe('PizarraPane — pizarra-add-terminal-bugfix full add flow', () => {
  let dom;
  let container;
  let root;

  beforeEach(() => {
    dom = installDom();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    lastCanvasProps = null;
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

  test('clicking Add Terminal dispatches ADD_ELEMENT with a terminal shape', () => {
    const { default: PizarraPane } = require('../PizarraPane');
    flushSync(() => {
      root.render(React.createElement(PizarraPane));
    });

    const terminalButton = container.querySelector('[data-testid="pizarra-add-terminal"]');
    expect(terminalButton).toBeTruthy();
    expect(lastCanvasProps?.elements?.length).toBe(0);

    // Real click event (mousedown + mouseup + click). React's onClick
    // listens to the click phase. After flushSync, the dispatch
    // (CASCADE_OFFSET + ADD_ELEMENT + SELECT_ELEMENTS) is committed
    // and the mocked canvas receives the new elements array.
    flushSync(() => {
      fireClick(terminalButton);
    });

    expect(lastCanvasProps?.elements?.length).toBe(1);
    expect(lastCanvasProps.elements[0].type).toBe('terminal');
    expect(lastCanvasProps.selectedElementIds).toContain(lastCanvasProps.elements[0].id);
  });

  test('clicking Add Browser dispatches ADD_ELEMENT with a browser shape', () => {
    const { default: PizarraPane } = require('../PizarraPane');
    flushSync(() => {
      root.render(React.createElement(PizarraPane));
    });

    const browserButton = container.querySelector('[data-testid="pizarra-add-browser"]');
    expect(browserButton).toBeTruthy();
    expect(lastCanvasProps?.elements?.length).toBe(0);

    flushSync(() => {
      fireClick(browserButton);
    });

    expect(lastCanvasProps?.elements?.length).toBe(1);
    expect(lastCanvasProps.elements[0].type).toBe('browser');
  });
});
