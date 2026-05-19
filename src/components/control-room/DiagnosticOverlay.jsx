import React from 'react';
import {
  formatEvidence,
  formatMissingSource,
  formatToken,
  metaTextStyle,
  panelShellStyle,
  renderEmptyCopy,
} from './utils';

const DIAGNOSTIC_ORDER = [
  ['telegram', 'Telegram'],
  ['mcp', 'MCP'],
  ['process', 'Process'],
  ['session_stream', 'Session stream'],
];

export default function DiagnosticOverlay({ diagnostics = {}, expanded = true, onToggle }) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={panelShellStyle()}
      aria-label="Diagnostic overlay"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Diagnostic overlay</h2>
          <p className="text-sm" style={metaTextStyle()}>
            Adapter and process diagnostics remain secondary to the durable control-room snapshot.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg border px-3 py-2 text-xs"
          style={panelShellStyle()}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {DIAGNOSTIC_ORDER.map(([key, label]) => {
            const record = diagnostics?.[key];

            return (
              <article key={key} className="rounded-xl border p-3" style={panelShellStyle()}>
                <h3 className="font-medium">{label}</h3>
                <p className="mt-2 text-sm">{formatToken(record.status)}</p>
                <p className="mt-1 text-xs" style={metaTextStyle()}>
                  {formatToken(record.authority)} · {formatToken(record.freshness)}
                </p>
                <p className="mt-2 text-xs" style={metaTextStyle()}>
                  {formatEvidence(record.evidence_refs)}
                </p>
                {record.missing_source ? (
                  <p className="mt-1 text-xs" style={metaTextStyle()}>
                    {formatMissingSource(record.missing_source)}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
