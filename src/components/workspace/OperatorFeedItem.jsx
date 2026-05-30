'use client';

import { useState } from 'react';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatStepFraction(stepIndex, totalSteps) {
  return `Step ${stepIndex}/${totalSteps}`;
}

// ── TranscriptBubble — operator-prompt / agent-reply ────────────────────────────

function TranscriptBubble({ item }) {
  const isOperator = item.type === 'operator-prompt';
  const roleLabel = isOperator ? 'Operator' : 'Agent';
  const bgClass = isOperator
    ? 'bg-[rgba(var(--accent-rgb,88,166,255),0.08)] border-[rgba(var(--accent-rgb,88,166,255),0.2)]'
    : 'bg-[var(--surface-raised)] border-[var(--border-subtle)]';

  return (
    <div
      role="log"
      aria-label={`${roleLabel} at ${formatTime(item.timestamp)}`}
      className={`rounded-lg border px-3 py-2 space-y-1 ${bgClass}`}
    >
      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${
            isOperator
              ? 'bg-[rgba(var(--accent-rgb,88,166,255),0.15)] text-[rgba(var(--accent-rgb,88,166,255),0.9)]'
              : 'bg-[var(--surface-overlay)] text-[var(--text-muted)]'
          }`}
        >
          {roleLabel}
        </span>
        <span>{formatTime(item.timestamp)}</span>
        {item.pending && <span className="text-[var(--text-muted)] italic">sending...</span>}
        {item.error && (
          <span className="inline-flex items-center gap-1 text-rose-400">
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            error
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
        {item.text}
      </p>
    </div>
  );
}

// ── ActionRow — action-executed ────────────────────────────────────────────────

function ActionRow({ item }) {
  const { tool, argsSummary, startedAt, completedAt, status, error } = item;
  const timeStr = formatTime(startedAt);

  let icon = null;
  let iconColor = 'text-[var(--text-muted)]';
  let statusAria = null;

  if (status === 'running') {
    icon = (
      <svg
        className="w-3.5 h-3.5 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    );
    iconColor = 'text-blue-400';
  } else if (status === 'done') {
    icon = (
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
    iconColor = 'text-emerald-400';
    statusAria = 'completed';
  } else {
    icon = (
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
    iconColor = 'text-rose-400';
    statusAria = 'failed';
  }

  const rowId = `action-row-${item.id}`;

  return (
    <div
      id={rowId}
      role="row"
      tabIndex={0}
      aria-label={`${tool}${argsSummary ? ` — ${argsSummary}` : ''} ${statusAria || status} at ${timeStr}`}
      aria-describedby={error ? `action-error-${item.id}` : undefined}
      className="flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono text-[var(--text-secondary)] hover:bg-white/[0.03] transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
    >
      <span className={`shrink-0 ${iconColor}`}>{icon}</span>
      <span className="text-[var(--text-muted)] text-[10px]">{' > '}</span>
      <span className="font-semibold text-[var(--text-primary)]">{tool}</span>
      {argsSummary && <span className="text-[var(--text-muted)] truncate">— {argsSummary}</span>}
      <span className="ml-auto shrink-0 text-[10px] text-[var(--text-muted)]">{timeStr}</span>
      {error && (
        <span id={`action-error-${item.id}`} className="sr-only">
          Error: {error}
        </span>
      )}
    </div>
  );
}

// ── ProgressBar — progress-active ────────────────────────────────────────────────

function ProgressBar({ item }) {
  const { stepIndex, totalSteps, stepLabel } = item;
  const fraction = formatStepFraction(stepIndex, totalSteps);
  const pct = totalSteps > 0 ? Math.round((stepIndex / totalSteps) * 100) : 0;

  return (
    <div
      role="status"
      aria-label={`${fraction}: ${stepLabel} — running`}
      className="px-3 py-2 space-y-1.5"
    >
      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span className="font-medium text-blue-300">{fraction}</span>
        <span className="text-blue-400/70">running</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-overlay)] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 animate-pulse"
          style={{ width: `${pct}%`, transition: 'width 0.4s ease' }}
        />
      </div>
      <p className="text-[11px] text-[var(--text-secondary)] truncate">{stepLabel}</p>
    </div>
  );
}

// ── ProgressDone — progress-done ─────────────────────────────────────────────────

function ProgressDone({ item }) {
  const { stepIndex, totalSteps, stepLabel, completedAt } = item;
  const fraction = formatStepFraction(stepIndex, totalSteps);
  const timeStr = formatTime(completedAt);

  return (
    <div
      role="status"
      aria-label={`${fraction}: ${stepLabel} — completed at ${timeStr}`}
      className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-emerald-300"
    >
      <svg
        className="w-3.5 h-3.5 shrink-0 text-emerald-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span className="font-medium text-emerald-300">{fraction}:</span>
      <span className="text-emerald-200/80 truncate flex-1">{stepLabel}</span>
      <span className="shrink-0 text-[10px] text-emerald-400/60">— {timeStr}</span>
    </div>
  );
}

// ── ProgressFailed — progress-failed ────────────────────────────────────────────

function ProgressFailed({ item }) {
  const { stepIndex, totalSteps, stepLabel, error } = item;
  const fraction = formatStepFraction(stepIndex, totalSteps);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      role="alert"
      aria-label={`${fraction}: ${stepLabel} — failed${error ? `: ${error}` : ''}`}
      className="px-3 py-2 space-y-1"
    >
      <div className="flex items-start gap-2 text-[11px] text-rose-300">
        <svg
          className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-rose-200">{fraction}:</span>
          <span className="ml-1.5 text-rose-300/90">{stepLabel}</span>
        </div>
      </div>
      {error && (
        <div className="ml-5">
          {error.length > 80 && !expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-[10px] text-rose-400/70 hover:text-rose-300 underline"
            >
              Show error
            </button>
          ) : (
            <p className="text-[10px] text-rose-400/80 font-mono leading-relaxed">Error: {error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main dispatcher ─────────────────────────────────────────────────────────────

/**
 * OperatorFeedItem — type-dispatched renderer for all 6 FeedItem variants.
 *
 * @param {{ item: FeedItem }} props
 * @returns {JSX.Element|null}
 */
export default function OperatorFeedItem({ item }) {
  if (!item || !item.type) return null;

  switch (item.type) {
    case 'operator-prompt':
    case 'agent-reply':
      return <TranscriptBubble item={item} />;

    case 'action-executed':
      return <ActionRow item={item} />;

    case 'progress-active':
      return <ProgressBar item={item} />;

    case 'progress-done':
      return <ProgressDone item={item} />;

    case 'progress-failed':
      return <ProgressFailed item={item} />;

    default:
      return null;
  }
}
