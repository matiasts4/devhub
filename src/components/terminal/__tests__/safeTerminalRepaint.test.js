/**
 * @jest-environment jsdom
 */

const {
  safeTerminalRepaint,
  isTerminalRendererReady,
} = require('../TerminalTTY.helpers.js');

function makeTerm({ ready = true, throwOnRefresh = false } = {}) {
  const term = {
    cols: 80,
    rows: 24,
    refresh: jest.fn(() => {
      if (throwOnRefresh) {
        const err = new Error("Cannot read properties of undefined (reading 'dimensions')");
        throw err;
      }
    }),
    resize: jest.fn(),
    clearTextureAtlas: jest.fn(),
    _core: {
      _isDisposed: false,
      _renderService: ready
        ? {
            _renderer: { value: {} },
            dimensions: { css: { cell: { width: 8, height: 16 } } },
            clear: jest.fn(),
          }
        : { _renderer: { value: null } },
      viewport: {},
    },
    element: { isConnected: true },
  };
  return term;
}

describe('safeTerminalRepaint', () => {
  test('returns false for null term', () => {
    expect(safeTerminalRepaint(null)).toBe(false);
  });

  test('returns false when renderer not ready', () => {
    const term = makeTerm({ ready: false });
    expect(isTerminalRendererReady(term)).toBe(false);
    expect(safeTerminalRepaint(term, { force: true })).toBe(false);
  });

  test('soft force refreshes without throwing', () => {
    const term = makeTerm({ ready: true });
    expect(safeTerminalRepaint(term, { force: true, soft: true, clearAtlas: false })).toBe(true);
    expect(term.refresh).toHaveBeenCalled();
  });

  test('swallows stale dimensions errors', () => {
    const term = makeTerm({ ready: true, throwOnRefresh: true });
    expect(() => safeTerminalRepaint(term, { force: false })).not.toThrow();
    expect(safeTerminalRepaint(term, { force: false })).toBe(false);
  });
});
