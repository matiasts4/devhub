/**
 * CanvasTerminal close button tests.
 *
 * Covers pizarra-close-buttons: the in-header X button must
 *   1. render with data-testid="canvas-terminal-close",
 *   2. call onClose exactly once with the resolved shape id when clicked,
 *   3. NOT trigger the header's drag handler (mousedown stopPropagation
 *      keeps the underlying usePizarraSurfaceDrag idle).
 *
 * Mirrors the rendering pattern in CanvasTerminal.test.jsx (JSDOM +
 * react-dom/client + flushSync). The lucide-react and xterm stacks
 * are mocked the same way; TerminalTTY is replaced with a self-
 * contained captor factory. The drag hook is NOT mocked â€” the close
 * button's stopPropagation is verified by asserting onSelect (called
 * by usePizarraSurfaceDrag) stays quiet.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

jest.mock('framer-motion', () => ({
  motion: {
    div: (() => {
      const R = require('react');
      return R.forwardRef(({ children, ...props }, ref) =>
        R.createElement('div', { ...props, ref }, children)
      );
    })(),
  },
}));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const R = require('react');
    return R.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock(
  '@xterm/xterm',
  () => ({
    Terminal: jest.fn().mockImplementation(() => ({
      rows: 24,
      cols: 80,
      loadAddon: jest.fn(),
      open: jest.fn(),
      onData: jest.fn(),
      focus: jest.fn(),
      write: jest.fn(),
      writeln: jest.fn(),
      paste: jest.fn(),
      refresh: jest.fn(),
      clearTextureAtlas: jest.fn(),
      dispose: jest.fn(),
      getSelection: jest.fn(() => ''),
      clear: jest.fn(),
      scrollToLine: jest.fn(),
    })),
  }),
  { virtual: true }
);

jest.mock(
  '@xterm/addon-fit',
  () => ({
    FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })),
  }),
  { virtual: true }
);

jest.mock(
  '@xterm/addon-search',
  () => ({
    SearchAddon: jest.fn().mockImplementation(() => ({
      findNext: jest.fn(),
      findPrevious: jest.fn(),
    })),
  }),
  { virtual: true }
);

// Self-contained TerminalTTY mock: factory must not reference
// out-of-scope variables, so the spy is built inside the factory.
jest.mock('@/components/TerminalTTY', () => ({
  __esModule: true,
  default: function MockTerminalTTY() {
    return require('react').createElement('div', { 'data-testid': 'mock-terminal' }, null);
  },
}));

describe('CanvasTerminal close button', () => {
  let container;
  let root;
  let dom;

  beforeEach(() => {
    jest.clearAllMocks();

    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document;
    global.window = dom.window;
    global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    global.cancelAnimationFrame = (id) => clearTimeout(id);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    root = null;
    container = null;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
    jest.restoreAllMocks();
  });

  function render(props) {
    const { default: CanvasTerminal } = require('../CanvasTerminal');
    flushSync(() => root.render(React.createElement(CanvasTerminal, props)));
  }

  it('renders the close button with the expected testid when mounted', () => {
    render({
      terminalId: 'shape-terminal-1',
      shape: { id: 'shape-terminal-1', label: 'Terminal' },
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      onClose: jest.fn(),
    });

    const closeBtn = container.querySelector('[data-testid="canvas-terminal-close"]');
    expect(closeBtn).toBeTruthy();
    expect(closeBtn.getAttribute('data-pizarra-close-button')).toBe('true');
    expect(closeBtn.getAttribute('aria-label')).toBe('Cerrar terminal');
    expect(closeBtn.getAttribute('title')).toBe('Cerrar terminal');
    expect(closeBtn.getAttribute('type')).toBe('button');
  });

  it('calls onClose once with the resolved shape id when the close button is clicked', () => {
    const onClose = jest.fn();
    render({
      terminalId: 'shape-terminal-1',
      shape: { id: 'shape-terminal-1', label: 'Terminal' },
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      onClose,
    });

    const closeBtn = container.querySelector('[data-testid="canvas-terminal-close"]');
    flushSync(() => {
      closeBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('shape-terminal-1');
  });

  it('does not trigger the header drag handler when the close button is clicked', () => {
    const onMove = jest.fn();
    const onSelect = jest.fn();
    render({
      terminalId: 'shape-terminal-1',
      shape: { id: 'shape-terminal-1', label: 'Terminal' },
      bounds: { x: 0, y: 0, width: 400, height: 300 },
      onClose: jest.fn(),
      onMove,
      onSelect,
    });

    const closeBtn = container.querySelector('[data-testid="canvas-terminal-close"]');
    // mousedown on the close button must stopPropagation so the
    // header's drag handler (the one returned by usePizarraSurfaceDrag)
    // never receives the event.
    flushSync(() => {
      closeBtn.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });
    flushSync(() => {
      closeBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    // usePizarraSurfaceDrag calls onSelect synchronously when its
    // mousedown handler fires. If the close button's stopPropagation
    // failed, that handler would have run, calling onSelect. We assert
    // it stayed idle.
    expect(onSelect).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });
});
