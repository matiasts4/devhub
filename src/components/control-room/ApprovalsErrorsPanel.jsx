import React from 'react';
import {
  formatEvidence,
  formatMissingSource,
  formatToken,
  metaTextStyle,
  panelShellStyle,
  renderEmptyCopy,
} from './utils';

export default function ApprovalsErrorsPanel({ approvals = [], errors = [] }) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={panelShellStyle()}
      aria-label="Approvals & errors"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Approvals & errors</h2>
        <p className="text-sm" style={metaTextStyle()}>
          Pending gates and explicit evidence gaps. No mutation controls.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Approvals</h3>
          {approvals.length === 0
            ? renderEmptyCopy('No approval checkpoints in snapshot.')
            : approvals.map((approval, index) => (
                <article key={`${approval.task_id || 'approval'}-${index}`} className="rounded-xl border p-3" style={panelShellStyle()}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{approval.task_id || approval.workspace_id || approval.run_id}</div>
                    <span className="text-xs" style={metaTextStyle()}>
                      {formatToken(approval.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{formatToken(approval.reason_class)}</p>
                  <p className="mt-2 text-xs" style={metaTextStyle()}>
                    {formatToken(approval.freshness)} · {formatEvidence(approval.evidence_refs)}
                  </p>
                  {approval.missing_source ? (
                    <p className="mt-1 text-xs" style={metaTextStyle()}>
                      {formatMissingSource(approval.missing_source)}
                    </p>
                  ) : null}
                </article>
              ))}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Errors</h3>
          {errors.length === 0
            ? renderEmptyCopy('No explicit errors in snapshot.')
            : errors.map((error, index) => (
                <article key={`${error.code || 'error'}-${index}`} className="rounded-xl border p-3" style={panelShellStyle()}>
                  <div className="font-medium">{error.message || error.code || 'Unknown error'}</div>
                  <p className="mt-2 text-xs" style={metaTextStyle()}>
                    {formatToken(error.source || 'unknown source')}
                  </p>
                </article>
              ))}
        </div>
      </div>
    </section>
  );
}
