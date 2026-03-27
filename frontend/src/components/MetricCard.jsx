import { Shield, Palette, Database, AlertTriangle } from "lucide-react";

const iconMap = { Shield, Palette, Database, AlertTriangle };

export default function MetricCard({
  id, title, value, subtitle, icon, accentColor, progressValue, badge, trend, index,
}) {
  const Icon = iconMap[icon] || Shield;

  const badgeStyles = {
    "#39FF14": "bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/25",
    "#00F0FF": "bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/25",
    "#FF007F": "bg-[#FF007F]/10 text-[#FF007F] border-[#FF007F]/25",
    "#FFE600": "bg-[#FFE600]/10 text-[#FFE600] border-[#FFE600]/25",
  };

  return (
    <div
      data-testid={`metric-card-${id}`}
      className="fade-in-up bg-[#111827]/60 border border-white/8 rounded-xl p-5 hover:border-white/15 hover:bg-[#111827]/80 transition-all duration-300 group cursor-default"
      style={{ animationDelay: `${index * 80}ms`, borderLeftColor: accentColor, borderLeftWidth: "2px" }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}30` }}
        >
          <Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: accentColor }} />
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${badgeStyles[accentColor] || ""}`}
        >
          {badge}
        </span>
      </div>

      <div className="mb-3">
        <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">{title}</p>
        <p className="font-mono text-3xl font-bold text-white leading-none" style={{ textShadow: `0 0 20px ${accentColor}40` }}>
          {value}
        </p>
        <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progressValue}%`, background: `linear-gradient(90deg, ${accentColor}80, ${accentColor})` }}
          />
        </div>
      </div>

      <p className="text-[10px] text-slate-500">{trend}</p>
    </div>
  );
}
