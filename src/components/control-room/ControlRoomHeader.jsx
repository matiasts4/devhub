import React from 'react';
import {
  dataTileStyle,
  filterBarStyle,
  panelStyle,
  pillStyle,
  sectionSurfaceStyle,
} from '../../chrome/morphology';
import {
  formatEvidence,
  formatMissingSource,
  formatToken,
  metaTextStyle,
} from './utils';

export default function ControlRoomHeader({ header, loading, projectName, missionSummary = null }) {
  return (
    <section
      className="p-5 md:p-6"
      style={panelStyle({ emphasized: true })}
      aria-label="Control Room Header"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={metaTextStyle()}>
            Swarm / Control Room
          </p>
          <h1 className="text-xl md:text-2xl font-semibold truncate">
            {projectName || 'Swarm / Control Room'}
          </h1>
          <p className="text-sm" style={metaTextStyle()}>
            Supervisor {formatToken(header.supervisor_state)}
            {loading ? ' · cargando snapshot…' : ''}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 min-w-0 w-full lg:w-auto">
          <MetricCard label="Agentes" value={`${header.active}/${header.max} activos`} />
          <MetricCard label="Cola" value={`${header.queue_depth} en cola`} />
          <MetricCard label="Autoridad" value={formatToken(header.authority)} />
          <MetricCard label="Frescura" value={formatToken(header.freshness)} />
        </div>
      </div>

      <MissionSummaryStrip missionSummary={missionSummary} />

      <div className="mt-4 px-3 py-3 text-sm" style={sectionSurfaceStyle()}>
        <p className="text-xs font-semibold uppercase tracking-[0.15em]" style={metaTextStyle()}>
          Evidencia durable
        </p>
        <p className="mt-1 break-all">{formatEvidence(header.evidence_refs)}</p>
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
  const presenceLabel = `${missionSummary.activePresenceCount || 0} activas · ${missionSummary.stalePresenceCount || 0} vencidas · ${missionSummary.offlinePresenceCount || 0} fuera de línea`;

  return (
    <div className="mt-4 px-3 py-3" style={filterBarStyle()}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={metaTextStyle()}>
            Contexto de misión
          </p>
          <p className="text-sm font-medium break-words">
            {missionSummary.title || 'Sin misión activa'}
            {missionSummary.status ? ` · ${formatToken(missionSummary.status)}` : ''}
          </p>
          {missionSummary.latestMessageSummary ? (
            <p className="text-sm break-words" style={metaTextStyle()}>
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
  return <span style={pillStyle()}>{label}</span>;
}

function pluralize(count, singular, plural) {
  return Number(count) === 1 ? singular : plural;
}

function MetricCard({ label, value }) {
  return (
    <div className="px-3 py-2.5" style={dataTileStyle()}>
      <div className="text-[11px] uppercase tracking-wide" style={metaTextStyle()}>
        {label}
      </div>
      <div className="mt-1 text-sm font-medium leading-snug">{value}</div>
    </div>
  );
}
