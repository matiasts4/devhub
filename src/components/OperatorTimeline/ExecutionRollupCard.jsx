'use client';

import { Check, X, RotateCcw, Clock } from 'lucide-react';

/**
 * ExecutionRollupCard — summary card for an execution in rollup/dashboard mode (D-7, T13).
 *
 * Props:
 *   summary: ExecutionSummary
 */

const TERMINAL_COLORS = {
  completed:  { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Completed',  Icon: Check },
  failed:     { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Failed',    Icon: X },
  rolled_back: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Rolled Back', Icon: RotateCcw },
};

function formatRelativeTime(isoString) {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(isoString).toLocaleDateString();
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

export default function ExecutionRollupCard({ summary }) {
  const terminalEntry = TERMINAL_COLORS[summary.terminal_status] || null;

  return (
    <div className="bg-surface-card border border-borders-subtle rounded-xl p-4 hover:border-borders-strong transition-colors">
      {/* Header: execution_id + terminal status chip */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => copyToClipboard(summary.execution_id)}
          title="Click to copy execution_id"
          className="text-xs font-mono font-bold text-text-primary hover:text-accent-primary transition-colors"
        >
          {summary.execution_id.slice(0, 8)}…
        </button>

        {terminalEntry && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold font-mono ${terminalEntry.bg} ${terminalEntry.text}`}
          >
            <terminalEntry.Icon className="w-3 h-3" />
            {terminalEntry.label}
          </span>
        )}
        {!terminalEntry && summary.terminal_status === null && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-gray-100 text-gray-400">
            <Clock className="w-3 h-3" />
            In progress
          </span>
        )}
      </div>

      {/* Body: actor + item count + last_item_at */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-muted">
          {summary.actor.type}:{summary.actor.id}
        </span>
        <span className="text-xs text-text-muted font-mono">
          {summary.item_count} item{summary.item_count !== 1 ? 's' : ''}
        </span>
      </div>
      <p className="text-xs text-text-muted">
        Last update: {formatRelativeTime(summary.last_item_at)}
      </p>

      {/* Footer: pending confirmation banner */}
      {summary.pending_confirmation && (
        <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-200 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-amber-700">
            Awaiting confirmation
          </span>
        </div>
      )}
    </div>
  );
}