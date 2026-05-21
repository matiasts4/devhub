import React from 'react';
import {
  formatEvidence,
  formatMissingSource,
  formatToken,
  metaTextStyle,
  panelShellStyle,
  renderEmptyCopy,
} from './utils';

export default function RunsArtifactsPanel({ runs = [], selectedRunId, onSelectRun }) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={panelShellStyle()}
      aria-label="Ejecuciones y artefactos"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Ejecuciones y artefactos</h2>
        <p className="text-sm" style={metaTextStyle()}>
          Resultado más reciente del run y línea de evidencia asociada.
        </p>
      </header>

      <div className="space-y-3">
        {runs.length === 0
          ? renderEmptyCopy('Sin ejecuciones durables en este snapshot.')
          : runs.map((run) => {
              const isSelected = selectedRunId === run.run_id;

              return (
                <button
                  key={run.run_id}
                  type="button"
                  onClick={() => onSelectRun?.(isSelected ? null : run.run_id)}
                  className="block w-full rounded-xl border p-3 text-left"
                  style={{
                    ...panelShellStyle(),
                    borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">{run.run_id}</h3>
                    <span className="text-xs" style={metaTextStyle()}>
                      {formatToken(run.status)}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <MetaRow label="Workspace" value={run.workspace_id || '—'} />
                    <MetaRow label="Autoridad" value={formatToken(run.authority)} />
                  </dl>

                  <p className="mt-3 text-xs" style={metaTextStyle()}>
                    {formatToken(run.freshness)} · {formatEvidence(run.evidence_refs)}
                  </p>
                  {run.missing_source ? (
                    <p className="mt-1 text-xs" style={metaTextStyle()}>
                      {formatMissingSource(run.missing_source)}
                    </p>
                  ) : null}

                  {run.approval_gate?.status === 'pending' ? (
                    <div
                      className="mt-3 rounded-lg border px-3 py-2 text-sm"
                      style={panelShellStyle()}
                    >
                      <div className="font-medium">Resultado riesgoso pendiente de aprobación</div>
                      <div className="mt-1 text-xs" style={metaTextStyle()}>
                        {formatToken(run.approval_gate.reason_class)} ·{' '}
                        {run.approval_gate.evidence_ref || 'Sin evidencia'}
                      </div>
                      <div className="mt-1 text-xs" style={metaTextStyle()}>
                        Resultado no aplicado hasta que exista evidencia de aprobación
                      </div>
                    </div>
                  ) : null}

                  {run.latest_artifact ? (
                    <div
                      className="mt-3 rounded-lg border px-3 py-2 text-sm"
                      style={panelShellStyle()}
                    >
                      <div className="font-medium">{run.latest_artifact.kind}</div>
                      <div className="text-xs" style={metaTextStyle()}>
                        seq {run.latest_artifact.seq} · {run.latest_artifact.evidence_ref}
                      </div>
                    </div>
                  ) : null}
                </button>
              );
            })}
      </div>
    </section>
  );
}

function MetaRow({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide" style={metaTextStyle()}>
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}
