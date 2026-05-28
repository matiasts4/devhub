import React from 'react';
import {
  CountBadge,
  StatusPill,
  formatEvidence,
  formatMissingSource,
  formatToken,
  metaTextStyle,
  panelListStyle,
  panelShellStyle,
  renderEmptyCopy,
  truncateId,
} from './utils';

export default function WorkspacesPanel({ workspaces = [] }) {
  return (
    <section className="border p-4" style={panelShellStyle()} aria-label="Workspaces">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Workspaces</h2>
          <CountBadge count={workspaces.length} />
        </div>
        <p className="text-sm" style={metaTextStyle()}>
          Durable workspace identity, branch, and latest evidence.
        </p>
      </header>

      <div className="max-h-[420px] space-y-3 overflow-y-auto pr-0.5" style={panelListStyle()}>
        {workspaces.length === 0
          ? renderEmptyCopy('No durable workspaces in snapshot.')
          : workspaces.map((workspace) => (
              <article
                key={workspace.workspace_id}
                className="rounded-xl border p-3"
                style={panelShellStyle()}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3
                      className="font-medium font-mono text-sm truncate"
                      title={workspace.workspace_id}
                    >
                      {truncateId(workspace.workspace_id)}
                    </h3>
                    {workspace.branch_name && (
                      <p className="text-xs truncate" style={metaTextStyle()}>
                        {workspace.branch_name}
                      </p>
                    )}
                  </div>
                  <StatusPill status={workspace.status} />
                </div>

                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <MetaRow
                    label="Agent"
                    value={workspace.agent_id ? truncateId(workspace.agent_id) : '—'}
                    title={workspace.agent_id}
                  />
                  <MetaRow
                    label="Task"
                    value={workspace.task_id ? truncateId(workspace.task_id) : '—'}
                    title={workspace.task_id}
                  />
                  <MetaRow label="Authority" value={<StatusPill status={workspace.authority} />} />
                </dl>

                <p className="mt-3 text-xs" style={metaTextStyle()}>
                  {formatToken(workspace.freshness)} · {formatEvidence(workspace.evidence_refs)}
                </p>
                {workspace.missing_source ? (
                  <p className="mt-1 text-xs" style={metaTextStyle()}>
                    {formatMissingSource(workspace.missing_source)}
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
