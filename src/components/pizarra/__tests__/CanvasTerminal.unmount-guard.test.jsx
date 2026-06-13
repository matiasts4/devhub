/**
 * CanvasTerminal close-button contract.
 *
 * The close callback is ONLY called in response to the user clicking
 * the X button in the header. It is NEVER called on component
 * unmount. The previous implementation (pizarra-add-terminal-bugfix)
 * had a useEffect cleanup that called onClose on unmount; that
 * caused a regression where React.StrictMode's intentional
 * double-mount in dev dispatched DELETE_ELEMENT for the just-added
 * terminal (length went 0 → 1 → 0 immediately).
 *
 * This file pins the new contract:
 *   1. onClose is NOT called when re-rendered with a new onClose
 *      closure (parent rebuilt the arrow but the terminal itself
 *      did not unmount).
 *   2. onClose is NOT called on real unmount (the parent has
 *      already removed the shape from state by then; calling
 *      onClose would dispatch DELETE_ELEMENT for a shape that
 *      no longer exists, causing spurious noise).
 *   3. onClose IS called exactly once when the user clicks the
 *      X button (data-testid="canvas-terminal-close").
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
  'xterm',
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
  'xterm-addon-fit',
  () => ({
    FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })),
  }),
  { virtual: true }
);

jest.mock(
  'xterm-addon-search',
  () => ({
    SearchAddon: jest.fn().mockImplementation(() => ({
      findNext: jest.fn(),
      findPrevious: jest.fn(),
    })),
  }),
  { virtual: true }
);

jest.mock('@/components/TerminalTTY', () => ({
  __esModule: true,
  default: function MockTerminalTTY() {
    return require('react').createElement('div', { 'data-testid': 'mock-terminal' }, null);
  },
}));

jest.mock('@/lib/terminal/nativeVteBridge', () => ({
  resizeNativeVtePanel: jest.fn(() => Promise.resolve()),
}));

describe('CanvasTerminal — close-button contract (no unmount cleanup)', () => {
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
  });

  it('does NOT call onClose when re-rendered with a new onClose closure', () => {
    const onCloseFirst = jest.fn();
    const onCloseSecond = jest.fn();
    const { default: CanvasTerminal } = require('../CanvasTerminal');

    flushSync(() =>
      root.render(
        React.createElement(CanvasTerminal, {
          terminalId: 'shape-terminal-1',
          shape: { id: 'shape-terminal-1', label: 'Terminal' },
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          onClose: onCloseFirst,
        })
      )
    );
    flushSync(() =>
      root.render(
        React.createElement(CanvasTerminal, {
          terminalId: 'shape-terminal-1',
          shape: { id: 'shape-terminal-1', label: 'Terminal' },
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          onClose: onCloseSecond,
        })
      )
    );
    expect(onCloseFirst).not.toHaveBeenCalled();
    expect(onCloseSecond).not.toHaveBeenCalled();
  });

  it('does NOT call onClose on real unmount', () => {
    const onClose = jest.fn();
    const { default: CanvasTerminal } = require('../CanvasTerminal');
    flushSync(() =>
      root.render(
        React.createElement(CanvasTerminal, {
          terminalId: 'shape-terminal-1',
          shape: { id: 'shape-terminal-1', label: 'Terminal' },
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          onClose,
        })
      )
    );
    flushSync(() => root.unmount());
    // The new contract: unmount does NOT call onClose. The parent
    // has already removed the shape from state; calling onClose
    // would dispatch DELETE_ELEMENT for a non-existent id and
    // cause spurious noise (or, in StrictMode dev, would fire on
    // the first artificial unmount and delete the just-added
    // shape).
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose exactly once when the X button is clicked', () => {
    const onClose = jest.fn();
    const { default: CanvasTerminal } = require('../CanvasTerminal');
    flushSync(() =>
      root.render(
        React.createElement(CanvasTerminal, {
          terminalId: 'shape-terminal-1',
          shape: { id: 'shape-terminal-1', label: 'Terminal' },
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          onClose,
        })
      )
    );
    const closeButton = container.querySelector('[data-testid="canvas-terminal-close"]');
    expect(closeButton).toBeTruthy();
    flushSync(() => closeButton.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('shape-terminal-1');
  });
});
