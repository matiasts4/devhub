const {
  getTerminalAppShellStyle,
  getTerminalTitleBarStyle,
  getTerminalFloatingControlStyle,
  getTerminalViewportFrameStyle,
  getTerminalPanelBodyStyle,
  getTerminalPanelHeaderStyle,
  getTerminalGridShellStyle,
  getWorkspaceTopBarStyle,
  getWorkspaceTabChromeStyle,
  getWorkspaceShellChromeStyle,
} = require('../terminal/terminalChromeStyles.js');

describe('terminalChromeStyles', () => {
  test('tokenizes terminal app shell wrappers through terminal chrome vars with morphology fallback', () => {
    expect(getTerminalAppShellStyle()).toEqual(
      expect.objectContaining({
        background: 'var(--chrome-panel-fill)',
        borderColor: 'var(--terminal-chrome-border-color, var(--chrome-border-color))',
        borderWidth: 'var(--terminal-chrome-border-width, var(--chrome-border-width))',
        boxShadow: 'var(--terminal-chrome-shadow-panel, var(--chrome-shadow-panel))',
      })
    );
  });

  test('tokenizes terminal title bars without dark hardcoded fills', () => {
    const style = getTerminalTitleBarStyle();

    expect(style.background).toContain('var(--terminal-header-bg)');
    expect(style.borderBottomColor).toBe(
      'var(--terminal-chrome-border-color, var(--chrome-border-color))'
    );
    expect(JSON.stringify(style)).not.toContain('#212121');
    expect(JSON.stringify(style)).not.toContain('#2a2a2a');
  });

  test('keeps floating control chrome on shared control tokens', () => {
    const active = getTerminalFloatingControlStyle({ active: true });
    const idle = getTerminalFloatingControlStyle({ active: false });

    expect(active.borderColor).toBe('var(--chrome-border-color)');
    expect(active.borderWidth).toBe('var(--chrome-border-width)');
    expect(active.boxShadow).toBe('var(--chrome-shadow-control)');
    expect(active.background).toContain('var(--chrome-panel-fill-emphasis)');
    expect(idle.background).toContain('var(--chrome-panel-fill)');
    expect(JSON.stringify(active)).not.toContain('#0d1320');
  });

  test('keeps viewport framing tokenized while preserving geometry-neutral shell contract', () => {
    const style = getTerminalViewportFrameStyle();

    expect(style.background).toBe('var(--chrome-panel-fill)');
    expect(style.borderColor).toBe(
      'var(--terminal-chrome-border-color, var(--chrome-border-color))'
    );
    expect(style.borderWidth).toBe(
      'var(--terminal-chrome-border-width, var(--chrome-border-width))'
    );
  });

  test('routes terminal panel bodies through terminal chrome vars instead of workspace chrome', () => {
    const style = getTerminalPanelBodyStyle({ withBackground: false });

    expect(style.background).toBeUndefined();
    expect(style.borderColor).toBe(
      'var(--terminal-chrome-border-color, var(--chrome-border-color))'
    );
    expect(style.borderWidth).toBe(
      'var(--terminal-chrome-border-width, var(--chrome-border-width))'
    );
    expect(style.boxShadow).toBe('var(--terminal-chrome-shadow-panel, var(--chrome-shadow-panel))');
  });

  test('adds a delicate panel header divider without restoring heavy terminal frames', () => {
    expect(getTerminalPanelHeaderStyle()).toEqual({
      borderBottomColor: 'var(--terminal-header-divider-color, var(--border-subtle))',
      borderBottomWidth: 'var(--terminal-header-divider-width, 1px)',
      borderBottomStyle: 'solid',
    });
  });

  test('balances workspace top bar delimiter separately from panel chrome', () => {
    expect(getWorkspaceTopBarStyle()).toEqual({
      borderBottomColor: 'var(--terminal-workspace-bar-border-color, var(--border-subtle))',
      borderBottomWidth: 'var(--terminal-workspace-bar-border-width, 1px)',
      borderBottomStyle: 'solid',
    });
  });

  test('keeps terminal grid shell border width morphology-aware', () => {
    expect(getTerminalGridShellStyle()).toEqual({
      borderColor: 'var(--terminal-chrome-border-color, var(--border-subtle))',
      borderWidth: 'var(--terminal-grid-border-width, 1px)',
      borderStyle: 'solid',
    });
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
