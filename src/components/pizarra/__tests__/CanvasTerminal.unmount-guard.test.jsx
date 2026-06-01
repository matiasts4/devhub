/**
 * CanvasTerminal re-render stability — close-on-unmount guard.
 *
 * Regression repro for pizarra-add-terminal-bugfix. The previous
 * implementation used `useEffect(() => { return () => onClose?.(); }, [onClose])`
 * which fires the cleanup on EVERY re-render (because the parent rebuilds
 * the onClose closure on every state change). In the live surface layer
 * each re-render of PizarraPane rebuilds the onClose arrow, so
 * CanvasTerminal's cleanup dispatches DELETE_ELEMENT for the existing
 * terminal the next time the parent re-renders.
 *
 * The user-visible symptom: clicking "Add Terminal" adds a terminal,
 * but the next parent re-render (e.g., another add, a pan, a zoom)
 * wipes it out — the user sees the click "do nothing".
 *
 * This test pins the contract: onClose MUST only fire on real unmount,
 * not on prop re-render.
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

describe('CanvasTerminal — pizarra-add-terminal-bugfix re-render stability', () => {
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

  function renderWith(props) {
    const { default: CanvasTerminal } = require('../CanvasTerminal');
    flushSync(() => root.render(React.createElement(CanvasTerminal, props)));
  }

  it('does NOT call onClose when re-rendered with a new onClose closure (only on real unmount)', () => {
    const onCloseFirst = jest.fn();
    const onCloseSecond = jest.fn();

    const { default: CanvasTerminal } = require('../CanvasTerminal');

    // First render: mount the terminal with onCloseFirst.
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

    // Re-render: parent state changed (e.g., a sibling was added),
    // so the parent rebuilt the onClose closure. The terminal itself
    // did not unmount; the new closure is just a new arrow with the
    // same semantic. CanvasTerminal must NOT call onClose on this
    // re-render — the cleanup is reserved for real unmounts.
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

  it('calls onClose exactly once on real unmount even after re-renders', () => {
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
    // Re-render with the same id but a fresh closure (no semantic change).
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
    // Real unmount.
    flushSync(() => root.unmount());

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
