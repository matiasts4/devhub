// Stub the tailwind plugin so loading tailwind.config.js outside of the
// PostCSS pipeline doesn't fail on a Node-side require() of an ESM package.
jest.mock('tailwindcss-animate', () => ({ __esModule: true, default: {} }), { virtual: true });

const config = require('../../../tailwind.config.js');

describe('tailwind accent namespace split (FR-D06)', () => {
  test('tailwind config exposes shadcn.accent and accent.primary independently', () => {
    expect(config.theme.extend.colors.shadcn).toBeDefined();
    expect(config.theme.extend.colors.shadcn.accent).toBeDefined();
    expect(config.theme.extend.colors.accent.primary).toBe('var(--accent-primary)');
  });

  test('semantic accent namespace still exposes secondary', () => {
    expect(config.theme.extend.colors.accent.secondary).toBe('var(--accent-secondary)');
  });

  test('shadcn.accent resolves to the HSL channel that powers shadcn imports', () => {
    expect(config.theme.extend.colors.shadcn.accent).toBe('hsl(var(--accent))');
    expect(config.theme.extend.colors.shadcn['accent-foreground']).toBe(
      'hsl(var(--accent-foreground))'
    );
  });
});
