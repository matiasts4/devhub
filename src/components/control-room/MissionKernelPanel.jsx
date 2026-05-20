import React from 'react';
import { formatToken, metaTextStyle, panelShellStyle, renderEmptyCopy } from './utils';

const STATUS_LABELS = Object.freeze({
  planned: 'planificada',
  active: 'activa',
  paused: 'pausada',
  completed: 'completada',
  failed: 'fallida',
  aborted: 'abortada',
  invited: 'invitado',
  removed: 'removido',
  pending: 'pendiente',
  sent: 'enviado',
  retry_pending: 'reintento pendiente',
  expired: 'expirado',
  handoff: 'traspaso',
  directive: 'directiva',
  online: 'en línea',
  busy: 'ocupado',
  idle: 'inactivo',
  waiting: 'en espera',
  offline: 'fuera de línea',
  stale: 'vencida',
});

const ROLE_LABELS = Object.freeze({
  director: 'director',
  executor: 'ejecutor',
  reviewer: 'revisor',
  observer: 'observador',
});

function formatMissionToken(value) {
  const normalized = value == null ? '' : String(value).trim().toLowerCase();
  return STATUS_LABELS[normalized] || ROLE_LABELS[normalized] || formatToken(value);
}

function PresenceGroup({ label, entries = [] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{label}</h4>
      {entries.length === 0
        ? renderEmptyCopy(`Sin presencia ${label.toLowerCase()} en este snapshot.`)
        : entries.map((entry) => (
            <article
              key={entry.presence_id || `${label}-${entry.agent_id}`}
              className="rounded-xl border p-3"
              style={panelShellStyle()}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{entry.agent_id || 'Agente sin id'}</div>
                <div className="text-xs" style={metaTextStyle()}>
                  {formatMissionToken(entry.effective_state)}
                </div>
              </div>
              <p className="mt-2 text-xs" style={metaTextStyle()}>
                {entry.runtime_surface || 'superficie desconocida'} · última señal{' '}
                {entry.last_seen_at || '—'}
              </p>
            </article>
          ))}
    </div>
  );
}

export default function MissionKernelPanel({ missionControl }) {
  const mission = missionControl?.mission || null;
  const participants = missionControl?.participants || [];
  const recentMessages = missionControl?.recent_messages || [];
  const pendingDeliveries = missionControl?.pending_deliveries || [];
  const presence = missionControl?.presence || { active: [], stale: [], offline: [] };

  return (
    <section
      className="rounded-2xl border p-4"
      style={panelShellStyle()}
      aria-label="Kernel de misión"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Kernel de misión</h2>
        <p className="text-sm" style={metaTextStyle()}>
          Snapshot durable y de solo lectura para dirección dentro de Swarm / Control Room.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <section className="rounded-xl border p-3" style={panelShellStyle()}>
            <h3 className="text-sm font-semibold">Misión activa</h3>
            {mission ? (
              <div className="mt-3 space-y-2 text-sm">
                <div className="font-medium">{mission.title || mission.mission_id}</div>
                <p style={metaTextStyle()}>{mission.summary || 'Sin resumen de misión.'}</p>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <MetaRow label="Estado" value={formatMissionToken(mission.status)} />
                  <MetaRow label="Workspace" value={mission.workspace_id || '—'} />
                  <MetaRow label="Run" value={mission.run_id || '—'} />
                  <MetaRow label="Evidencia" value={mission.evidence_ref || 'Sin evidencia'} />
                </dl>
              </div>
            ) : (
              renderEmptyCopy('No hay misión activa')
            )}
          </section>

          <section className="rounded-xl border p-3" style={panelShellStyle()}>
            <h3 className="text-sm font-semibold">Participantes</h3>
            <div className="mt-3 space-y-2">
              {participants.length === 0
                ? renderEmptyCopy('Sin participantes durables en este snapshot.')
                : participants.map((participant) => (
                    <article
                      key={participant.participant_id || participant.agent_id}
                      className="rounded-lg border p-3"
                      style={panelShellStyle()}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{participant.agent_id}</div>
                        <div className="text-xs" style={metaTextStyle()}>
                          {formatMissionToken(participant.status)}
                        </div>
                      </div>
                      <p className="mt-1 text-xs" style={metaTextStyle()}>
                        {formatMissionToken(participant.role_in_mission)} · desde{' '}
                        {participant.joined_at || '—'}
                      </p>
                    </article>
                  ))}
            </div>
          </section>

          <section className="rounded-xl border p-3" style={panelShellStyle()}>
            <h3 className="text-sm font-semibold">Mensajes recientes</h3>
            <div className="mt-3 space-y-2">
              {recentMessages.length === 0
                ? renderEmptyCopy('Sin mensajes recientes en este snapshot.')
                : recentMessages.map((message) => (
                    <article
                      key={message.message_id}
                      className="rounded-lg border p-3"
                      style={panelShellStyle()}
                    >
                      <div className="font-medium">
                        {message.body_summary || 'Mensaje sin resumen'}
                      </div>
                      <p className="mt-1 text-xs" style={metaTextStyle()}>
                        {formatMissionToken(message.message_kind)} ·{' '}
                        {message.sender_agent_id || 'sin emisor'} ·{' '}
                        {message.created_at || 'sin timestamp'}
                      </p>
                    </article>
                  ))}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border p-3" style={panelShellStyle()}>
            <h3 className="text-sm font-semibold">Entregas pendientes</h3>
            <div className="mt-3 space-y-2">
              {pendingDeliveries.length === 0
                ? renderEmptyCopy('Sin entregas pendientes en este snapshot.')
                : pendingDeliveries.map((delivery) => (
                    <article
                      key={
                        delivery.delivery_id || `${delivery.recipient_agent_id}-${delivery.channel}`
                      }
                      className="rounded-lg border p-3"
                      style={panelShellStyle()}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">
                          {delivery.recipient_agent_id || 'destino desconocido'}
                        </div>
                        <div className="text-xs" style={metaTextStyle()}>
                          {formatMissionToken(delivery.status)}
                        </div>
                      </div>
                      <p className="mt-1 text-xs" style={metaTextStyle()}>
                        {delivery.channel || 'canal desconocido'} · último intento{' '}
                        {delivery.last_attempt_at || '—'}
                      </p>
                      {delivery.last_error ? (
                        <p className="mt-1 text-xs" style={metaTextStyle()}>
                          {delivery.last_error}
                        </p>
                      ) : null}
                    </article>
                  ))}
            </div>
          </section>

          <section className="rounded-xl border p-3" style={panelShellStyle()}>
            <h3 className="text-sm font-semibold">Presencia TTL</h3>
            <div className="mt-3 grid gap-4 lg:grid-cols-3">
              <PresenceGroup label="Activa" entries={presence.active} />
              <PresenceGroup label="Vencida" entries={presence.stale} />
              <PresenceGroup label="Fuera de línea" entries={presence.offline} />
            </div>
            {presence.active.length === 0 &&
            presence.stale.length === 0 &&
            presence.offline.length === 0
              ? renderEmptyCopy('Sin presencia TTL en este snapshot.')
              : null}
          </section>
        </div>
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
