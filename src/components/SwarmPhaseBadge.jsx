'use client';

/**
 * SwarmPhaseBadge — React component showing current SDD phase per agent.
 * Color-coded by phase type.
 *
 * @param {object} props
 * @param {string} props.phase - SDD phase name e.g. "sdd-explore", "sdd-design", "sdd-apply"
 * @param {'idle'|'active'|'completed'|'failed'} [props.status] - Agent status
 * @param {boolean} [props.showStatus=true] - Whether to show status dot
 * @param {string} [props.className] - Additional CSS classes
 */
export default function SwarmPhaseBadge({
  phase,
  status,
  showStatus = true,
  className = '',
}) {
  if (!phase) return null;

  // Parse phase — handle "sdd-" prefix
  const phaseLabel = phase.startsWith('sdd-') ? phase.slice(4) : phase;

  // Color mapping by phase type
  const phaseColorMap = {
    explore: { bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30' },
    propose: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
    spec: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
    design: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
    tasks: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
    apply: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    verify: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
    archive: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
  };

  // Default to "apply" color if unknown phase
  const colors = phaseColorMap[phaseLabel] || phaseColorMap.apply;

  // Status dot colors
  const statusColorMap = {
    active: 'bg-emerald-400',
    idle: 'bg-yellow-400',
    completed: 'bg-blue-400',
    failed: 'bg-red-400',
  };
  const statusColor = status ? statusColorMap[status] || 'bg-gray-400' : 'bg-gray-400';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${colors.bg} ${colors.text} ${colors.border} ${className}`}
    >
      <span className="uppercase tracking-wider text-[9px] opacity-75">SDD</span>
      <span>{phaseLabel}</span>
      {showStatus && status && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${statusColor} ml-0.5`}
          title={status}
        />
      )}
    </div>
  );
}