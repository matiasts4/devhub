/**
 * Morphology Chrome System
 *
 * Centralized factory for all UI chrome styles (panels, buttons, cards, inputs, pills, etc.).
 * Every component should import from here instead of defining inline chrome styles.
 *
 * To change the entire app's visual morphology, only edit:
 *   1. CSS variables in globals.css under [data-morphology='...']
 *   2. The factory functions below if adding new chrome types
 *
 * Components never hardcode borders, shadows, or panel fills — they use these factories.
 */

// ─── Panel surfaces ────────────────────────────────────────────────────────

export function panelStyle({ emphasized = false, tone = 'neutral' } = {}) {
  const base = {
    background: emphasized ? 'var(--chrome-panel-fill-emphasis)' : 'var(--chrome-panel-fill)',
    border: `var(--chrome-border-width) solid var(--chrome-border-color)`,
    boxShadow: 'var(--chrome-shadow-panel)',
    borderRadius: 'var(--chrome-radius-panel)',
  };

  if (tone === 'accent') {
    return {
      ...base,
      borderColor: 'var(--accent-primary)',
      boxShadow: 'var(--chrome-shadow-control)',
    };
  }

  if (tone === 'danger') {
    return {
      ...base,
      borderColor: 'color-mix(in srgb, var(--danger) 40%, var(--chrome-border-color))',
    };
  }

  if (tone === 'success') {
    return {
      ...base,
      borderColor: 'color-mix(in srgb, var(--success) 40%, var(--chrome-border-color))',
    };
  }

  return base;
}

export function panelHeaderStripStyle({ tone = 'neutral' } = {}) {
  const bg =
    tone === 'accent'
      ? 'color-mix(in srgb, var(--accent-primary) 18%, var(--chrome-panel-fill-emphasis))'
      : 'var(--chrome-panel-fill-emphasis)';

  return {
    background: bg,
    borderBottom: `var(--chrome-border-width) solid var(--chrome-border-color)`,
  };
}

// ─── Buttons ───────────────────────────────────────────────────────────────

export function btnPrimaryStyle({ size = 'sm' } = {}) {
  const sizeMap = {
    xs: { padding: '0 0.5rem', height: '1.5rem', fontSize: '10px' },
    sm: { padding: '0 0.75rem', height: '2rem', fontSize: '11px' },
    md: { padding: '0 1rem', height: '2.5rem', fontSize: '12px' },
    lg: { padding: '0 1.25rem', height: '3rem', fontSize: '13px' },
  };
  const s = sizeMap[size] || sizeMap.sm;

  return {
    ...s,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    background: 'var(--accent-primary)',
    border: `var(--chrome-border-width) solid var(--accent-primary)`,
    color: '#0d1117',
    boxShadow: '3px 3px 0 0 var(--accent-shadow)',
    borderRadius: '0',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  };
}

export function btnSecondaryStyle({ size = 'sm' } = {}) {
  const sizeMap = {
    xs: { padding: '0 0.5rem', height: '1.5rem', fontSize: '10px' },
    sm: { padding: '0 0.75rem', height: '2rem', fontSize: '11px' },
    md: { padding: '0 1rem', height: '2.5rem', fontSize: '12px' },
    lg: { padding: '0 1.25rem', height: '3rem', fontSize: '13px' },
  };
  const s = sizeMap[size] || sizeMap.sm;

  return {
    ...s,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    background: 'var(--chrome-control-fill)',
    border: `var(--chrome-border-width) solid var(--chrome-border-color)`,
    color: 'var(--text-primary)',
    boxShadow: 'var(--chrome-shadow-control)',
    borderRadius: 'var(--chrome-radius-control)',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  };
}

export function btnDangerStyle({ size = 'sm' } = {}) {
  const sizeMap = {
    xs: { padding: '0 0.5rem', height: '1.5rem', fontSize: '10px' },
    sm: { padding: '0 0.75rem', height: '2rem', fontSize: '11px' },
    md: { padding: '0 1rem', height: '2.5rem', fontSize: '12px' },
    lg: { padding: '0 1.25rem', height: '3rem', fontSize: '13px' },
  };
  const s = sizeMap[size] || sizeMap.sm;

  return {
    ...s,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    background: 'var(--danger)',
    border: `var(--chrome-border-width) solid var(--danger)`,
    color: '#fff',
    boxShadow: '3px 3px 0 0 color-mix(in srgb, var(--danger) 60%, #000)',
    borderRadius: 'var(--chrome-radius-control)',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  };
}

