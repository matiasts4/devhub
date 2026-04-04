import React, { useMemo } from 'react';
import { Database, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';

function formatTokens(n) {
  if (n == null || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function getUtilColor(pct) {
  if (pct > 80) return { bar: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10' };
  if (pct > 50) return { bar: 'bg-amber-400', text: 'text-amber-400', bg: 'bg-amber-400/10' };
  return { bar: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-400/10' };
}

export default function TokenUsageBadge({ usage, compact = false }) {
  const displayUsage = useMemo(() => {
    if (!usage) return null;
    let utilization = usage.context_utilization || 0;
    // Fallback calculation
    if (utilization === 0 && usage.context_window_size && usage.context_window_size > 0) {
      const estimated = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
      utilization = Math.min((estimated / usage.context_window_size) * 100, 100);
    }
    return { ...usage, context_utilization: utilization };
  }, [usage]);

  if (!displayUsage || displayUsage.total_tokens === 0) return null;

  const colors = getUtilColor(displayUsage.context_utilization);

  // Compact mode: just total + percentage
  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${colors.bg} border border-transparent`}
      >
        <Database className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
        <span className="text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
          {formatTokens(displayUsage.total_tokens)}
        </span>
        {displayUsage.context_utilization > 0 && (
          <span className={`text-[10px] font-mono font-bold ${colors.text}`}>
            {displayUsage.context_utilization.toFixed(0)}%
          </span>
        )}
      </div>
    );
  }

  // Full mode: breakdown
  return (
    <div
      style={{ background: 'var(--surface-muted)', borderColor: 'var(--border-strong)' }}
      className="border rounded-xl p-3 min-w-[220px]"
    >
      {/* Total tokens */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            {formatTokens(displayUsage.total_tokens)} tokens
          </span>
        </div>
        {displayUsage.tool_calls_count > 0 && (
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {displayUsage.tool_calls_count} tools
          </span>
        )}
      </div>

      {/* Context utilization bar */}
      {displayUsage.context_utilization > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[10px] font-mono uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Contexto
            </span>
            <span className={`text-[10px] font-mono font-bold ${colors.text}`}>
              {displayUsage.context_utilization.toFixed(1)}%
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--surface-hover)' }}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
              style={{ width: `${Math.min(displayUsage.context_utilization, 100)}%` }}
            />
          </div>
          {displayUsage.context_window_size && (
            <p
              className="text-[10px] mt-0.5 font-mono"
              style={{ color: 'var(--text-muted)', opacity: 0.6 }}
            >
              {formatTokens(displayUsage.context_window_size)} window
            </p>
          )}
        </div>
      )}

      {/* Breakdown */}
      <div className="flex items-center gap-3 text-[10px] font-mono">
        <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <ArrowUpRight className="w-3 h-3 text-emerald-400" />
          <span>P: {formatTokens(displayUsage.prompt_tokens)}</span>
        </div>
        <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <ArrowDownRight className="w-3 h-3 text-amber-400" />
          <span>C: {formatTokens(displayUsage.completion_tokens)}</span>
        </div>
      </div>
    </div>
  );
}
