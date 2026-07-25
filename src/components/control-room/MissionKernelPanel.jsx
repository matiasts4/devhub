import { useMemo, useRef, useState } from 'react';
import { selectDirectorBriefingPreview } from '@/lib/operations/swarmControl';
import { codeBlockStyle } from '../../chrome/morphology.js';
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
  idle: 'idle',
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
  const visibleEntries = entries.slice(0, 4);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{label}</h4>
      {entries.length === 0
        ? renderEmptyCopy(`Sin presencia ${label.toLowerCase()} en este snapshot.`)
        : visibleEntries.map((entry) => (
            <article
              key={entry.presence_id || `${label}-${entry.agent_id}`}
              className="border p-3"
              style={panelShellStyle()}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-sm break-all">
                  {entry.agent_id || 'Agente sin id'}
                </div>
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
      {entries.length > visibleEntries.length ? (
        <p className="text-xs" style={metaTextStyle()}>
          +{entries.length - visibleEntries.length} más…
        </p>
      ) : null}
    </div>
  );
}

function getEligibleParticipants(participants = [], mission = null) {
  if (!mission?.mission_id) return [];
  return participants.filter(
    (participant) =>
      participant?.agent_id &&
      participant.status === 'active' &&
      participant.role_in_mission !== 'director'
  );
}

function DirectorBriefingPreview({ preview }) {
  return (
    <section
      className="border p-3"
      style={panelShellStyle()}
      aria-label="Vista previa para dirección"
    >
      <h4 className="text-sm font-semibold">Vista previa para dirección</h4>
      <p className="mt-1 text-xs" style={metaTextStyle()}>
        Derivada solo del snapshot durable actual y la selección local.
      </p>

      {preview.state === 'ready' ? (
        <pre
          className="mt-3 whitespace-pre-wrap text-xs leading-6"
          style={{
            ...codeBlockStyle(),
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {preview.previewText}
        </pre>
      ) : preview.state === 'unavailable' ? (
        <div className="mt-3">
          {renderEmptyCopy(
            'La selección actual no tiene destinatarios elegibles en este snapshot.'
          )}
        </div>
      ) : (
        <div className="mt-3">
          {renderEmptyCopy(
            'Seleccioná al menos un destinatario activo para generar la vista previa.'
          )}
        </div>
      )}
    </section>
  );
}

function updateSelectedRecipientIds(current, agentId, checked) {
  if (!agentId) return current;
  if (checked) {
    return current.includes(agentId) ? current : [...current, agentId];
  }
  return current.filter((value) => value !== agentId);
}

function handleRecipientToggle(setSubmitError, setSelectedRecipientIds, agentId, checked) {
  setSubmitError('');
  setSelectedRecipientIds((current) => updateSelectedRecipientIds(current, agentId, checked));
}

function orderSelectedRecipientIds(eligibleParticipants, selectedRecipientIds) {
  const selectedIds = new Set(selectedRecipientIds.filter(Boolean));

  return eligibleParticipants
    .map((participant) => participant.agent_id)
    .filter((agentId) => selectedIds.has(agentId));
}

function buildPreviewState(missionControl, selectedRecipientIds, eligibleParticipants) {
  const selectedEligibleRecipientIds = orderSelectedRecipientIds(
    eligibleParticipants,
    selectedRecipientIds
  );

  if (selectedRecipientIds.length > 0 && selectedEligibleRecipientIds.length === 0) {
    return {
      state: 'unavailable',
      recipientIds: [],
      lines: [],
      previewText: '',
    };
  }

  return selectDirectorBriefingPreview(missionControl, selectedEligibleRecipientIds);
}

export default function MissionKernelPanel({ missionControl, onComposerSubmit = null }) {
  const mission = missionControl?.mission || null;
  const participants = missionControl?.participants || [];
  const recentMessages = missionControl?.recent_messages || [];
  const pendingDeliveries = missionControl?.pending_deliveries || [];
  const presence = missionControl?.presence || { active: [], stale: [], offline: [] };
  const eligibleParticipants = useMemo(
    () => getEligibleParticipants(participants, mission),
    [participants, mission]
  );
  const composerFormRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const canSubmit = Boolean(mission?.mission_id) && eligibleParticipants.length > 0;
  const hasPresence =
    presence.active.length > 0 || presence.stale.length > 0 || presence.offline.length > 0;

  return (
    <section
      className="border p-4 h-full min-h-[460px] max-h-[700px] flex flex-col"
      style={panelShellStyle()}
      aria-label="Kernel de misión"
    >
      <header className="mb-4 shrink-0">
        <h2 className="text-lg font-semibold">Kernel de misión</h2>
        <p className="text-sm" style={metaTextStyle()}>
          Snapshot durable y de solo lectura para dirección dentro de Swarm / Control Room.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2 flex-1 min-h-0">
        <div className="space-y-4 min-h-0 overflow-y-auto pr-1">
          <MissionOverviewSection mission={mission} />

          <RecentMessagesSection recentMessages={recentMessages} />

          <PendingDeliveriesSection pendingDeliveries={pendingDeliveries} />

          <PresenceSummarySection presence={presence} hasPresence={hasPresence} />
        </div>

        <div className="space-y-4 min-h-0 overflow-y-auto pr-1">
          <ParticipantsSection participants={participants} />

          <ComposerSection
            mission={mission}
            missionControl={missionControl}
            eligibleParticipants={eligibleParticipants}
            onComposerSubmit={onComposerSubmit}
            composerFormRef={composerFormRef}
            isSubmitting={isSubmitting}
            submitError={submitError}
            setIsSubmitting={setIsSubmitting}
            setSubmitError={setSubmitError}
            canSubmit={canSubmit}
          />
        </div>
      </div>
    </section>
  );
}

function MissionOverviewSection({ mission }) {
  return (
    <section className="border p-3" style={panelShellStyle()}>
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
  );
}

function RecentMessagesSection({ recentMessages }) {
  return (
    <section className="border p-3" style={panelShellStyle()}>
      <h3 className="text-sm font-semibold">Mensajes recientes</h3>
      <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
        {recentMessages.length === 0
          ? renderEmptyCopy('Sin mensajes recientes en este snapshot.')
          : recentMessages.map((message) => (
              <article key={message.message_id} className="border p-3" style={panelShellStyle()}>
                <div className="font-medium">{message.body_summary || 'Mensaje sin resumen'}</div>
                <p className="mt-1 text-xs" style={metaTextStyle()}>
                  {formatMissionToken(message.message_kind)} ·{' '}
                  {message.sender_agent_id || 'sin emisor'} ·{' '}
                  {message.created_at || 'sin timestamp'}
                </p>
              </article>
            ))}
      </div>
    </section>
  );
}

function PendingDeliveriesSection({ pendingDeliveries }) {
  return (
    <section className="border p-3" style={panelShellStyle()}>
      <h3 className="text-sm font-semibold">Entregas pendientes</h3>
      <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
        {pendingDeliveries.length === 0
          ? renderEmptyCopy('Sin entregas pendientes en este snapshot.')
          : pendingDeliveries.map((delivery) => (
              <article
                key={delivery.delivery_id || `${delivery.recipient_agent_id}-${delivery.channel}`}
                className="border p-3"
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
                  {formatToken(delivery.channel || 'canal desconocido')} · último intento{' '}
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
  );
}

function PresenceSummarySection({ presence, hasPresence }) {
  return (
    <section className="border p-3" style={panelShellStyle()}>
      <h3 className="text-sm font-semibold">Presencia TTL</h3>
      <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <PresenceGroup label="Activa" entries={presence.active} />
        <PresenceGroup label="Vencida" entries={presence.stale} />
        <PresenceGroup label="Fuera de línea" entries={presence.offline} />
      </div>
      {hasPresence ? null : renderEmptyCopy('Sin presencia TTL en este snapshot.')}
    </section>
  );
}

function ParticipantsSection({ participants }) {
  return (
    <section className="border p-3" style={panelShellStyle()}>
      <h3 className="text-sm font-semibold">Participantes</h3>
      <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
        {participants.length === 0
          ? renderEmptyCopy('Sin participantes durables en este snapshot.')
          : participants.map((participant) => (
              <article
                key={participant.participant_id || participant.agent_id}
                className="border p-3"
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
  );
}

function ComposerSection({
  mission,
  missionControl,
  eligibleParticipants,
  onComposerSubmit,
  composerFormRef,
  isSubmitting,
  submitError,
  setIsSubmitting,
  setSubmitError,
  canSubmit,
}) {
  const [selectedRecipientIds, setSelectedRecipientIds] = useState([]);
  const preview = useMemo(
    () => buildPreviewState(missionControl, selectedRecipientIds, eligibleParticipants),
    [eligibleParticipants, missionControl, selectedRecipientIds]
  );

  return (
    <section className="border p-3" style={panelShellStyle()}>
      <h3 className="text-sm font-semibold">Composer local</h3>
      <p className="mt-1 text-xs" style={metaTextStyle()}>
        Redactá una directiva local para participantes activos. Solo persiste mensajes de misión y
        entregas pendientes.
      </p>

      {!mission ? (
        <div className="mt-3">
          {renderEmptyCopy('Sin misión activa para redactar mensajes locales.')}
        </div>
      ) : eligibleParticipants.length === 0 ? (
        <div className="mt-3">
          {renderEmptyCopy('No hay participantes elegibles para este mensaje local.')}
        </div>
      ) : (
        <form
          ref={composerFormRef}
          className="mt-3 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new window.FormData(event.currentTarget);
            const recipientAgentIds = orderSelectedRecipientIds(
              eligibleParticipants,
              selectedRecipientIds
            );
            const bodySummary = String(formData.get('body_summary') || '').trim();

            if (recipientAgentIds.length === 0) {
              setSubmitError('Elegí al menos un destinatario activo.');
              return;
            }

            if (!bodySummary) {
              setSubmitError('Escribí un mensaje breve antes de guardar.');
              return;
            }

            if (!onComposerSubmit) return;

            setIsSubmitting(true);
            setSubmitError('');

            try {
              await onComposerSubmit({
                recipient_agent_ids: recipientAgentIds,
                body_summary: bodySummary,
              });
              composerFormRef.current?.reset();
              setSelectedRecipientIds([]);
            } catch (error) {
              setSubmitError(error?.message || 'No se pudo guardar el mensaje local.');
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide">Destinatarios</legend>
            <div className="space-y-2">
              {eligibleParticipants.map((participant) => {
                return (
                  <label
                    key={participant.participant_id || participant.agent_id}
                    className="flex items-center gap-2 border px-3 py-2 text-sm"
                    style={panelShellStyle()}
                  >
                    <input
                      type="checkbox"
                      name="recipient_agent_ids"
                      value={participant.agent_id}
                      onChange={(event) =>
                        handleRecipientToggle(
                          setSubmitError,
                          setSelectedRecipientIds,
                          participant.agent_id,
                          event.currentTarget.checked
                        )
                      }
                    />
                    <span>{participant.agent_id}</span>
                    <span className="text-xs" style={metaTextStyle()}>
                      {formatMissionToken(participant.role_in_mission)}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <DirectorBriefingPreview preview={preview} />

          <label className="flex flex-col gap-2 text-sm font-medium">
            <span>Mensaje breve</span>
            <textarea
              aria-label="Mensaje breve para la misión"
              name="body_summary"
              className="min-h-[96px] border px-3 py-2 outline-none"
              style={{
                background: 'var(--surface-app)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              placeholder="Ej.: Necesito update del workspace principal antes de QA."
              maxLength={280}
            />
          </label>

          {submitError ? (
            <p className="text-xs" style={{ color: 'var(--text-danger, #f87171)' }}>
              {submitError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: 'var(--surface-app)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {isSubmitting ? 'Guardando…' : 'Guardar mensaje local'}
          </button>
        </form>
      )}
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
