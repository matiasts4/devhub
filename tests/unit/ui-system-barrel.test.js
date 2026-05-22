const system = require('../../src/components/ui/system');

describe('ui/system barrel export', () => {
  test('re-exports UiShell', () => {
    expect(system.UiShell).toBeDefined();
    expect(typeof system.UiShell).toBe('function');
  });

  test('re-exports UiHeader', () => {
    expect(system.UiHeader).toBeDefined();
    expect(typeof system.UiHeader).toBe('function');
  });

  test('re-exports token enums', () => {
    expect(system.DENSITY).toBeDefined();
    expect(system.FONT_FAMILY).toBeDefined();
    expect(system.FONT_SCALE).toBeDefined();
    expect(system.UI_TOKENS).toBeDefined();
  });
});
