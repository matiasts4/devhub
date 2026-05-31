import React, { useState } from 'react';
import { panelShellStyle, metaTextStyle } from './utils';

export default function DGApprovalGate({
  missionId,
  approvalItem,
  onApprove,
  onReject,
  error,
  retry,
}) {
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      await onApprove(missionId, approvalItem?.approvalItemId || approvalItem?.checkpoint_key);
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    setLoading(true);
    try {
      await onReject(missionId, approvalItem?.approvalItemId || approvalItem?.checkpoint_key);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-xl border p-4 mt-3"
      style={panelShellStyle()}
      role="region"
      aria-label="Approval gate del Director"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">⚠</span>
        <p className="font-semibold text-sm">
          El Director requiere aprobación del Operator
        </p>
      </div>

      {approvalItem?.reason_class ? (
        <p className="text-xs mb-3" style={metaTextStyle()}>
          Checkpoint: {approvalItem.reason_class}
        </p>
      ) : null}

      {approvalItem?.description ? (
        <p className="text-xs mb-3" style={metaTextStyle()}>
          {approvalItem.description}
        </p>
      ) : null}

      {error ? (
        <div
          className="mb-3 text-xs rounded px-3 py-2"
          style={{
            backgroundColor: 'rgba(239,68,68,0.08)',
            color: '#f87171',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          {error}
          {retry ? (
            <button
              type="button"
              className="ml-2 underline"
              style={{ color: '#f87171', cursor: 'pointer', background: 'none', border: 'none' }}
              onClick={retry}
            >
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          style={{
            ...panelShellStyle(),
            backgroundColor: loading ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.05)',
            color: '#4ade80',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
          disabled={loading}
          onClick={handleApprove}
        >
          {loading ? '◌' : '✓'} Aprobar
        </button>

        <button
          type="button"
          className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          style={{
            ...panelShellStyle(),
            backgroundColor: loading ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)',
            color: '#f87171',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
          disabled={loading}
          onClick={handleReject}
        >
          {loading ? '◌' : '✗'} Rechazar
        </button>
      </div>
    </div>
  );
}
