'use client';
export default function MetricCard({
  id, title, value, subtitle, icon, accentColor, progressValue, badge, trend, index,
}) {
  return (
    <div
      data-testid={`metric-card-${id}`}
      className="fade-in-up bg-surface-card border border-borders-subtle rounded-xl p-5 hover:bg-surface-elevated hover:border-borders-strong transition-all duration-200 cursor-default"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: accentColor }}>{title}</p>
        <span
          className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
          style={{ color: accentColor, background: `${accentColor}14`, border: `1px solid ${accentColor}22` }}
        >
          {badge}
        </span>
      </div>
      <p className="font-mono text-4xl font-bold text-text-primary mb-1 leading-none">{value}</p>
      <p className="text-xs text-text-muted mb-3">{subtitle}</p>
      <div className="h-[3px] bg-surface-elevated rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${progressValue}%`, background: accentColor }}
        />
      </div>
      <p className="text-xs text-text-muted">{trend}</p>
    </div>
  );
}
