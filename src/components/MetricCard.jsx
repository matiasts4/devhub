'use client';
export default function MetricCard({
  id,
  title,
  value,
  subtitle,
  icon: _icon,
  accentColor,
  accentVar,
  progressValue,
  badge,
  trend,
  index,
}) {
  // Support both legacy accentColor (hex) and new accentVar (CSS variable name)
  const accent = accentVar ? `var(${accentVar})` : accentColor;
  // For transparent backgrounds, use color-mix with CSS variables or hex alpha for legacy
  const accentAlpha = accentVar
    ? `color-mix(in srgb, var(${accentVar}) 14%, transparent)`
    : `${accentColor}14`;
  const accentBorder = accentVar
    ? `color-mix(in srgb, var(${accentVar}) 22%, transparent)`
    : `${accentColor}22`;

  return (
    <div
      data-testid={`metric-card-${id}`}
      className="fade-in-up bg-surface-card border border-borders-subtle rounded-xl p-5 hover:bg-surface-elevated hover:border-borders-strong transition-all duration-200 cursor-default"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: accent }}>
          {title}
        </p>
        <span
          className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
          style={{ color: accent, background: accentAlpha, border: `1px solid ${accentBorder}` }}
        >
          {badge}
        </span>
      </div>
      <p className="font-mono text-4xl font-bold text-text-primary mb-1 leading-none">{value}</p>
      <p className="text-xs text-text-muted mb-3">{subtitle}</p>
      <div className="h-[3px] bg-surface-elevated rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${progressValue}%`, background: accent }}
        />
      </div>
      <p className="text-xs text-text-muted">{trend}</p>
    </div>
  );
}
