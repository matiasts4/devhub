import React from 'react';
import { StatusPill, metaTextStyle, panelShellStyle } from './utils';

const STATUS_VISUAL = Object.freeze({
  pending:          { border: '#f59e0b', label: 'Esperando al Director',       icon: '◌' },
  waiting:          { border: '#9ca3af', label: 'En espera',                    icon: '⏱' },
  'in-progress':    { border: '#3b82f6', label: 'Ejecutando',                   icon: '●' },
  'awaiting-approval': { border: '#f97316', label: 'Aprobación requerida',      icon: '⚠' },
  completed:       { border: '#22c55e', label: 'Completado',                   icon: '✓' },
  rejected:        { border: '#ef4444', label: 'Rechazado por el Operator',     icon: '✗' },
  failed:          { border: '#ef4444', label: 'Fallido',                      icon: '⚠' },
});

const INITIATOR_LABELS = Object.freeze({
  operator:           'Operator',
  'director-general': 'DG',
  'swarm-director':   'Director',
});

const ACTION_LABELS = Object.freeze({
  'mission-request':  'Mission requested',
  'status-poll':      'Polling...',
  'approval-required': 'Approval required',
  'mission-result':   'Result',
});

function formatTimestamp(ts) {
  if (!ts) return 'Sin timestamp';
  const date = new Date(ts);
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function truncateId(id = '') {
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export default function DGChainRow({ row, onApprovalAction }) {
  const visual = STATUS_VISUAL[row.status] || STATUS_VISUAL.pending;
  const initiatorLabel = INITIATOR_LABELS[row.initiator] || row.initiator;
  const actionLabel = ACTION_LABELS[row.action] || row.action;

  return (
    <article
      className="rounded-xl border p-3 overflow-hidden"
      style={{
        ...panelShellStyle(),
        borderLeftWidth: 3,
        borderLeftColor: visual.border,
      }}
    >
     <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Initiator badge */}
        <span
          className="text-xs font-mono px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#9ca3af' }}
        >
          {initiatorLabel}
        </span>

        {/* Action label */}
        <span className="font-medium text-sm">{actionLabel}</span>

        {/* Status pill */}
        <StatusPill status={row.status} />
      </div>

      {/* Status description */}
      <p className="mt-1.5 text-xs" style={{ color: visual.border }}>
        {visual.icon} {visual.label}
      </p>

      {/* Authority + freshness metadata */}
      <p className="mt-1.5 text-xs" style={metaTextStyle()}>
        authority: {row.authority} · freshness: {row.freshness}
</p>

      {/* Fallback text — only when failed */}
      {row.status === 'failed' && row.fallback ? (
        <p
          className="mt-2 text-xs rounded px-2 py-1.5"
          style={{
            backgroundColor: 'rgba(239,68,68,0.08)',
            color: '#f87171',
            borderLeft: `2px solid ${visual.border}`,
          }}
        >
          {row.fallback}
        </p>
      ) : null}

      {/* Timestamp */}
      <p className="mt-1.5 text-xs" style={metaTextStyle()}>
        {formatTimestamp(row.timestamp)} · {truncateId(row.missionId)}
      </p>
    </article>
  );
}
