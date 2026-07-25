import { dispatchOperationalNotification } from '@/lib/operations/notify';
import { getAgentDisplayName } from '@/lib/agents/agentDisplayNames';

const runningStartedAtMap = new Map();
const lastNotificationSentAtMap = new Map();
const MIN_RUNNING_DURATION_MS = 3000;
const NOTIFICATION_COOLDOWN_MS = 10000;

/**
 * DONE-EVIDENCE-01: reasons that count as POSITIVE evidence of "done".
 * Anything else (notably 'quiescence', the silence-based first stage) only
 * flips the badge — it never notifies. Frames without a reason (legacy
 * servers) keep the old behavior so nothing regresses during rollout.
 */
const DONE_EVIDENCE_REASONS = new Set([
  'hook:Stop',
  'hook:Interrupt',
  'hook:StopFailure',
  'hook:SessionEnd',
  'prompt-visible',
  'agent-exit',
  'exit',
  'pty-dead',
  'quiescence-confirmed',
]);

/**
 * Handle state transitions for terminal agents and emit notifications.
 *
 * Sound playback is NOT done here (N1 dedupe): NotificationToastStack is the
 * single owner of sound (it checks user preferences). This bridge only
 * dispatches operational notifications (desktop + in-app).
 *
 * @param {string} panelId
 * @param {string|null} prev - Previous state ('running', 'blocked', 'idle', etc.)
 * @param {string|null} next - Next state ('running', 'blocked', 'idle', etc.)
 * @param {object} [options] - Additional session info (agentType, taskTitle, wasCancelled, reason, reasonChanged)
 */
export function handleAgentStateTransition(panelId, prev, next, options = {}) {
  // A reasonChanged frame carries the same state with new evidence (e.g. the
  // real hook Stop upgrading a quiescence idle) — it must not be skipped by
  // the prev===next guard.
  const reasonUpgrade = Boolean(options.reasonChanged);
  if (!next || (prev === next && !reasonUpgrade)) return;

  const now = Date.now();
  const reason = options.reason || null;

  if (next === 'running') {
    if (!runningStartedAtMap.has(panelId)) {
      runningStartedAtMap.set(panelId, now);
    }
    return;
  }

  const rawAgent = options.agentType || null;
  const agentLabel =
    (rawAgent && getAgentDisplayName(rawAgent)) ||
    (rawAgent ? rawAgent.charAt(0).toUpperCase() + rawAgent.slice(1) : 'Agente');

  const displayTitle = options.taskTitle ? `"${options.taskTitle}"` : `panel ${panelId}`;

  // N6: notify blocked from ANY previous non-blocked state (idle, null,
  // running…). With flaky scraping the permission prompt often arrives from
  // 'idle' — that is exactly when the user must be notified. The prev===next
  // guard above already excludes blocked→blocked; the per-panel cooldown
  // prevents spam.
  if (next === 'blocked') {
    const lastSent = lastNotificationSentAtMap.get(`${panelId}:blocked`) || 0;
    if (now - lastSent < NOTIFICATION_COOLDOWN_MS) return;
    lastNotificationSentAtMap.set(`${panelId}:blocked`, now);

    dispatchOperationalNotification({
      title: `${agentLabel} requiere atención`,
      body: `El agente en ${displayTitle} requiere confirmación o permiso para continuar.`,
      category: 'agents',
      severity: 'warning',
      source: 'terminal',
      entity_id: panelId,
      // N3: stable dedupe_key (no timestamp) so occurrence_count aggregates.
      dedupe_key: `agent:blocked:${panelId}`,
      delivery: { desktop: true, in_app: true },
    }).catch(() => {});
  }
  // Transition from running/blocked -> idle/completed: agent finished task.
  // reasonUpgrade covers idle→idle frames carrying the authoritative evidence
  // that arrived after a silence-based quiescence idle.
  else if (
    (next === 'idle' || next === 'completed') &&
    (prev === 'running' || prev === 'blocked' || reasonUpgrade)
  ) {
    const runningStartedAt = runningStartedAtMap.get(panelId);
    runningStartedAtMap.delete(panelId);

    // Ignore transient running -> idle flickers if running duration was less than 3 seconds
    if (
      prev === 'running' &&
      runningStartedAt &&
      now - runningStartedAt < MIN_RUNNING_DURATION_MS
    ) {
      return;
    }

    // DONE-EVIDENCE-01 gate: only positive evidence notifies "done" — the
    // silence-based 'quiescence' stage never does. A reasonless (legacy)
    // frame keeps the old behavior so nothing regresses during rollout.
    if (reason && !DONE_EVIDENCE_REASONS.has(reason)) return;

    const lastSent = lastNotificationSentAtMap.get(`${panelId}:done`) || 0;
    if (now - lastSent < NOTIFICATION_COOLDOWN_MS) return;
    lastNotificationSentAtMap.set(`${panelId}:done`, now);

    const wasCancelled = Boolean(
      options.wasCancelled || options.cancelled || reason === 'hook:Interrupt'
    );

    if (wasCancelled) {
      dispatchOperationalNotification({
        title: `${agentLabel} — Respuesta cancelada`,
        body: `La ejecución en ${displayTitle} fue cancelada por el usuario.`,
        category: 'agents',
        severity: 'info',
        source: 'terminal',
        entity_id: panelId,
        dedupe_key: `agent:cancelled:${panelId}`,
        delivery: { desktop: true, in_app: true },
      }).catch(() => {});
      return;
    }

    dispatchOperationalNotification({
      title: `${agentLabel} completó su respuesta`,
      body: `El agente en ${displayTitle} ha finalizado de responder.`,
      category: 'agents',
      severity: 'info',
      source: 'terminal',
      entity_id: panelId,
      dedupe_key: `agent:done:${panelId}`,
      delivery: { desktop: true, in_app: true },
    }).catch(() => {});
  }
}

export function resetAgentNotificationBridgeState(panelId) {
  if (panelId) {
    runningStartedAtMap.delete(panelId);
    lastNotificationSentAtMap.delete(`${panelId}:blocked`);
    lastNotificationSentAtMap.delete(`${panelId}:done`);
  } else {
    runningStartedAtMap.clear();
    lastNotificationSentAtMap.clear();
  }
}