// ─── Pills / badges ────────────────────────────────────────────────────────

export function pillStyle({ tone = 'neutral' } = {}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.125rem 0.5rem',
    fontSize: '10px',
    fontWeight: 700,
    borderRadius: 'var(--chrome-radius-control)',
    background: 'var(--chrome-control-fill)',
    border: `var(--chrome-border-width) solid var(--chrome-border-color)`,
    boxShadow: 'var(--chrome-shadow-control)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  if (tone === 'accent') {
    return {
      ...base,
      background: 'color-mix(in srgb, var(--accent-primary) 18%, var(--chrome-control-fill))',
      borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, var(--chrome-border-color))',
      color: 'var(--accent-primary)',
    };
  }

  if (tone === 'danger') {
    return {
      ...base,
      background: 'color-mix(in srgb, var(--danger) 12%, var(--chrome-control-fill))',
      borderColor: 'color-mix(in srgb, var(--danger) 30%, var(--chrome-border-color))',
      color: 'var(--danger)',
    };
  }

  if (tone === 'success') {
    return {
      ...base,
      background: 'color-mix(in srgb, var(--success) 12%, var(--chrome-control-fill))',
      borderColor: 'color-mix(in srgb, var(--success) 30%, var(--chrome-border-color))',
      color: 'var(--success)',
    };
  }

  if (tone === 'warning') {
    return {
      ...base,
      background: 'color-mix(in srgb, var(--warning, #e3b341) 12%, var(--chrome-control-fill))',
      borderColor: 'color-mix(in srgb, var(--warning, #e3b341) 30%, var(--chrome-border-color))',
      color: 'var(--warning, #e3b341)',
    };
  }

  return base;
}

export function dangerBannerStyle() {
  return {
    background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
    border: `var(--chrome-border-width) solid color-mix(in srgb, var(--danger) 42%, var(--chrome-border-color))`,
    boxShadow:
      'var(--chrome-shadow-control), 0 0 0 1px color-mix(in srgb, var(--danger) 20%, transparent)',
    borderRadius: 'var(--chrome-radius-panel)',
    color: 'var(--danger)',
  };
}

// ─── Data tiles / stat cards ───────────────────────────────────────────────

export function dataTileStyle({ color = 'var(--accent-primary)' } = {}) {
  return {
    background: 'var(--chrome-panel-fill)',
    border: `var(--chrome-border-width) solid color-mix(in srgb, ${color} 24%, var(--chrome-border-color))`,
    boxShadow: 'var(--chrome-shadow-panel)',
    borderRadius: 'var(--chrome-radius-panel)',
  };
}

// ─── Progress bars ─────────────────────────────────────────────────────────

export function progressTrackStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    border: `var(--chrome-border-width) solid var(--chrome-border-color)`,
    boxShadow: 'var(--chrome-shadow-control)',
    borderRadius: 'var(--chrome-radius-panel)',
    height: '12px',
    padding: '2px',
  };
}

export function progressFillStyle({ color = 'var(--accent-primary)' } = {}) {
  return {
    height: '100%',
    background: color,
    borderRadius: '2px',
    transition: 'all 0.7s ease',
  };
}

// ─── Input fields ──────────────────────────────────────────────────────────

export function inputStyle() {
  return {
    background: 'var(--chrome-control-fill)',
    border: `var(--chrome-border-width) solid var(--chrome-border-color)`,
    borderRadius: 'var(--chrome-radius-control)',
    color: 'var(--text-primary)',
    padding: '0.5rem 0.75rem',
    fontSize: '12px',
    outline: 'none',
    transition: 'border-color 0.15s ease',
  };
}

export function selectStyle() {
  return {
    ...inputStyle(),
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    paddingRight: '2rem',
    backgroundImage:
      'linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%)',
    backgroundPosition: 'calc(100% - 1rem) calc(50% - 1px), calc(100% - 0.7rem) calc(50% - 1px)',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '0.35rem 0.35rem, 0.35rem 0.35rem',
    cursor: 'pointer',
  };
}

