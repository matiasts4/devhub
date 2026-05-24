import React from 'react';
import {
  StatusPill,
  formatEvidence,
  formatMissingSource,
  formatToken,
  metaTextStyle,
  panelShellStyle,
} from './utils';

const DIAGNOSTIC_ORDER = [
  ['telegram', 'Telegram'],
  ['mcp', 'MCP'],
  ['process', 'Proceso'],
  ['session_stream', 'Stream de sesión'],
  ['runtime', 'Runtime'],
];

function parseRuntimeEvidenceRef(ref = '') {
  const raw = String(ref || '').trim();
  if (!raw) return null;

  const logMatch = raw.match(/^log:\/\/([^:]+):(.+)$/);
  if (logMatch) {
    return {
      kind: 'log',
      label: logMatch[1],
      path: logMatch[2],
    };
  }

  const crashMatch = raw.match(/^crashdump:\/\/([^:]+):(.+)$/);
  if (crashMatch) {
    return {
      kind: 'crashdump',
      label: crashMatch[1],
      path: crashMatch[2],
    };
  }

  return {
    kind: 'generic',
    label: raw,
    path: raw,
  };
}

async function copyEvidencePath(pathValue) {
  if (!pathValue || typeof navigator === 'undefined' || !navigator?.clipboard?.writeText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(pathValue);
  } catch {
    // Ignore clipboard failures; this is a convenience action only.
  }
}

function buildRuntimeSummaryLines(record = {}) {
  const metrics = record?.metrics || {};
  return [
    `status=${record?.status || 'unknown'}`,
    `quota_blocked=${Boolean(metrics.quota_blocked)}`,
    `reattachable_terminals=${Number(metrics.reattachable_terminals || 0)}`,
    `orphaned_processes=${Number(metrics.orphaned_processes || 0)}`,
    `stale_registry_agents=${Number(metrics.stale_registry_agents || 0)}`,
    `total_terminals=${Number(metrics.total_terminals || 0)}`,
    `total_processes=${Number(metrics.total_processes || 0)}`,
    `total_registry_agents=${Number(metrics.total_registry_agents || 0)}`,
  ];
}

async function copyRuntimeSummary(record = {}) {
  await copyEvidencePath(buildRuntimeSummaryLines(record).join('\n'));
}

async function copyRuntimeRecord(record = {}) {
  await copyEvidencePath(JSON.stringify(record || {}, null, 2));
}

function RuntimeSnapshotActions({ record = null }) {
  if (!record || typeof record !== 'object') return null;

  const metrics = record.metrics || {};
  const reattachableCount = Number(metrics.reattachable_terminals || 0);
  const orphanedProcessCount = Number(metrics.orphaned_processes || 0);
  const staleRegistryCount = Number(metrics.stale_registry_agents || 0);
  const quotaBlocked = Boolean(metrics.quota_blocked);

  return (
    <div className="mt-2 space-y-2" aria-label="Runtime restore summary">
      <div className="flex flex-wrap gap-2 text-[11px]" style={metaTextStyle()}>
        <span>Reattachables: {reattachableCount}</span>
        <span>Orphaned: {orphanedProcessCount}</span>
        <span>Stale registry: {staleRegistryCount}</span>
        <span>Quota: {quotaBlocked ? 'blocked' : 'ok'}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copyRuntimeSummary(record)}
          className="rounded-md border px-2 py-1 text-[11px]"
          style={panelShellStyle()}
        >
          Copy runtime summary
        </button>
        <button
          type="button"
          onClick={() => copyRuntimeRecord(record)}
          className="rounded-md border px-2 py-1 text-[11px]"
          style={panelShellStyle()}
        >
          Export runtime JSON
        </button>
      </div>
    </div>
  );
}

function RuntimeEvidenceActions({ refs = [] }) {
  if (!Array.isArray(refs) || refs.length === 0) return null;

  const parsedRefs = refs.map(parseRuntimeEvidenceRef).filter(Boolean);
  if (parsedRefs.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2" aria-label="Runtime evidence actions">
      {parsedRefs.map((entry, index) => {
        const buttonLabel =
          entry.kind === 'crashdump' ? `Crash: ${entry.label}` : `Log: ${entry.label}`;

        return (
          <button
            key={`${entry.path}-${index}`}
            type="button"
            onClick={() => copyEvidencePath(entry.path)}
            title={entry.path}
            className="rounded-md border px-2 py-1 text-[11px]"
            style={panelShellStyle()}
          >
            {buttonLabel}
          </button>
        );
      })}
    </div>
  );
}

export default function DiagnosticOverlay({ diagnostics = {}, expanded = true, onToggle }) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={panelShellStyle()}
      aria-label="Overlay diagnóstico"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Overlay diagnóstico</h2>
          <p className="text-sm" style={metaTextStyle()}>
            Diagnósticos de adaptadores y proceso siguen siendo secundarios al snapshot durable.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg border px-3 py-2 text-xs"
          style={panelShellStyle()}
        >
          {expanded ? 'Colapsar' : 'Expandir'}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
          {DIAGNOSTIC_ORDER.map(([key, label]) => {
            const record = diagnostics?.[key];

            return (
              <article key={key} className="rounded-xl border p-3" style={panelShellStyle()}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">{label}</h3>
                  <StatusPill status={record?.status} />
                </div>
                <p className="mt-1 text-xs" style={metaTextStyle()}>
                  {formatToken(record?.authority)} · {formatToken(record?.freshness)}
                </p>
                <p className="mt-2 text-xs" style={metaTextStyle()}>
                  {formatEvidence(record?.evidence_refs)}
                </p>
                {key === 'runtime' ? <RuntimeEvidenceActions refs={record?.evidence_refs} /> : null}
                {key === 'runtime' ? <RuntimeSnapshotActions record={record} /> : null}
                {record?.missing_source ? (
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
