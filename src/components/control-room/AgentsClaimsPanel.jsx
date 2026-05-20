import React from 'react';
import {
  formatEvidence,
  formatLiveHint,
  formatMissingSource,
  formatToken,
  metaTextStyle,
  panelShellStyle,
  renderEmptyCopy,
} from './utils';

export default function AgentsClaimsPanel({ agents = [] }) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={panelShellStyle()}
      aria-label="Agentes y asignaciones"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Agentes y asignaciones</h2>
        <p className="text-sm" style={metaTextStyle()}>
          Tareas reclamadas, ventanas de lease, enlaces a workspace y autoridad durable.
        </p>
      </header>

      <div className="space-y-3">
        {agents.length === 0
          ? renderEmptyCopy('Sin agentes durables en este snapshot.')
          : agents.map((agent) => (
              <article
                key={agent.agent_id}
                className="rounded-xl border p-3"
                style={panelShellStyle()}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{agent.agent_id}</h3>
                    <p className="text-sm" style={metaTextStyle()}>
                      {agent.task_id || 'Sin tarea reclamada'}
                    </p>
                  </div>
                  <div className="text-xs" style={metaTextStyle()}>
                    {formatToken(agent.supervisor_state)}
                  </div>
                </div>

                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <MetaRow label="Lease" value={agent.lease_expires_at || '—'} />
                  <MetaRow label="Workspace" value={agent.workspace_id || '—'} />
                  <MetaRow label="Run" value={agent.run_id || '—'} />
                  <MetaRow label="Autoridad" value={formatToken(agent.authority)} />
                </dl>

                <p className="mt-3 text-xs" style={metaTextStyle()}>
                  {formatToken(agent.freshness)} · {formatEvidence(agent.evidence_refs)}
                </p>
                {agent.missing_source ? (
                  <p className="mt-1 text-xs" style={metaTextStyle()}>
                    {formatMissingSource(agent.missing_source)}
                  </p>
                ) : null}
                {agent.live_hint ? (
                  <p className="mt-1 text-xs" style={metaTextStyle()}>
                    {formatLiveHint(agent.live_hint)}
                  </p>
                ) : null}
              </article>
            ))}
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
