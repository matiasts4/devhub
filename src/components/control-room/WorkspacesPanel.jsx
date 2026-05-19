import React from 'react';
import {
  formatEvidence,
  formatMissingSource,
  formatToken,
  metaTextStyle,
  panelShellStyle,
  renderEmptyCopy,
} from './utils';

export default function WorkspacesPanel({ workspaces = [] }) {
  return (
    <section className="rounded-2xl border p-4" style={panelShellStyle()} aria-label="Workspaces">
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Workspaces</h2>
        <p className="text-sm" style={metaTextStyle()}>
          Durable workspace identity, branch, and latest evidence.
        </p>
      </header>

      <div className="space-y-3">
        {workspaces.length === 0
          ? renderEmptyCopy('No durable workspaces in snapshot.')
          : workspaces.map((workspace) => (
              <article
                key={workspace.workspace_id}
                className="rounded-xl border p-3"
                style={panelShellStyle()}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{workspace.workspace_id}</h3>
                  <span className="text-xs" style={metaTextStyle()}>
                    {formatToken(workspace.status)}
                  </span>
                </div>

                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <MetaRow label="Branch" value={workspace.branch_name || '—'} />
                  <MetaRow label="Agent" value={workspace.agent_id || '—'} />
                  <MetaRow label="Task" value={workspace.task_id || '—'} />
                  <MetaRow label="Authority" value={formatToken(workspace.authority)} />
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
