import React from 'react';
import { formatToken, metaTextStyle, panelShellStyle, renderEmptyCopy } from './utils';

const MAX_VISIBLE_ITEMS = 5;

function buildHandoffSummary(handoff = null) {
  if (!handoff || handoff.status === 'idle') return null;

  return {
    status: handoff.status || 'idle',
    message: handoff.message || null,
    task: handoff.task || null,
    workspace: handoff.workspace || null,
    run: handoff.run || null,
    artifact: handoff.artifact || null,
    supervisor: handoff.supervisor || null,
  };
}

export default function DirectorQueuePanel({
  queue = null,
  handoffDisabled = true,
  handoffDisabledReason = null,
  isSubmitting = false,
  onClaimNext = null,
}) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);
  const hasOverflow = items.length > visibleItems.length;
  const handoff = buildHandoffSummary(queue?.handoff);
  const canClaim = !handoffDisabled && typeof onClaimNext === 'function' && !isSubmitting;

  return (
    <section
      className="rounded-2xl border p-4"
      style={panelShellStyle()}
      aria-label="Cola del director"
    >
      <header className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Cola del director</h2>
            <p className="text-sm" style={metaTextStyle()}>
              Solo lectura. Proyección durable sin acciones de claim en esta etapa.
            </p>
          </div>

          <div className="text-xs" style={metaTextStyle()}>
            {formatToken(queue?.authority)} · {formatToken(queue?.freshness)}
          </div>
        </div>

        <p className="text-sm" style={metaTextStyle()}>
          Hacé checkpoint local de la tarea actual antes del próximo claim.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            style={panelShellStyle()}
            disabled={!canClaim}
            onClick={() => onClaimNext?.()}
          >
            {isSubmitting ? 'Reclamando durable…' : 'Tomar siguiente durable'}
          </button>

          <p className="text-xs" style={metaTextStyle()}>
            {handoffDisabledReason || 'El refresh del servidor sigue siendo la única verdad.'}
          </p>
        </div>
        {hasOverflow ? (
          <p className="text-xs" style={metaTextStyle()}>
            Mostrando {visibleItems.length} de {items.length} tareas durables.
          </p>
        ) : null}
      </header>

      <div className="space-y-3">
        {visibleItems.length === 0
          ? renderEmptyCopy('Sin tareas durables listas o bloqueadas en este snapshot.')
          : visibleItems.map((item) => (
              <article
                key={item.id || `${item.position}-${item.title}`}
                className="rounded-xl border p-3"
                style={panelShellStyle()}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{item.position}</span>
                      <h3 className="font-medium">{item.title || 'Sin título durable'}</h3>
                    </div>
                    <p className="text-sm" style={metaTextStyle()}>
                      {item.id || 'Sin id'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge
                      label={item.status === 'blocked' ? 'Bloqueada' : formatToken(item.status)}
                    />
                    {item.priority ? <Badge label={String(item.priority)} /> : null}
                  </div>
                </div>

                {item.blocked_reason ? (
                  <p className="mt-3 text-xs" style={metaTextStyle()}>
                    {item.blocked_reason}
                  </p>
                ) : null}

                {item.checkpoint_gate ? (
                  <div className="mt-3 space-y-1 text-xs" style={metaTextStyle()}>
                    <p>{item.checkpoint_gate.code || item.checkpoint_gate.status}</p>
                    {item.checkpoint_gate.message ? <p>{item.checkpoint_gate.message}</p> : null}
                    {item.checkpoint_gate.remediation ? (
                      <p>{item.checkpoint_gate.remediation}</p>
                    ) : null}
                    {item.checkpoint_gate.checkpoint ? (
                      <p>
                        commit={item.checkpoint_gate.checkpoint.commit || 'none'} · worktree=
                        {item.checkpoint_gate.checkpoint.worktree || 'unknown'}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
      </div>

      {handoff ? (
        <section className="mt-4 rounded-xl border p-3" style={panelShellStyle()}>
          <h3 className="text-sm font-semibold">Resultado durable del handoff</h3>
          {handoff.message ? (
            <p className="mt-2 text-sm" style={metaTextStyle()}>
              {handoff.message}
            </p>
          ) : null}

          {handoff.task ? (
            <dl className="mt-3 space-y-1 text-sm">
              <div>
                <dt className="font-medium">Tarea</dt>
                <dd>{handoff.task.title || handoff.task.id || 'Sin tarea durable'}</dd>
              </div>
              {handoff.workspace?.workspace_id ? (
                <div>
                  <dt className="font-medium">Workspace</dt>
                  <dd>{handoff.workspace.workspace_id}</dd>
                </div>
              ) : null}
              {handoff.run?.run_id ? (
                <div>
                  <dt className="font-medium">Run</dt>
                  <dd>{handoff.run.run_id}</dd>
                </div>
              ) : null}
              {handoff.supervisor?.supervisor_state ? (
                <div>
                  <dt className="font-medium">Supervisor</dt>
                  <dd>{String(handoff.supervisor.supervisor_state).replace(/_/g, ' ')}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function Badge({ label }) {
  return (
    <span className="rounded-full border px-2.5 py-1" style={panelShellStyle()}>
      {label}
    </span>
  );
}
