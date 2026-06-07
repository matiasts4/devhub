/**
 * CanvasTerminal unit tests.
 * Covers the pizarra live terminal host contract: projected bounds,
 * TerminalTTY passthrough, and overlay selection behavior.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

// ── Mock all dependencies of CanvasTerminal + TerminalTTY ────────────────
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

// Mock TerminalTTY to capture props (not the full xterm stack)
let capturedProps = {};
const mockTerminalTTY = jest.fn((props) => {
  capturedProps = { ...props };
  return React.createElement('div', { 'data-testid': 'mock-terminal' }, null);
});
jest.mock('@/components/TerminalTTY', () => ({
  __esModule: true,
  default: mockTerminalTTY,
}));

jest.mock('@/components/terminal/components/PanelRendererSelect', () => ({
  __esModule: true,
  default: jest.fn(() =>
    require('react').createElement('div', { 'data-testid': 'mock-renderer-select' })
  ),
}));

describe('CanvasTerminal', () => {
  let container;
  let root;

  beforeEach(() => {
    capturedProps = {};
    jest.clearAllMocks();

    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document;
    global.window = dom.window;
    global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    global.cancelAnimationFrame = (id) => clearTimeout(id);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root = null;
    container = null;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
    jest.restoreAllMocks();
  });

  function render(el) {
    flushSync(() => root.render(el));
  }

  // ── Props passthrough ───────────────────────────────────────────────────
  describe('props passthrough to TerminalTTY', () => {
    it('defaults to the xterm-webgl renderer path used by pizarra', () => {
      const { default: CanvasTerminal } = require('../CanvasTerminal');
      render(
        React.createElement(CanvasTerminal, {
          terminalId: 'my-session-1',
          shape: { id: 'my-session-1', label: 'Terminal' },
          bounds: { x: 100, y: 200, width: 640, height: 480 },
          cwd: '/home/user',
          initialCommand: 'ls -la',
          autoFocus: false,
        })
      );

      expect(mockTerminalTTY).toHaveBeenCalledTimes(1);
      expect(capturedProps.requestedRendererMode).toBe('xterm-webgl');
      expect(capturedProps.hideTitleBar).toBe(true);
      expect(capturedProps.id).toBe('my-session-1');
      expect(capturedProps.cwd).toBe('/home/user');
      expect(capturedProps.initialCommand).toBe('ls -la');
      expect(capturedProps.autoFocus).toBe(false);
      expect(capturedProps.showQuickCopyButton).toBe(false);
      expect(capturedProps.isVisibleInLayout).toBe(true);
      expect(capturedProps.isActivePanel).toBe(false);
    });

    it('forwards explicit active ownership to TerminalTTY', () => {
      const { default: CanvasTerminal } = require('../CanvasTerminal');
      render(
        React.createElement(CanvasTerminal, {
          terminalId: 'my-session-1',
          bounds: { x: 0, y: 0, width: 640, height: 480 },
          isActivePanel: true,
        })
      );

      expect(capturedProps.isActivePanel).toBe(true);
    });

    it('forwards the resize callback to TerminalTTY for future canvas sync', () => {
      const { default: CanvasTerminal } = require('../CanvasTerminal');
      render(
        React.createElement(CanvasTerminal, {
          terminalId: 't1',
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          onResize: jest.fn(),
        })
      );

      expect(capturedProps.onResize).toEqual(expect.any(Function));
    });

    it('does NOT call onClose on unmount (pizarra-fix-strictmode-unmount)', () => {
      // Contract change: onClose used to be called on unmount, but
      // that interacted badly with React.StrictMode in dev (which
      // double-mounts to surface side effects). The artificial
      // unmount fired the cleanup and dispatched DELETE_ELEMENT for
      // the just-added terminal, so the user saw the click "do
      // nothing". The onClose is now reserved for the explicit
      // X-button click only. See CanvasTerminal.unmount-guard.test.jsx
      // for the click contract.
      const onClose = jest.fn();
      const { default: CanvasTerminal } = require('../CanvasTerminal');
      render(
        React.createElement(CanvasTerminal, {
          terminalId: 't1',
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          onClose,
        })
      );
      flushSync(() => root.unmount());
      expect(onClose).not.toHaveBeenCalled();
    });

    it('propagates PTY-driven resize via onResize callback to parent', () => {
      const onResize = jest.fn();
      const { default: CanvasTerminal } = require('../CanvasTerminal');
      render(
        React.createElement(CanvasTerminal, {
          terminalId: 't1',
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          onResize,
        })
      );

      expect(capturedProps.onResize).toEqual(expect.any(Function));

      // Simulate PTY-driven resize from terminal
      flushSync(() => {
        capturedProps.onResize({ width: 1024, height: 768 });
      });
      expect(onResize).toHaveBeenCalledWith({ width: 1024, height: 768 });
    });
  });

  describe('live surface bounds', () => {
    it('positions the host container from projected bounds', () => {
      const { default: CanvasTerminal } = require('../CanvasTerminal');

      render(
        React.createElement(CanvasTerminal, {
          terminalId: 't1',
          shape: { id: 't1', label: 'Ops' },
          bounds: { x: 40, y: 80, width: 400, height: 300 },
        })
      );

      const domContainer = document.querySelector('[data-testid="canvas-terminal-container"]');
      expect(domContainer.style.left).toBe('40px');
      expect(domContainer.style.top).toBe('80px');
      expect(domContainer.style.width).toBe('400px');
      expect(domContainer.style.height).toBe('300px');
    });

    it('supports legacy position/size props when bounds are not provided', () => {
      const { default: CanvasTerminal } = require('../CanvasTerminal');

      render(
        React.createElement(CanvasTerminal, {
          terminalId: 't1',
          position: { x: 12, y: 24 },
          size: { width: 400, height: 300 },
        })
      );

      const domContainer = document.querySelector('[data-testid="canvas-terminal-container"]');
      expect(domContainer.style.left).toBe('12px');
      expect(domContainer.style.top).toBe('24px');
      expect(domContainer.style.width).toBe('400px');
      expect(domContainer.style.height).toBe('300px');
    });

    it('selects the terminal surface and activates the panel on mouse down', () => {
      const onSelect = jest.fn();
      const onActivatePanel = jest.fn();
      const { default: CanvasTerminal } = require('../CanvasTerminal');

      render(
        React.createElement(CanvasTerminal, {
          terminalId: 't1',
          shape: { id: 'shape-terminal-1', label: 'Terminal' },
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          onSelect,
          onActivatePanel,
        })
      );

      const frame = document.querySelector('[data-testid="canvas-terminal-container"] > div');
      flushSync(() => {
        frame.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
      });

      expect(onSelect).toHaveBeenCalledWith('shape-terminal-1');
      expect(onActivatePanel).toHaveBeenCalledWith('t1');
    });

    it('uses the header as a drag handle and emits move deltas', () => {
      const onMove = jest.fn();
      const onSelect = jest.fn();
      const onActivatePanel = jest.fn();
      const { default: CanvasTerminal } = require('../CanvasTerminal');

      render(
        React.createElement(CanvasTerminal, {
          terminalId: 't1',
          shape: { id: 'shape-terminal-1', label: 'Terminal' },
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          onMove,
          onSelect,
          onActivatePanel,
        })
      );

      const header = document.querySelector('[data-testid="canvas-terminal-header"]');
      flushSync(() => {
        header.dispatchEvent(
          new window.MouseEvent('mousedown', {
            bubbles: true,
            button: 0,
            clientX: 10,
            clientY: 20,
          })
        );
      });
      flushSync(() => {
        window.dispatchEvent(
          new window.MouseEvent('mousemove', {
            bubbles: true,
            clientX: 28,
            clientY: 33,
          })
        );
      });
      flushSync(() => {
        window.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
      });

      expect(onSelect).toHaveBeenCalledWith('shape-terminal-1');
      expect(onActivatePanel).toHaveBeenCalledWith('t1');
      expect(onMove).toHaveBeenCalledWith({
        id: 'shape-terminal-1',
        terminalId: 't1',
        deltaX: 18,
        deltaY: 13,
        totalDeltaX: 18,
        totalDeltaY: 13,
      });
    });
  });
});
