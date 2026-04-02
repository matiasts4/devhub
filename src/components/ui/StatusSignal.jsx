'use client';

const TONE_STYLES = {
  success: {
    dot: 'var(--success)',
    text: 'var(--success)',
    border: 'color-mix(in srgb, var(--success) 25%, transparent)',
    bg: 'color-mix(in srgb, var(--success) 10%, transparent)',
  },
  info: {
    dot: 'var(--accent-primary)',
    text: 'var(--accent-primary)',
    border: 'color-mix(in srgb, var(--accent-primary) 25%, transparent)',
    bg: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
  },
  warning: {
    dot: 'var(--warning)',
    text: 'var(--warning)',
    border: 'color-mix(in srgb, var(--warning) 25%, transparent)',
    bg: 'color-mix(in srgb, var(--warning) 10%, transparent)',
  },
  neutral: {
    dot: 'var(--text-muted)',
    text: 'var(--text-muted)',
    border: 'var(--border-subtle)',
    bg: 'var(--surface-elevated)',
  },
};

export default function StatusSignal({
  label,
  tone = 'neutral',
  animation = 'none',
  compact = false,
}) {
  const style = TONE_STYLES[tone] || TONE_STYLES.neutral;
  const dotClass =
    animation === 'pulse' ? 'animate-pulse' : animation === 'ping' ? 'animate-ping' : '';

  if (compact && !label) {
    return (
      <span
        className={`inline-flex rounded-full ${dotClass}`}
        style={{ width: 6, height: 6, background: style.dot }}
      />
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border"
      style={{
        background: style.bg,
        borderColor: style.border,
        color: style.text,
      }}
    >
      <span
        className={`inline-flex rounded-full ${dotClass}`}
        style={{ width: 6, height: 6, background: style.dot }}
      />
      {label ? <span className="text-xs font-semibold">{label}</span> : null}
    </span>
  );
}
