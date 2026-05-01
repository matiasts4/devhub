import React, { useMemo } from 'react';
import { Database, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { getContextUsageTone, resolveContextUsage } from '@/lib/agenthub/contextUsage';

function formatTokens(n) {
  if (n == null || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function formatTokensFull(n) {
  return new Intl.NumberFormat('en-US').format(n || 0);
}

function getUtilColor(pct) {
  const tone = getContextUsageTone(pct);
  if (tone === 'danger') {
    return {
      bar: 'bg-red-500',
      text: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      label: 'Riesgo alto',
    };
  }
  if (tone === 'warn') {
    return {
      bar: 'bg-amber-400',
      text: 'text-amber-400',
      bg: 'bg-amber-400/10',
      border: 'border-amber-400/30',
      label: 'Atención',
    };
  }
  return {
    bar: 'bg-emerald-400',
    text: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/30',
    label: 'Seguro',
  };
}

export default function TokenUsageBadge({ usage, compact = false }) {
  const displayUsage = useMemo(() => {
    if (!usage) return null;
    return resolveContextUsage(usage);
  }, [usage]);

  if (!displayUsage || displayUsage.total_tokens === 0) return null;

  const colors = getUtilColor(displayUsage.context_utilization);
  const tokensLabel = `${formatTokens(displayUsage.total_tokens)} / ${formatTokens(
    displayUsage.context_window_size
  )}`;
  const fullTokensLabel = `${formatTokensFull(displayUsage.total_tokens)} / ${formatTokensFull(
    displayUsage.context_window_size
  )}`;
  const accessibilityLabel = `Context usage: ${formatTokensFull(displayUsage.total_tokens)} of ${formatTokensFull(displayUsage.context_window_size)} tokens used (${displayUsage.context_utilization.toFixed(1)}%)`;
  const tooltipLabel = [
    displayUsage.model ? `Model ${displayUsage.model}` : null,
    `Prompt ${formatTokensFull(displayUsage.prompt_tokens)}`,
    `Completion ${formatTokensFull(displayUsage.completion_tokens)}`,
    `Total ${formatTokensFull(displayUsage.total_tokens)} / ${formatTokensFull(displayUsage.context_window_size)} tokens`,
  ]
    .filter(Boolean)
    .join(' · ');

  // Compact mode: just total + percentage
  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${colors.bg} ${colors.border}`}
        role="status"
        aria-label={accessibilityLabel}
        title={tooltipLabel}
      >
        <Database className="w-3 h-3 shrink-0" style={{ color: 'var(--accent-primary)' }} />
        <div className="min-w-[136px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Contexto
            </span>
            <span className={`text-[10px] font-mono font-bold ${colors.text}`}>
              {displayUsage.context_utilization.toFixed(1)}%
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full overflow-hidden bg-[var(--surface-hover)]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
              style={{ width: `${Math.min(displayUsage.context_utilization, 100)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-mono">
            <span style={{ color: 'var(--text-secondary)' }}>{tokensLabel}</span>
            <span className={colors.text}>{colors.label}</span>
          </div>
        </div>
      </div>
    );
  }

  // Full mode: breakdown
  return (
    <div
      style={{ background: 'var(--surface-muted)', borderColor: 'var(--border-strong)' }}
      className="border rounded-xl p-3 min-w-[220px]"
      role="status"
      aria-label={accessibilityLabel}
      title={tooltipLabel}
    >
      {/* Total tokens */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            {fullTokensLabel} tokens
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
            <div className="mt-1 flex items-center justify-between gap-2">
              <p
                className="text-[10px] font-mono"
                style={{ color: 'var(--text-muted)', opacity: 0.8 }}
              >
                {fullTokensLabel}
              </p>
              <p className={`text-[10px] font-mono font-semibold ${colors.text}`}>{colors.label}</p>
            </div>
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
