import React from 'react';
import {
  formatEvidence,
  formatMissingSource,
  formatToken,
  metaTextStyle,
  panelShellStyle,
} from './utils';

export default function ControlRoomHeader({ header, loading, projectName, missionSummary = null }) {
  return (
    <section
      className="rounded-2xl border p-5"
      style={panelShellStyle()}
      aria-label="Control Room Header"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={metaTextStyle()}>
            Swarm / Control Room
          </p>
          <h1 className="text-2xl font-semibold">{projectName || 'Swarm / Control Room'}</h1>
          <p className="text-sm" style={metaTextStyle()}>
            Supervisor {formatToken(header.supervisor_state)}
            {loading ? ' · cargando snapshot…' : ''}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Agentes" value={`${header.active}/${header.max} activos`} />
          <MetricCard label="Cola" value={`${header.queue_depth} en cola`} />
          <MetricCard label="Autoridad" value={formatToken(header.authority)} />
          <MetricCard label="Frescura" value={formatToken(header.freshness)} />
        </div>
      </div>

      <MissionSummaryStrip missionSummary={missionSummary} />

      <div className="mt-4 rounded-xl border px-3 py-3 text-sm" style={panelShellStyle()}>
        <span style={metaTextStyle()}>Evidencia: </span>
        <span>{formatEvidence(header.evidence_refs)}</span>
        {header.missing_source ? (
          <p className="mt-2 text-xs" style={metaTextStyle()}>
            {formatMissingSource(header.missing_source)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function MissionSummaryStrip({ missionSummary = null }) {
  if (!missionSummary?.title && !missionSummary?.latestMessageSummary) {
    return null;
  }

  const participantLabel = pluralize(
    missionSummary.participantCount,
    'participante',
    'participantes'
  );
  const deliveryLabel = pluralize(
    missionSummary.pendingDeliveryCount,
    'entrega pendiente',
    'entregas pendientes'
  );
  const presenceLabel = `${missionSummary.activePresenceCount || 0} activas · ${missionSummary.stalePresenceCount || 0} vencidas · ${missionSummary.offlinePresenceCount || 0} offline`;

  return (
    <div className="mt-4 rounded-xl border px-3 py-3" style={panelShellStyle()}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={metaTextStyle()}>
            Contexto de misión
          </p>
          <p className="text-sm font-medium">
            {missionSummary.title || 'Sin misión activa'}
            {missionSummary.status ? ` · ${formatToken(missionSummary.status)}` : ''}
          </p>
          {missionSummary.latestMessageSummary ? (
            <p className="text-sm" style={metaTextStyle()}>
              {missionSummary.latestMessageSummary}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 text-xs" style={metaTextStyle()}>
          <SummaryChip label={`${missionSummary.participantCount || 0} ${participantLabel}`} />
          <SummaryChip label={`${missionSummary.pendingDeliveryCount || 0} ${deliveryLabel}`} />
          <SummaryChip label={presenceLabel} />
        </div>
      </div>
    </div>
  );
}

function SummaryChip({ label }) {
  return (
    <span className="rounded-full border px-2.5 py-1" style={panelShellStyle()}>
      {label}
    </span>
  );
}

function pluralize(count, singular, plural) {
  return Number(count) === 1 ? singular : plural;
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl border px-3 py-3" style={panelShellStyle()}>
      <div className="text-xs uppercase tracking-wide" style={metaTextStyle()}>
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
