const TERMINAL_BORDER_WIDTH = 'var(--terminal-chrome-border-width, var(--chrome-border-width))';
const TERMINAL_BORDER_COLOR = 'var(--terminal-chrome-border-color, var(--chrome-border-color))';
const TERMINAL_SHADOW_PANEL = 'var(--terminal-chrome-shadow-panel, var(--chrome-shadow-panel))';
export function getTerminalAppShellStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    borderColor: TERMINAL_BORDER_COLOR,
    borderWidth: TERMINAL_BORDER_WIDTH,
    boxShadow: TERMINAL_SHADOW_PANEL,
  };
}

/**
 * Returns the title bar style based on the header style.
 * Uses --terminal-header-* CSS vars when available (set by setTerminalChromeVars).
 *
 * @param {{ headerStyle?: 'dragon'|'minimal'|'gradient'|'plain' }} opts
 * @returns {object} Style object for the title bar element
 */
export function getTerminalTitleBarStyle({ headerStyle } = {}) {
  // When headerStyle is set, use the CSS var driven by buildTerminalChromeVars.
  // When headerStyle is absent, fall back to the original gradient background.
  if (headerStyle === 'dragon' || headerStyle === 'gradient') {
    return {
      background: 'var(--terminal-header-gradient)',
      borderBottomColor: TERMINAL_BORDER_COLOR,
      borderBottomWidth: TERMINAL_BORDER_WIDTH,
      boxShadow: TERMINAL_SHADOW_PANEL,
    };
  }
  // minimal and plain both use flat solid background
  return {
    background: 'var(--terminal-header-bg)',
    borderBottomColor: TERMINAL_BORDER_COLOR,
    borderBottomWidth: TERMINAL_BORDER_WIDTH,
    boxShadow: TERMINAL_SHADOW_PANEL,
  };
}

/**
 * Returns the accent bar style (visibility + color).
 * Dragon style shows the accent bar; all others hide it.
 *
 * @param {{ headerStyle?: 'dragon'|'minimal'|'gradient'|'plain' }} opts
 * @returns {{ visible: boolean, color: string }}
 */
export function getTerminalAccentBarStyle({ headerStyle } = {}) {
  if (headerStyle === 'dragon') {
    return {
      visible: true,
      color: 'var(--terminal-accent-bar)',
    };
  }
  return {
    visible: false,
    color: 'transparent',
  };
}

export function getTerminalFloatingControlStyle({ active = false } = {}) {
  return {
    background: active ? 'var(--chrome-panel-fill-emphasis)' : 'var(--chrome-panel-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-control)',
    backdropFilter: 'blur(14px)',
  };
}

export function getTerminalPanelHeaderStyle() {
  return {
    borderBottomColor: 'var(--terminal-header-divider-color, var(--border-subtle))',
    borderBottomWidth: 'var(--terminal-header-divider-width, 1px)',
    borderBottomStyle: 'solid',
  };
}

export function getWorkspaceTopBarStyle() {
  return {
    borderBottomColor: 'var(--terminal-workspace-bar-border-color, var(--border-subtle))',
    borderBottomWidth: 'var(--terminal-workspace-bar-border-width, 1px)',
    borderBottomStyle: 'solid',
  };
}

export function getTerminalViewportFrameStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    borderColor: TERMINAL_BORDER_COLOR,
    borderWidth: TERMINAL_BORDER_WIDTH,
  };
}

export function getTerminalPanelBodyStyle({ withBackground = true } = {}) {
  return {
    ...(withBackground ? { background: 'var(--chrome-panel-fill)' } : {}),
    borderColor: TERMINAL_BORDER_COLOR,
    borderWidth: TERMINAL_BORDER_WIDTH,
    boxShadow: TERMINAL_SHADOW_PANEL,
  };
}

export function getTerminalGridShellStyle() {
  return {
    borderColor: 'var(--terminal-chrome-border-color, var(--border-subtle))',
    borderWidth: 'var(--terminal-grid-border-width, 1px)',
    borderStyle: 'solid',
  };
}

export function getWorkspaceTabChromeStyle({ active = false, dragOver = false } = {}) {
  return {
    background: active
      ? 'linear-gradient(135deg, var(--chrome-control-fill-hover), var(--chrome-control-fill))'
      : dragOver
        ? 'var(--chrome-control-fill-hover)'
        : 'transparent',
    borderColor: active || dragOver ? 'var(--chrome-border-color)' : 'transparent',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: active ? 'var(--chrome-shadow-control)' : 'none',
  };
}

export function getWorkspaceShellChromeStyle({ withBackground = true } = {}) {
  return {
    ...(withBackground ? { background: 'var(--chrome-panel-fill)' } : {}),
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}
