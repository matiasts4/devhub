/**
 * Unit tests for Sidebar pure logic — sidebar-ux-improvements
 *
 * Per Extract-Before-Mock rule: tests target pure functions exported
 * from Sidebar.jsx, not the full component render.
 *
 * Functions under test:
 *   - getNavItemClasses(collapsed, isActive) → string
 *   - getCollapsedWidth()                   → string
 */

const { getNavItemClasses, getCollapsedWidth } = require('../sidebarUtils.js');

describe('Sidebar nav item classes', () => {
  describe('getNavItemClasses()', () => {
    test('collapsed + active: contains justify-center and accent-token driven active styling', () => {
      const cls = getNavItemClasses(true, true);
      expect(cls).toContain('justify-center');
      expect(cls).toContain('var(--accent-primary)');
      expect(cls).toContain('shadow-[0_10px_20px_rgba(0,0,0,0.16)]');
    });

    test('collapsed + inactive: contains justify-center and no accent-token active border', () => {
      const cls = getNavItemClasses(true, false);
      expect(cls).toContain('justify-center');
      expect(cls).not.toContain('var(--accent-primary)');
    });

    test('expanded + active: contains gap-3 and accent-token driven active styling', () => {
      const cls = getNavItemClasses(false, true);
      expect(cls).toContain('gap-3');
      expect(cls).toContain('var(--accent-primary)');
      expect(cls).toContain(
        'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent-primary)_16%,transparent),rgba(255,255,255,0.05))]'
      );
    });

    test('expanded + inactive: contains gap-3, no accent-token active style', () => {
      const cls = getNavItemClasses(false, false);
      expect(cls).toContain('gap-3');
      expect(cls).not.toContain('var(--accent-primary)');
    });
  });

  describe('getCollapsedWidth()', () => {
    test('returns w-12 for collapsed sidebar (48px, tighter than w-16)', () => {
      // w-12 = 48px. Previous was w-16 = 64px. Smaller collapsed state.
      expect(getCollapsedWidth()).toBe('w-12');
    });
  });
});
