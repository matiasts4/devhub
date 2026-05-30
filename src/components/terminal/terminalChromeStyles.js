export function getTerminalAppShellStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
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
      borderBottomColor: 'var(--chrome-border-color)',
      borderBottomWidth: 'var(--chrome-border-width)',
      boxShadow: 'var(--chrome-shadow-panel)',
    };
  }
  // minimal and plain both use flat solid background
  return {
    background: 'var(--terminal-header-bg)',
    borderBottomColor: 'var(--chrome-border-color)',
    borderBottomWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
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

export function getTerminalViewportFrameStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
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
