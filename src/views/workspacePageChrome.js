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

// ---------------------------------------------------------------------------
// SDD Phase order (all 6 SDD phases)
// ---------------------------------------------------------------------------

export const SDD_PHASES = [
  'sdd-explore',
  'sdd-propose',
  'sdd-spec',
  'sdd-design',
  'sdd-tasks',
  'sdd-apply',
  'sdd-verify',
  'sdd-archive',
];

export const PHASE_LABELS = {
  'sdd-explore': 'Explore',
  'sdd-propose': 'Propose',
  'sdd-spec': 'Spec',
  'sdd-design': 'Design',
  'sdd-tasks': 'Tasks',
  'sdd-apply': 'Apply',
  'sdd-verify': 'Verify',
  'sdd-archive': 'Archive',
};

// ---------------------------------------------------------------------------
// SDD Phase Timeline styles
// ---------------------------------------------------------------------------

export function getPhaseTimelineStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
    borderRadius: 'var(--radius-md)',
  };
}

export function getPhaseTimelineItemStyle({ active = false, completed = false } = {}) {
  const base = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  };

  if (active) {
    return {
      ...base,
      background: 'color-mix(in srgb, var(--accent-primary) 15%, var(--chrome-panel-fill))',
      color: 'var(--accent-primary)',
      border: '1px solid color-mix(in srgb, var(--accent-primary) 40%, var(--chrome-border-color))',
    };
  }

  if (completed) {
    return {
      ...base,
      background: 'color-mix(in srgb, var(--accent-green) 10%, var(--chrome-panel-fill))',
      color: 'var(--accent-green)',
      border: '1px solid color-mix(in srgb, var(--accent-green) 30%, var(--chrome-border-color))',
    };
  }

  return {
    ...base,
    background: 'var(--chrome-panel-fill)',
    color: 'var(--text-muted)',
    border: '1px solid var(--chrome-border-color)',
  };
}

// ---------------------------------------------------------------------------
// SDD Artifact List styles
// ---------------------------------------------------------------------------

export function getArtifactListStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    borderColor: 'var(--chrome-border-color)',
    borderWidth: 'var(--chrome-border-width)',
    boxShadow: 'var(--chrome-shadow-panel)',
    borderRadius: 'var(--radius-md)',
  };
}

export function getArtifactItemStyle({ artifactType } = {}) {
  const typeColors = {
    proposal: { color: 'var(--accent-cyan)', bg: 'color-mix(in srgb, var(--accent-cyan) 8%, var(--chrome-panel-fill))' },
    spec: { color: 'var(--accent-cyan)', bg: 'color-mix(in srgb, var(--accent-cyan) 8%, var(--chrome-panel-fill))' },
    design: { color: 'var(--accent-indigo)', bg: 'color-mix(in srgb, var(--accent-indigo) 8%, var(--chrome-panel-fill))' },
    tasks: { color: 'var(--accent-purple)', bg: 'color-mix(in srgb, var(--accent-purple) 8%, var(--chrome-panel-fill))' },
    apply: { color: 'var(--accent-emerald)', bg: 'color-mix(in srgb, var(--accent-emerald) 8%, var(--chrome-panel-fill))' },
    verify: { color: 'var(--accent-amber)', bg: 'color-mix(in srgb, var(--accent-amber) 8%, var(--chrome-panel-fill))' },
    archive: { color: 'var(--text-muted)', bg: 'var(--chrome-panel-fill)' },
  };

  const colors = typeColors[artifactType] || typeColors.apply;

  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderRadius: '6px',
    background: colors.bg,
    border: `1px solid color-mix(in srgb, ${colors.color} 25%, var(--chrome-border-color))`,
    gap: '10px',
  };
}
