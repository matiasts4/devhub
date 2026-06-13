const { buildPanelHeaderDisplay } = require('../panelHeaderDisplay');

describe('buildPanelHeaderDisplay', () => {
  test('prefers pool displayName over generic Terminal fallback', () => {
    const result = buildPanelHeaderDisplay('Chase', {
      source: 'fallback',
      primary: 'Terminal',
      secondary: 'npm test',
      fullText: 'Terminal · npm test',
    });
    expect(result.primary).toBe('Chase');
    expect(result.secondary).toBe('npm test');
  });

  test('keeps semantic metadata when label is a raw panel id', () => {
    const meta = { primary: 'OpenCode', secondary: null, fullText: 'OpenCode' };
    expect(buildPanelHeaderDisplay('p2', meta)).toBe(meta);
  });
});
