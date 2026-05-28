export function getTerminalAppShellStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getTerminalTitleBarStyle() {
  return {
    background:
      'linear-gradient(180deg, var(--chrome-panel-fill-emphasis), var(--chrome-panel-fill))',
    borderBottomColor: 'var(--chrome-border-color)',
    borderBottomWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
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
