'use client';

/**
 * OperatorActionCard.jsx — Execution card UI for operator actions.
 *
 * Renders a single action through its lifecycle:
 *   requested  → dispatched → completed | failed | cancelled
 *
 * The ConfirmationDialogInline is co-located in this file (not a separate
 * component) as it has no other consumers and is tightly coupled to the
 * card's 'requested' state.
 */

import { CheckCircle2, XCircle, Loader2, Ban } from 'lucide-react';
// Note: all four icons are used in STATUS_ICONS below

/** @type {Record<string, React.ReactNode>} */
const STATUS_ICONS = {
  requested: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
  dispatched: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
  completed: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  failed: <XCircle className="w-4 h-4 text-red-500" />,
  cancelled: <Ban className="w-4 h-4 text-gray-400" />,
};

/** @type {Record<string, string>} */
const TIER_STYLES = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
};

/**
 * @param {number|null|undefined} ts
 * @returns {string}
 */
function formatTs(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString();
}

/**
 * @param {{ card: object, onConfirm: (id: string) => void, onCancel: (id: string) => void }} props
 */
export default function OperatorActionCard({ card, onConfirm, onCancel }) {
  const { id, verb, tier, status, createdAt, confirmedAt, completedAt, result, error } = card;

  return (
    <div
      className="border border-[var(--border-subtle)] rounded-lg bg-[var(--surface-raised)] p-3 mb-2 text-sm"
      data-card-id={id}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {STATUS_ICONS[status]}
          <span className="font-medium text-[var(--text-primary)]">{verb}</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded font-medium ${TIER_STYLES[tier] ?? TIER_STYLES.low}`}
          >
            {tier}
          </span>
        </div>
        <span className="text-xs text-[var(--text-muted)]">{formatTs(createdAt)}</span>
      </div>

      {/* Confirmation gate — only shown when status is 'requested' */}
      {status === 'requested' && (
        <ConfirmationDialogInline
          card={card}
          onConfirm={() => onConfirm(id)}
          onCancel={() => onCancel(id)}
        />
      )}

      {/* Dispatched — running indicator */}
      {status === 'dispatched' && (
        <div className="text-sm text-[var(--text-muted)] italic">Running...</div>
      )}

      {/* Completed */}
      {status === 'completed' && result && (
        <div className="mt-1 text-sm text-green-600">
          Done — {JSON.stringify(result.data ?? result)}
        </div>
      )}

      {/* Failed */}
      {status === 'failed' && <div className="mt-1 text-sm text-red-500">Failed: {error}</div>}

      {/* Cancelled */}
      {status === 'cancelled' && (
        <div className="mt-1 text-sm text-gray-500">Cancelled by user</div>
      )}

      {/* Timestamps for terminal states */}
      {(status === 'completed' || status === 'failed' || status === 'cancelled') && (
        <div className="mt-2 text-xs text-[var(--text-muted)]">
          {confirmedAt && <span>Confirmed {formatTs(confirmedAt)} · </span>}
          {completedAt && <span>Finished {formatTs(completedAt)}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Inline confirmation dialog — rendered inside the card, not as a modal.
 * Co-located per design.md Section 7.
 *
 * @param {{ card: object, onConfirm: () => void, onCancel: () => void }} props
 */
function ConfirmationDialogInline({ card, onConfirm, onCancel }) {
  const { params, target } = card;

  return (
    <div className="border border-blue-200 bg-blue-950/20 rounded p-3">
      <div className="text-xs text-blue-400 mb-2 font-medium uppercase tracking-wide">
        Confirm Action
      </div>
      <div className="text-sm mb-2">
        <span className="text-[var(--text-muted)]">Target: </span>
        <span className="text-[var(--text-primary)]">{target}</span>
      </div>
      <div className="text-xs text-[var(--text-muted)] mb-3 space-y-0.5">
        {Object.entries(params).map(([k, v]) => (
          <div key={k}>
            <span className="font-medium text-[var(--text-secondary)]">{k}: </span>
            <span className="font-mono text-[var(--text-muted)]">{String(v)}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium transition-colors"
        >
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-[var(--surface-raised)] hover:bg-red-900/30 text-red-400 border border-red-800/40 text-xs rounded font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
