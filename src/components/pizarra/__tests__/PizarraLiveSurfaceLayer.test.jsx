const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const terminalCalls = [];
const browserCalls = [];

jest.mock('../CanvasTerminal', () => ({
  __esModule: true,
  default: (props) => {
    const ReactLocal = require('react');
    terminalCalls.push(props);
    return ReactLocal.createElement('div', { 'data-testid': `terminal-${props.terminalId}` });
  },
}));

jest.mock('../PizarraBrowserSurface', () => ({
  __esModule: true,
  default: (props) => {
    const ReactLocal = require('react');
    browserCalls.push(props);
    return ReactLocal.createElement('div', { 'data-testid': `browser-${props.shape.id}` });
  },
}));

jest.mock('@/lib/pizarra/canvasViewport', () => ({
  useCanvasViewport: () => ({
    zoom: 2,
    projectRect: ({ x, y, width, height }) => ({
      x: x * 2 + 10,
      y: y * 2 + 20,
      width: width * 2,
      height: height * 2,
    }),
  }),
}));

describe('PizarraLiveSurfaceLayer', () => {
  let container;
  let root;

  beforeEach(() => {
    terminalCalls.length = 0;
    browserCalls.length = 0;

    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document;
    global.window = dom.window;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    root = null;
    container = null;
  });

  test('projects terminal and browser shapes into the live overlay layer', () => {
    const { default: PizarraLiveSurfaceLayer } = require('../PizarraLiveSurfaceLayer');
    const onSelect = jest.fn();
    const onMoveElement = jest.fn();
    const onActivateTerminal = jest.fn();
    const elements = [
      { id: 'rect-1', type: 'rect', x: 0, y: 0, width: 50, height: 50 },
      {
        id: 'terminal-1',
        type: 'terminal',
        x: 20,
        y: 30,
        width: 300,
        height: 200,
        label: 'Ops',
      },
      {
        id: 'terminal-2',
        type: 'terminal',
        x: 10,
        y: 15,
        width: 200,
        height: 120,
        label: 'Build',
      },
      {
        id: 'browser-1',
        type: 'browser',
        x: 50,
        y: 60,
        width: 400,
        height: 280,
        url: 'http://localhost:3200/',
      },
    ];

    flushSync(() => {
      root.render(
        React.createElement(PizarraLiveSurfaceLayer, {
          elements,
          selectedElementIds: ['terminal-1'],
          activeTerminalId: 'terminal-1',
          onSelect,
          onMoveElement,
          onActivateTerminal,
        })
      );
    });

    expect(document.querySelector('[data-testid="pizarra-live-surface-layer"]')).not.toBeNull();
    expect(terminalCalls).toHaveLength(2);
    expect(terminalCalls[0].bounds).toEqual({
      x: 0,
      y: 0,
      screenX: undefined,
      screenY: undefined,
      width: 600,
      height: 400,
    });
    expect(terminalCalls[0].selected).toBe(true);
    expect(terminalCalls[0].isActivePanel).toBe(true);
    expect(terminalCalls[0].requestedRendererMode).toBe('xterm-webgl');
    expect(terminalCalls[1].isActivePanel).toBe(false);

    expect(browserCalls).toHaveLength(1);
    expect(browserCalls[0].bounds).toEqual({
      x: 0,
      y: 0,
      screenX: undefined,
      screenY: undefined,
      width: 800,
      height: 560,
    });
    expect(browserCalls[0].selected).toBe(false);

    flushSync(() => {
      terminalCalls[0].onActivatePanel();
      // pizarra-drag-desync-v2: handleMove now uses the per-tick
      // deltaX/deltaY (post-zoom) from the drag hook. The drag hook
      // already divides both delta and totalDelta by the resolved
      // zoom, so the layer no longer re-divides. To preserve the
      // expected post-zoom displacement of (20, 10) on the terminal
      // (shape at (20, 30) → (40, 40) with zoom=2) and (5, -5) on
      // the browser (shape at (50, 60) → (55, 55)), we pass those
      // post-zoom values directly.
      terminalCalls[0].onDragEnd({ totalDeltaX: 20, totalDeltaY: 10 });
      browserCalls[0].onDragEnd({ totalDeltaX: 5, totalDeltaY: -5 });
    });

    expect(onActivateTerminal).toHaveBeenCalledWith('terminal-1');
    expect(onMoveElement).toHaveBeenNthCalledWith(1, 'terminal-1', { x: 40, y: 40 });
    expect(onMoveElement).toHaveBeenNthCalledWith(2, 'browser-1', { x: 55, y: 55 });
  });
});
