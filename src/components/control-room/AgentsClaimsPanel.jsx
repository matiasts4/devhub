import React from 'react';
import {
  CountBadge,
  StatusPill,
  formatEvidence,
  formatLiveHint,
  formatMissingSource,
  formatToken,
  metaTextStyle,
  panelListStyle,
  panelShellStyle,
  renderEmptyCopy,
  truncateId,
} from './utils';

export default function AgentsClaimsPanel({ agents = [] }) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={panelShellStyle()}
      aria-label="Agentes y asignaciones"
    >
      <header className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Agentes y asignaciones</h2>
          <CountBadge count={agents.length} />
        </div>
        <p className="text-sm" style={metaTextStyle()}>
          Tareas reclamadas, ventanas de lease, enlaces a workspace y autoridad durable.
        </p>
      </header>

      <div className="max-h-[420px] space-y-3 overflow-y-auto pr-0.5" style={panelListStyle()}>
        {agents.length === 0
          ? renderEmptyCopy('Sin agentes durables en este snapshot.')
          : agents.map((agent) => (
              <article
                key={agent.agent_id}
                className="rounded-xl border p-3"
                style={panelShellStyle()}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium font-mono text-sm truncate" title={agent.agent_id}>
                      {truncateId(agent.agent_id)}
                    </h3>
                    <p className="text-xs truncate" style={metaTextStyle()} title={agent.task_id}>
                      {agent.task_id ? truncateId(agent.task_id) : 'Sin tarea reclamada'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusPill status={agent.supervisor_state} />
                  </div>
                </div>

                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <MetaRow label="Lease" value={agent.lease_expires_at || '—'} />
                  <MetaRow
                    label="Workspace"
                    value={agent.workspace_id ? truncateId(agent.workspace_id) : '—'}
                    title={agent.workspace_id}
                  />
                  <MetaRow
                    label="Run"
                    value={agent.run_id ? truncateId(agent.run_id) : '—'}
                    title={agent.run_id}
                  />
                  <MetaRow label="Autoridad" value={<StatusPill status={agent.authority} />} />
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

function MetaRow({ label, value, title }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide" style={metaTextStyle()}>
        {label}
      </dt>
      <dd title={title}>{value}</dd>
    </div>
  );
}
