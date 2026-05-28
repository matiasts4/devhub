const {
  getTerminalAppShellStyle,
  getTerminalTitleBarStyle,
  getTerminalFloatingControlStyle,
  getTerminalViewportFrameStyle,
  getWorkspaceTabChromeStyle,
  getWorkspaceShellChromeStyle,
} = require('../terminal/terminalChromeStyles.js');

describe('terminalChromeStyles', () => {
  test('tokenizes terminal app shell wrappers through shared chrome vars', () => {
    expect(getTerminalAppShellStyle()).toEqual(
      expect.objectContaining({
        background: 'var(--chrome-panel-fill)',
        borderColor: 'var(--chrome-border-color)',
        borderWidth: 'var(--chrome-border-width)',
        boxShadow: 'var(--chrome-shadow-panel)',
      })
    );
  });

  test('tokenizes terminal title bars without dark hardcoded fills', () => {
    const style = getTerminalTitleBarStyle();

    expect(style.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(style.borderBottomColor).toBe('var(--chrome-border-color)');
    expect(JSON.stringify(style)).not.toContain('#212121');
    expect(JSON.stringify(style)).not.toContain('#2a2a2a');
  });

  test('keeps floating control chrome on shared control tokens', () => {
    const active = getTerminalFloatingControlStyle({ active: true });
    const idle = getTerminalFloatingControlStyle({ active: false });

    expect(active.borderColor).toBe('var(--chrome-border-color)');
    expect(active.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(idle.background).toContain('var(--chrome-panel-fill)');
    expect(JSON.stringify(active)).not.toContain('#0d1320');
  });

  test('keeps viewport framing tokenized while preserving geometry-neutral shell contract', () => {
    const style = getTerminalViewportFrameStyle();

    expect(style.background).toBe('var(--chrome-panel-fill)');
    expect(style.borderColor).toBe('var(--chrome-border-color)');
    expect(style.borderWidth).toBe('var(--chrome-border-width)');
  });

  test('resolves workspace tabs from chrome tokens while keeping accent as a color concern', () => {
    const active = getWorkspaceTabChromeStyle({ active: true, dragOver: false });
    const dragOver = getWorkspaceTabChromeStyle({ active: false, dragOver: true });

    expect(active.borderColor).toBe('var(--chrome-border-color)');
    expect(active.background).toContain('var(--chrome-control-fill)');
    expect(active.boxShadow).toContain('var(--chrome-shadow-control)');
    expect(dragOver.background).toContain('var(--chrome-control-fill-hover)');
    expect(JSON.stringify(active)).not.toContain('#58A6FF');
  });

  test('resolves workspace shell framing from shared morphology tokens', () => {
    const style = getWorkspaceShellChromeStyle();

    expect(style.background).toBe('var(--chrome-panel-fill)');
    expect(style.borderColor).toBe('var(--chrome-border-color)');
    expect(style.borderWidth).toBe('var(--chrome-border-width)');
  });

  test('can keep workspace split framing without flattening nested panel backgrounds', () => {
    const style = getWorkspaceShellChromeStyle({ withBackground: false });

    expect(style.background).toBeUndefined();
    expect(style.borderColor).toBe('var(--chrome-border-color)');
    expect(style.borderWidth).toBe('var(--chrome-border-width)');
    expect(style.boxShadow).toBe('var(--chrome-shadow-panel)');
  });
});
