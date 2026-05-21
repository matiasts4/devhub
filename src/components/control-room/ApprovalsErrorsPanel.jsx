import {
  formatEvidence,
  formatMissingSource,
  formatToken,
  metaTextStyle,
  panelShellStyle,
  renderEmptyCopy,
} from './utils';

export default function ApprovalsErrorsPanel({
  approvals = [],
  errors = [],
  mutationState = { submittingKey: null, error: null, errorKey: null },
  onDecision = null,
}) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={panelShellStyle()}
      aria-label="Aprobaciones y errores"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Aprobaciones y errores</h2>
        <p className="text-sm" style={metaTextStyle()}>
          Aprobaciones pendientes y faltantes explícitos de evidencia. Las decisiones del Director
          se revalidan contra el estado durable antes de mutar.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Aprobaciones</h3>
          {approvals.length === 0
            ? renderEmptyCopy('Sin checkpoints de aprobación en este snapshot.')
            : approvals.map((approval, index) => (
                <article
                  key={`${approval.task_id || 'approval'}-${index}`}
                  className="rounded-xl border p-3"
                  style={panelShellStyle()}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">
                      {approval.task_id || approval.workspace_id || approval.run_id}
                    </div>
                    <span className="text-xs" style={metaTextStyle()}>
                      {formatToken(approval.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{formatToken(approval.reason_class)}</p>
                  <p className="mt-2 text-xs" style={metaTextStyle()}>
                    {formatToken(approval.freshness)} · {formatEvidence(approval.evidence_refs)}
                  </p>
                  {approval.checkpoint_key ? (
                    <p className="mt-1 text-xs" style={metaTextStyle()}>
                      Checkpoint {approval.checkpoint_key}
                    </p>
                  ) : null}
                  {approval.missing_source ? (
                    <p className="mt-1 text-xs" style={metaTextStyle()}>
                      {formatMissingSource(approval.missing_source)}
                    </p>
                  ) : null}
                  {onDecision && approval.status === 'pending' ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                        style={panelShellStyle()}
                        disabled={mutationState.submittingKey === approval.checkpoint_key}
                        onClick={() => onDecision(approval, 'approve')}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                        style={panelShellStyle()}
                        disabled={mutationState.submittingKey === approval.checkpoint_key}
                        onClick={() => onDecision(approval, 'reject')}
                      >
                        Rechazar
                      </button>
                    </div>
                  ) : null}
                  {mutationState.error && mutationState.errorKey === approval.checkpoint_key ? (
                    <p
                      className="mt-2 text-xs"
                      style={{ ...metaTextStyle(), color: 'var(--text-danger)' }}
                    >
                      {mutationState.error}
                    </p>
                  ) : null}
                </article>
              ))}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Errores</h3>
          {errors.length === 0
            ? renderEmptyCopy('Sin errores explícitos en este snapshot.')
            : errors.map((error, index) => (
                <article
                  key={`${error.code || 'error'}-${index}`}
                  className="rounded-xl border p-3"
                  style={panelShellStyle()}
                >
                  <div className="font-medium">
                    {formatToken(error.message || error.code || 'Unknown error')}
                  </div>
                  <p className="mt-2 text-xs" style={metaTextStyle()}>
                    {formatToken(error.source || 'unknown source')}
                  </p>
                  {error.remediation ? (
                    <p className="mt-1 text-xs" style={metaTextStyle()}>
                      {error.remediation}
                    </p>
                  ) : null}
                </article>
              ))}
        </div>
      </div>
    </section>
  );
}
