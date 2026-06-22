/**
 * usePizarraCanvasPan — container-level pan over native overlays.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

function installDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost:3100/',
  });
  global.document = dom.window.document;
  global.window = dom.window;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.MouseEvent = dom.window.MouseEvent;
  global.KeyboardEvent = dom.window.KeyboardEvent;
  global.Event = dom.window.Event;
  return dom;
}

function Harness({ containerRef, panRef, setPan, onPanStart, onPanEnd }) {
  const usePizarraCanvasPan = require('../hooks/usePizarraCanvasPan').default;
  usePizarraCanvasPan({
    containerRef,
    panRef,
    setPan,
    cancelPanAnimation: () => {},
    enabled: true,
    onPanStart,
    onPanEnd,
  });
  return React.createElement('div', { ref: containerRef, 'data-testid': 'canvas-container' });
}

describe('usePizarraCanvasPan', () => {
  let dom;
  let container;
  let root;
  let containerRef;
  let panState;
  let panRef;

  beforeEach(() => {
    dom = installDom();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    containerRef = { current: null };
    panState = { x: 10, y: 20 };
    panRef = { current: panState };
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    if (dom?.window) {
      try {
        dom.window.close();
      } catch {
        // ignore
      }
    }
  });

  async function waitForAttach() {
    await new Promise((resolve) => {
      global.requestAnimationFrame(() => resolve());
    });
  }

  async function renderHook(extra = {}) {
    const setPan = jest.fn((updater) => {
      if (typeof updater === 'function') {
        panState = updater(panState);
      } else {
        panState = updater;
      }
      panRef.current = panState;
    });
    const onPanStart = jest.fn();
    const onPanEnd = jest.fn();
    flushSync(() => {
      root.render(
        React.createElement(Harness, {
          containerRef,
          panRef,
          setPan,
          onPanStart,
          onPanEnd,
          ...extra,
        })
      );
    });
    const canvasContainer = container.querySelector('[data-testid="canvas-container"]');
    return { setPan, onPanStart, onPanEnd, canvasContainer };
  }

  test('Space + drag pans the canvas from capture-phase mousedown', async () => {
    const { setPan, onPanStart, canvasContainer } = await renderHook();
    await waitForAttach();

    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true })
    );

    canvasContainer.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100,
      })
    );

    window.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 120, clientY: 130 })
    );

    expect(onPanStart).toHaveBeenCalledTimes(1);
    expect(setPan).toHaveBeenCalled();
    expect(panState).toEqual({ x: 30, y: 50 });
  });

  test('middle mouse drag pans without holding Space', async () => {
    const { canvasContainer } = await renderHook();
    await waitForAttach();

    canvasContainer.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 1,
        clientX: 50,
        clientY: 50,
      })
    );

    window.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 60, clientY: 70 })
    );

    expect(panState).toEqual({ x: 20, y: 40 });
  });
});