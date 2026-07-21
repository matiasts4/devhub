import { dispatchOperationalNotification } from '@/lib/operations/notify';
import { playNotificationSound } from '@/lib/notifications/soundEffects';

const runningStartedAtMap = new Map();
const lastNotificationSentAtMap = new Map();
const MIN_RUNNING_DURATION_MS = 3000;
const NOTIFICATION_COOLDOWN_MS = 10000;

/**
 * Handle state transitions for terminal agents and emit notifications/sounds.
 *
 * @param {string} panelId
 * @param {string|null} prev - Previous state ('running', 'blocked', 'idle', etc.)
 * @param {string|null} next - Next state ('running', 'blocked', 'idle', etc.)
 * @param {object} [options] - Additional session info (agentType, taskTitle)
 */
export function handleAgentStateTransition(panelId, prev, next, options = {}) {
  if (!next || prev === next) return;

  const now = Date.now();

  if (next === 'running') {
    if (!runningStartedAtMap.has(panelId)) {
      runningStartedAtMap.set(panelId, now);
    }
    return;
  }

  const rawAgent = options.agentType || 'Agente';
  const agentLabel =
    rawAgent === 'agy' || rawAgent === 'antigravity'
      ? 'Anti Gravity'
      : rawAgent === 'kimi'
      ? 'Kimiko D'
      : rawAgent.charAt(0).toUpperCase() + rawAgent.slice(1);

  const displayTitle = options.taskTitle ? `"${options.taskTitle}"` : `panel ${panelId}`;

  // Transition from running -> blocked: agent needs permission/user input
  if (next === 'blocked' && prev === 'running') {
    const lastSent = lastNotificationSentAtMap.get(`${panelId}:blocked`) || 0;
    if (now - lastSent < NOTIFICATION_COOLDOWN_MS) return;
    lastNotificationSentAtMap.set(`${panelId}:blocked`, now);

    try {
      playNotificationSound('warning');
    } catch {
      /* ignore audio context errors */
    }

    dispatchOperationalNotification({
      title: `${agentLabel} requiere atención`,
      body: `El agente en ${displayTitle} requiere confirmación o permiso para continuar.`,
      category: 'agents',
      severity: 'warning',
      source: 'terminal',
      entity_id: panelId,
      dedupe_key: `agent:blocked:${panelId}:${now}`,
      delivery: { desktop: true, in_app: true },
    }).catch(() => {});
  }
  // Transition from running/blocked -> idle/completed: agent finished task
  else if ((next === 'idle' || next === 'completed') && (prev === 'running' || prev === 'blocked')) {
    const runningStartedAt = runningStartedAtMap.get(panelId);
    runningStartedAtMap.delete(panelId);

    // Ignore transient running -> idle flickers if running duration was less than 3 seconds
    if (prev === 'running' && runningStartedAt && now - runningStartedAt < MIN_RUNNING_DURATION_MS) {
      return;
    }

    const lastSent = lastNotificationSentAtMap.get(`${panelId}:done`) || 0;
    if (now - lastSent < NOTIFICATION_COOLDOWN_MS) return;
    lastNotificationSentAtMap.set(`${panelId}:done`, now);

    const wasCancelled = Boolean(options.wasCancelled || options.cancelled);

    if (wasCancelled) {
      dispatchOperationalNotification({
        title: `${agentLabel} — Respuesta cancelada`,
        body: `La ejecución en ${displayTitle} fue cancelada por el usuario.`,
        category: 'agents',
        severity: 'info',
        source: 'terminal',
        entity_id: panelId,
        dedupe_key: `agent:cancelled:${panelId}:${now}`,
        delivery: { desktop: true, in_app: true },
      }).catch(() => {});
      return;
    }

    try {
      playNotificationSound('info');
    } catch {
      /* ignore audio context errors */
    }

    dispatchOperationalNotification({
      title: `${agentLabel} completó su respuesta`,
      body: `El agente en ${displayTitle} ha finalizado de responder.`,
      category: 'agents',
      severity: 'info',
      source: 'terminal',
      entity_id: panelId,
      dedupe_key: `agent:done:${panelId}:${now}`,
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
