/**
 * Circular progress ring for quota percentage remaining
 */
export function QuotaProgressRing({ percentage = 100, size = 18, strokeWidth = 2.5 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (Math.max(0, Math.min(100, percentage)) / 100) * circumference;

  let colorClass = 'text-emerald-400';
  if (percentage < 20) {
    colorClass = 'text-red-400';
  } else if (percentage < 45) {
    colorClass = 'text-amber-400';
  }

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="stroke-zinc-700/60"
        strokeWidth={strokeWidth}
        fill="transparent"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className={`transition-all duration-500 ease-out ${colorClass}`}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        fill="transparent"
      />
    </svg>
  );
}
