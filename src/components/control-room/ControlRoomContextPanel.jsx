import { formatToken, formatEvidence, formatMissingSource, panelShellStyle } from './utils';

export default function ControlRoomContextPanel({ header = {}, missionSummary = null }) {
  return (
    <div className="space-y-4">
      <MissionSummaryStrip missionSummary={missionSummary} />

      <div className="rounded-xl border px-3 py-3 text-sm" style={panelShellStyle()}>
        <span style={{ color: 'var(--text-muted)' }}>Evidencia: </span>
        <span>{formatEvidence(header.evidence_refs)}</span>
        {header.missing_source ? (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            {formatMissingSource(header.missing_source)}
          </p>
        ) : null}
      </div>
    </div>
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
    <div className="rounded-xl border px-3 py-3" style={panelShellStyle()}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--text-muted)' }}
          >
            Contexto de misión
          </p>
          <p className="text-sm font-medium">
            {missionSummary.title || 'Sin misión activa'}
            {missionSummary.status ? ` · ${formatToken(missionSummary.status)}` : ''}
          </p>
          {missionSummary.latestMessageSummary ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {missionSummary.latestMessageSummary}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
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
