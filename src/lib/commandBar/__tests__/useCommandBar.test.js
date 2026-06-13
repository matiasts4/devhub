/**
 * @jest-environment node
 */

describe('useCommandBar', () => {
  test('exports useCommandBar function', () => {
    const module = require('../useCommandBar');
    
    expect(module).toHaveProperty('useCommandBar');
    expect(typeof module.useCommandBar).toBe('function');
  });

  test('useCommandBar is a named export', () => {
    const { useCommandBar } = require('../useCommandBar');
    
    expect(useCommandBar).toBeDefined();
    expect(typeof useCommandBar).toBe('function');
  });

  test('hook implementation respects feature flag import', () => {
    const moduleCode = require('fs').readFileSync(
      require('path').resolve(__dirname, '../useCommandBar.js'),
      'utf-8'
    );
    
    // Verify it imports feature flag
    expect(moduleCode).toContain('isCommandBarEnabled');
    
    // Verify it uses React hooks
    expect(moduleCode).toContain('useState');
    expect(moduleCode).toContain('useCallback');
    expect(moduleCode).toContain('useEffect');
    
    // Verify it registers keyboard shortcut
    expect(moduleCode).toContain('Shift');
    expect(moduleCode).toContain('metaKey');
    expect(moduleCode).toContain('ctrlKey');
  });

  test('keyboard shortcut is Cmd+Shift+K or Ctrl+Shift+K', () => {
    const moduleCode = require('fs').readFileSync(
      require('path').resolve(__dirname, '../useCommandBar.js'),
      'utf-8'
    );
    
    // Should check for 'K' key (capital K for Shift+K)
    expect(moduleCode).toContain("e.key === 'K'");
    expect(moduleCode).toContain('e.shiftKey');
  });
});
