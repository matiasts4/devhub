export function getWorkspacePageShellStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    color: 'var(--text-primary)',
  };
}

export function getWorkspacePageContentStyle() {
  return {
    width: '100%',
    maxWidth: 'none',
    padding: '24px 28px 40px',
  };
}

export function getWorkspacePageHeaderStyle() {
  return {
    background: 'var(--chrome-panel-fill-emphasis)',
    borderBottomColor: 'var(--chrome-border-color)',
    borderBottomWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getWorkspaceBreadcrumbStyle() {
  return {
    background: 'var(--chrome-control-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-control)',
  };
}

export function getWorkspaceSectionSurfaceStyle({ emphasized = false } = {}) {
  return {
    background: emphasized ? 'var(--chrome-panel-fill-emphasis)' : 'var(--chrome-panel-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getWorkspaceSectionHeaderStripStyle({ tone = 'neutral' } = {}) {
  const bg =
    tone === 'accent'
      ? 'color-mix(in srgb, var(--accent-primary) 28%, var(--chrome-panel-fill-emphasis))'
      : 'var(--chrome-panel-fill-emphasis)';

  return {
    background: bg,
    borderBottomColor: 'var(--chrome-border-color)',
    borderBottomWidth: 'var(--chrome-border-width)',
  };
}

export function getWorkspaceDataTileStyle(color = 'var(--accent-primary)') {
  return {
    background: 'var(--chrome-panel-fill)',
    borderColor: `color-mix(in srgb, ${color} 24%, var(--chrome-border-color))`,
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}

export function getWorkspaceStatusPillStyle({ tone = 'neutral' } = {}) {
  return {
    background:
      tone === 'accent'
        ? 'color-mix(in srgb, var(--accent-primary) 18%, var(--chrome-control-fill-hover))'
        : 'var(--chrome-control-fill)',
    borderColor:
      tone === 'accent'
        ? 'color-mix(in srgb, var(--accent-primary) 30%, var(--chrome-border-color))'
        : 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-control)',
  };
}

export function getWorkspaceFilterBarStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
  };
}
