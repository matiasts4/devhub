/**
 * CanvasTerminal unit tests.
 * Tests zoom propagation, VTE renderer fallback, and resize callback.
 * Mirrors the JSDOM + createRoot pattern used in TerminalTTY.test.js.
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
      rows: 24, cols: 80, loadAddon: jest.fn(), open: jest.fn(),
      onData: jest.fn(), focus: jest.fn(), write: jest.fn(), writeln: jest.fn(),
      paste: jest.fn(), refresh: jest.fn(), clearTextureAtlas: jest.fn(),
      dispose: jest.fn(), getSelection: jest.fn(() => ''), clear: jest.fn(),
      scrollToLine: jest.fn(),
    })),
  }),
  { virtual: true }
);

jest.mock('xterm-addon-fit', () => ({
  FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })),
}), { virtual: true });

jest.mock('xterm-addon-search', () => ({
  SearchAddon: jest.fn().mockImplementation(() => ({
    findNext: jest.fn(), findPrevious: jest.fn(),
  })),
}), { virtual: true });

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

  // ── VTE renderer fallback warning ──────────────────────────────────────
  describe('VTE renderer fallback warning', () => {
    it('emits console.warn on every render (CanvasTerminal always overrides to xterm)', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { default: CanvasTerminal } = require('../CanvasTerminal');
      render(React.createElement(CanvasTerminal, {
        terminalId: 't1',
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
        canvasZoom: 1,
      }));
      expect(warnSpy).toHaveBeenCalledWith(
        'Canvas terminals do not support VTE renderer. Falling back to xterm.'
      );
      warnSpy.mockRestore();
    });
  });

  // ── Props passthrough ───────────────────────────────────────────────────
  describe('props passthrough to TerminalTTY', () => {
    it('passes requestedRendererMode="xterm" to TerminalTTY regardless of any prop', () => {
      const { default: CanvasTerminal } = require('../CanvasTerminal');
      render(React.createElement(CanvasTerminal, {
        terminalId: 'my-session-1',
        position: { x: 100, y: 200 },
        size: { width: 640, height: 480 },
        canvasZoom: 1.5,
        cwd: '/home/user',
        initialCommand: 'ls -la',
        autoFocus: false,
      }));

      expect(mockTerminalTTY).toHaveBeenCalledTimes(1);
      expect(capturedProps.requestedRendererMode).toBe('xterm');
      expect(capturedProps.hideTitleBar).toBe(true);
      expect(capturedProps.id).toBe('my-session-1');
      expect(capturedProps.cwd).toBe('/home/user');
      expect(capturedProps.initialCommand).toBe('ls -la');
      expect(capturedProps.autoFocus).toBe(false);
      expect(capturedProps.showQuickCopyButton).toBe(false);
    });

    it('passes externalDimensionSource function to TerminalTTY', () => {
      const { default: CanvasTerminal } = require('../CanvasTerminal');
      render(React.createElement(CanvasTerminal, {
        terminalId: 't1',
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
        canvasZoom: 2,
      }));

      expect(capturedProps.externalDimensionSource).toEqual(expect.any(Function));
    });

    it('calls onClose callback on component unmount', () => {
      const onClose = jest.fn();
      const { default: CanvasTerminal } = require('../CanvasTerminal');
      render(React.createElement(CanvasTerminal, {
        terminalId: 't1',
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
        canvasZoom: 1,
        onClose,
      }));
      flushSync(() => root.unmount());
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('propagates PTY-driven resize via onResize callback to parent', () => {
      const onResize = jest.fn();
      const { default: CanvasTerminal } = require('../CanvasTerminal');
      render(React.createElement(CanvasTerminal, {
        terminalId: 't1',
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
        canvasZoom: 1,
        onResize,
      }));

      expect(capturedProps.onResize).toEqual(expect.any(Function));

      // Simulate PTY-driven resize from terminal
      flushSync(() => {
        capturedProps.onResize({ width: 1024, height: 768 });
      });
      expect(onResize).toHaveBeenCalledWith({ width: 1024, height: 768 });
    });
  });

  // ── Zoom propagation ────────────────────────────────────────────────────
  describe('zoom propagation via container style.width/height', () => {
    it('sets container style.width = size.width * zoom via requestAnimationFrame', () => {
      jest.useFakeTimers();
      const { default: CanvasTerminal } = require('../CanvasTerminal');

      render(React.createElement(CanvasTerminal, {
        terminalId: 't1',
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        canvasZoom: 2,
      }));

      // RAF hasn't fired yet
      const domContainer = document.querySelector('[data-testid="canvas-terminal-container"]');
      expect(domContainer.style.width).toBe('');

      // Advance timers to fire RAF
      jest.runAllTimers();

      // After RAF: style.width = logicalWidth * zoom = 400 * 2 = 800
      expect(domContainer.style.width).toBe('800px');
      expect(domContainer.style.height).toBe('600px');

      jest.useRealTimers();
    });

    it('debounces rapid zoom changes — RAF fires once with the final value', () => {
      jest.useFakeTimers();
      const { default: CanvasTerminal } = require('../CanvasTerminal');

      render(React.createElement(CanvasTerminal, {
        terminalId: 't1',
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        canvasZoom: 1,
      }));

      // Rapid zoom changes before RAF fires
      render(React.createElement(CanvasTerminal, {
        terminalId: 't1',
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        canvasZoom: 2,
      }));
      render(React.createElement(CanvasTerminal, {
        terminalId: 't1',
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        canvasZoom: 3,
      }));

      jest.runAllTimers();

      const domContainer = document.querySelector('[data-testid="canvas-terminal-container"]');
      // RAF fires once with latest zoom (3), not per-change
      expect(domContainer.style.width).toBe('1200px');  // 400 * 3
      expect(domContainer.style.height).toBe('900px'); // 300 * 3

      jest.useRealTimers();
    });

    it('uses logicalSize from state (PTY-driven) not prop size after resize', () => {
      jest.useFakeTimers();
      const { default: CanvasTerminal } = require('../CanvasTerminal');
      const onResize = jest.fn();

      render(React.createElement(CanvasTerminal, {
        terminalId: 't1',
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        canvasZoom: 1,
        onResize,
      }));

      // Simulate PTY-driven resize
      flushSync(() => {
        capturedProps.onResize({ width: 1024, height: 768 });
      });
      expect(onResize).toHaveBeenCalledWith({ width: 1024, height: 768 });

      // Now zoom changes — container uses NEW logicalSize from state (1024×768)
      render(React.createElement(CanvasTerminal, {
        terminalId: 't1',
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 }, // prop still old
        canvasZoom: 2,
        onResize,
      }));

      jest.runAllTimers();

      const domContainer = document.querySelector('[data-testid="canvas-terminal-container"]');
      // Container uses logicalSize state (1024×768), NOT the prop size (400×300)
      expect(domContainer.style.width).toBe('2048px');  // 1024 * 2
      expect(domContainer.style.height).toBe('1536px'); // 768 * 2

      jest.useRealTimers();
    });
  });
});
