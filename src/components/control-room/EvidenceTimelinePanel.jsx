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
} from './utils';

const MAX_SECONDARY = 3;

function formatOccurredAt(value) {
  return value || 'Sin timestamp durable';
}

export default function EvidenceTimelinePanel({ items = [] }) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={panelShellStyle()}
      aria-label="Timeline de evidencia"
    >
      <header className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Timeline de evidencia</h2>
            <CountBadge count={items.length} />
          </div>
          <span className="text-xs font-medium" style={metaTextStyle()}>
            Solo lectura
          </span>
        </div>
        <p className="text-sm" style={metaTextStyle()}>
          Narrativa ordenada desde verdad durable ya normalizada.
        </p>
      </header>

      <div className="max-h-[480px] space-y-3 overflow-y-auto pr-0.5" style={panelListStyle()}>
        {items.length === 0
          ? renderEmptyCopy('Sin eventos durables en este snapshot.')
          : items.map((item) => (
              <article
                key={`${item.kind || 'timeline'}-${item.item_id || item.occurred_at || 'unknown'}`}
                className="rounded-xl border p-3"
                style={panelShellStyle()}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-sm">
                    {item.summary || 'Evento durable sin resumen'}
                  </h3>
                  <StatusPill status={item.kind} />
                </div>

                <p className="mt-2 text-xs" style={metaTextStyle()}>
                  {formatOccurredAt(item.occurred_at)}
                </p>

                <p className="mt-2 text-xs" style={metaTextStyle()}>
                  {formatToken(item.authority)} · {formatToken(item.freshness)} ·{' '}
                  {formatEvidence(item.evidence_refs)}
                </p>

                {item.missing_source ? (
                  <p className="mt-1 text-xs" style={metaTextStyle()}>
                    {formatMissingSource(item.missing_source)}
                  </p>
                ) : null}

                {item.secondary_session_evidence?.length ? (
                  <div
                    className="mt-3 space-y-2 rounded-lg border px-3 py-2"
                    style={panelShellStyle()}
                  >
                    {item.secondary_session_evidence
                      .slice(0, MAX_SECONDARY)
                      .map((secondary, index) => (
                        <div key={`${item.item_id || 'timeline'}-secondary-${index}`}>
                          <div className="text-xs font-medium">{secondary.label}</div>
                          <div className="text-sm">
                            {secondary.summary || 'Sin resumen secundario'}
                          </div>
                          <div className="text-xs" style={metaTextStyle()}>
                            {formatToken(secondary.authority)} · {secondary.source || 'unknown'} ·{' '}
                            {formatOccurredAt(secondary.observed_at)}
                          </div>
                        </div>
                      ))}
                    {item.secondary_session_evidence.length > MAX_SECONDARY ? (
                      <p className="text-xs" style={metaTextStyle()}>
                        +{item.secondary_session_evidence.length - MAX_SECONDARY} más…
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
      </div>
    </section>
  );
}
