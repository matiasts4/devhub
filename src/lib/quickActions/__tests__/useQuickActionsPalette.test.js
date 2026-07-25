/**
 * @jest-environment node
 *
 * useQuickActionsPalette — export + keyboard shortcut contract.
 *
 * Mirrors the source-level approach of commandBar/__tests__/useCommandBar.test.js:
 * the hook is a thin wrapper over React state + a document keydown listener, so
 * we assert the exported shape and that the Ctrl+Shift+P / Cmd+Shift+P shortcut
 * logic is present in the source.
 */

const path = require('path');
const fs = require('fs');

const MODULE_PATH = path.resolve(__dirname, '../useQuickActionsPalette.js');

describe('useQuickActionsPalette', () => {
  test('exports useQuickActionsPalette function', () => {
    const { useQuickActionsPalette } = require('../useQuickActionsPalette');
    expect(typeof useQuickActionsPalette).toBe('function');
  });

  test('registers the Ctrl+Shift+P / Cmd+Shift+P shortcut', () => {
    const source = fs.readFileSync(MODULE_PATH, 'utf-8');

    // Checks for the "P" key (both cases, since Shift may produce "P").
    expect(source).toContain("e.key === 'P'");
    // Requires the Shift modifier...
    expect(source).toContain('e.shiftKey');
    // ...and either Cmd (Mac) or Ctrl (Windows/Linux).
    expect(source).toContain('e.metaKey');
    expect(source).toContain('e.ctrlKey');
  });

  test('uses React state + effect and cleans up the listener', () => {
    const source = fs.readFileSync(MODULE_PATH, 'utf-8');

    expect(source).toContain('useState');
    expect(source).toContain('useCallback');
    expect(source).toContain('useEffect');
    expect(source).toContain('addEventListener');
    expect(source).toContain('removeEventListener');
  });

  test('prevents default browser behavior for the shortcut', () => {
    const source = fs.readFileSync(MODULE_PATH, 'utf-8');
    expect(source).toContain('e.preventDefault');
  });
});