// ─── Section / content wrappers ────────────────────────────────────────────

export function sectionSurfaceStyle({ emphasized = false } = {}) {
  return {
    background: emphasized ? 'var(--chrome-panel-fill-emphasis)' : 'var(--chrome-panel-fill)',
    border: `var(--chrome-border-width) solid var(--chrome-border-color)`,
    boxShadow: 'var(--chrome-shadow-panel)',
    borderRadius: 'var(--chrome-radius-panel)',
  };
}

export function codeBlockStyle() {
  return {
    background: 'color-mix(in srgb, var(--surface-muted) 50%, transparent)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    boxShadow: '0 1px 2px color-mix(in srgb, #000 10%, transparent)',
    fontFamily: 'var(--font-mono, monospace)',
    padding: '0.75rem',
  };
}

export function filterBarStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    border: `var(--chrome-border-width) solid var(--chrome-border-color)`,
    boxShadow: 'var(--chrome-shadow-panel)',
    borderRadius: 'var(--chrome-radius-panel)',
  };
}

// ─── Kanban column ─────────────────────────────────────────────────────────

export function kanbanColumnStyle({ tone = 'neutral' } = {}) {
  const base = {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--chrome-panel-fill)',
    border: `var(--chrome-border-width) solid var(--chrome-border-color)`,
    boxShadow: 'var(--chrome-shadow-panel)',
    borderRadius: 'var(--chrome-radius-panel)',
  };

  if (tone === 'accent') {
    return {
      ...base,
      borderColor: 'var(--accent-primary)',
      boxShadow: 'var(--chrome-shadow-control)',
    };
  }

  return base;
}

export function kanbanColumnHeaderStyle({ tone = 'neutral' } = {}) {
  const base = {
    padding: '0.5rem 0.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `var(--chrome-border-width) solid var(--chrome-border-color)`,
    background: 'var(--chrome-panel-fill-emphasis)',
  };

  if (tone === 'accent') {
    return {
      ...base,
      borderBottomColor: 'var(--accent-primary)',
      background: 'color-mix(in srgb, var(--accent-primary) 12%, var(--chrome-panel-fill-emphasis))',
    };
  }

  return base;
}

export function kanbanCardStyle() {
  return {
    padding: '0.625rem',
    background: 'var(--chrome-panel-fill)',
    border: `var(--chrome-border-width) solid var(--chrome-border-color)`,
    borderRadius: 'var(--chrome-radius-panel)',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
  };
}

// ─── Timeline / roadmap items ──────────────────────────────────────────────

export function timelineItemStyle({ active = false } = {}) {
  if (active) {
    return {
      background: 'var(--chrome-panel-fill)',
      border: `var(--chrome-border-width) solid var(--accent-primary)`,
      boxShadow: 'var(--chrome-shadow-control)',
      borderRadius: 'var(--chrome-radius-panel)',
    };
  }

  return {
    background: 'var(--chrome-panel-fill)',
    border: `var(--chrome-border-width) solid var(--chrome-border-color)`,
    boxShadow: 'var(--chrome-shadow-panel)',
    borderRadius: 'var(--chrome-radius-panel)',
  };
}

// ─── Brutalist factories ─────────────────────────────────────────────────────

export function brutalPanelStyle(options = {}) {
  return {
    background: options.background || 'var(--chrome-panel-fill)',
    border: `2px solid ${options.borderColor || 'var(--border-strong)'}`,
    boxShadow: `4px 4px 0 0 ${options.shadowColor || 'var(--border-strong)'}`,
    borderRadius: 0,
    ...options.extra,
  };
}

export function brutalProgressTrackStyle() {
  return {
    background: 'var(--chrome-panel-fill)',
    border: '1px solid var(--border-strong)',
    borderRadius: 0,
    boxShadow: 'none',
  };
}

export function brutalProgressFillStyle(color = 'var(--accent-primary)') {
  return {
    background: color,
    borderRadius: 0,
    boxShadow: 'none',
  };
}
