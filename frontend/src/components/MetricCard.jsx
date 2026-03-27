'use client';
export default function MetricCard({
  id, title, value, subtitle, icon, accentColor, progressValue, badge, trend, index,
}) {
  return (
    <div
      data-testid={`metric-card-${id}`}
      className="fade-in-up bg-[#161B26] border border-[#21262D] rounded-xl p-5 hover:bg-[#1C2333] hover:border-[#30363D] transition-all duration-200 cursor-default"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: accentColor }}>{title}</p>
        <span
          className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
          style={{ color: accentColor, background: `${accentColor}14`, border: `1px solid ${accentColor}22` }}
        >
          {badge}
        </span>
      </div>
      <p className="font-mono text-4xl font-bold text-[#F0F6FC] mb-1 leading-none">{value}</p>
      <p className="text-[10px] text-[#484F58] mb-3">{subtitle}</p>
      <div className="h-[3px] bg-[#21262D] rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${progressValue}%`, background: accentColor }}
        />
      </div>
      <p className="text-[10px] text-[#484F58]">{trend}</p>
    </div>
  );
}
