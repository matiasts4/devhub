/**
 * src/lib/suggestions/rules.js
 * Pure rules engine for smart suggestions.
 * Zero I/O — all inputs come as arguments.
 *
 * @typedef {{ id: string, title: string, description: string, type: 'risk'|'alert'|'opportunity'|'tip', action_hint: string }} Suggestion
 */

const PRIORITY_ORDER = { risk: 0, alert: 1, opportunity: 2, tip: 3 };
const MAX_SUGGESTIONS = 5;

/**
 * Build local suggestions from project data without any I/O.
 *
 * @param {{ id: string, name: string, progress: number }} project
 * @param {Array} tasks
 * @param {Array} milestones
 * @returns {Suggestion[]} — at most 5 suggestions, sorted by priority
 */
function buildLocalSuggestions(project, tasks, milestones) {
  if (!tasks || tasks.length === 0) return [];

  const suggestions = [];

  // ── Rule 1 — Blocked tasks → alert ──────────────────────────────────────
  const blockedTasks = tasks.filter((t) => t.status === 'blocked');
  if (blockedTasks.length > 0) {
    suggestions.push({
      id: 'rule-blocked',
      title: `${blockedTasks.length} tarea${blockedTasks.length > 1 ? 's' : ''} bloqueada${blockedTasks.length > 1 ? 's' : ''}`,
      description: `Hay ${blockedTasks.length} tarea${blockedTasks.length > 1 ? 's' : ''} bloqueada${blockedTasks.length > 1 ? 's' : ''} que impiden el avance del proyecto.`,
      type: 'alert',
      action_hint: 'Revisá las dependencias y desbloqueá las tareas para continuar.',
    });
  }

  // ── Rule 2 — Overdue tasks → risk ────────────────────────────────────────
  const now = new Date();
  const overdueTasks = tasks.filter(
    (t) => t.due_date && new Date(t.due_date) < now && t.status !== 'completed'
  );
  if (overdueTasks.length > 0) {
    suggestions.push({
      id: 'rule-overdue',
      title: `${overdueTasks.length} tarea${overdueTasks.length > 1 ? 's' : ''} vencida${overdueTasks.length > 1 ? 's' : ''}`,
      description: `${overdueTasks.length} tarea${overdueTasks.length > 1 ? 's han' : ' ha'} superado su fecha límite sin completarse.`,
      type: 'risk',
      action_hint: 'Priorizá estas tareas o ajustá las fechas para evitar retrasos.',
    });
  }

  // ── Rule 3 — Milestone due within 7 days → alert ─────────────────────────
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nearMilestones = (milestones || []).filter(
    (m) =>
      m.due_date &&
      m.status !== 'completed' &&
      new Date(m.due_date) > now &&
      new Date(m.due_date) <= sevenDaysFromNow
  );
  if (nearMilestones.length > 0) {
    suggestions.push({
      id: 'rule-near-milestone',
      title: `Hito próximo: ${nearMilestones[0].title}`,
      description: `El hito "${nearMilestones[0].title}" vence en menos de 7 días y aún no está completado.`,
      type: 'alert',
      action_hint: 'Verificá el avance de las tareas asociadas a este hito.',
    });
  }

  // ── Rule 4 — Milestone at_risk → risk ────────────────────────────────────
  const atRiskMilestones = (milestones || []).filter((m) => m.status === 'at_risk');
  if (atRiskMilestones.length > 0) {
    suggestions.push({
      id: 'rule-milestone-at-risk',
      title: `Hito en riesgo: ${atRiskMilestones[0].title}`,
      description: `${atRiskMilestones.length} hito${atRiskMilestones.length > 1 ? 's están' : ' está'} marcado${atRiskMilestones.length > 1 ? 's' : ''} como "en riesgo".`,
      type: 'risk',
      action_hint: 'Revisá el estado de los hitos en riesgo y tomá acción correctiva.',
    });
  }

  // ── Rule 5 — stale_alert tasks → alert ───────────────────────────────────
  const staleTasks = tasks.filter((t) => t.stale_alert === 1 || t.stale_alert === true);
  if (staleTasks.length > 0) {
    suggestions.push({
      id: 'rule-stale',
      title: `${staleTasks.length} tarea${staleTasks.length > 1 ? 's' : ''} estancada${staleTasks.length > 1 ? 's' : ''}`,
      description: `Hay tareas sin actividad reciente que podrían estar bloqueando el progreso.`,
      type: 'alert',
      action_hint: 'Revisá estas tareas y actualizá su estado o asigná responsables.',
    });
  }

  // ── Rule 6 — Unassigned pending tasks → tip ──────────────────────────────
  const unassignedTasks = tasks.filter((t) => !t.assigned_to && t.status !== 'completed');
  if (unassignedTasks.length > 0) {
    suggestions.push({
      id: 'rule-unassigned',
      title: `${unassignedTasks.length} tarea${unassignedTasks.length > 1 ? 's' : ''} sin asignar`,
      description: `Hay tareas pendientes sin un responsable asignado.`,
      type: 'tip',
      action_hint: 'Asigná un responsable a cada tarea para clarificar el ownership.',
    });
  }

  // ── Rule 7 — Critical pending tasks → opportunity ─────────────────────────
  const criticalPending = tasks.filter((t) => t.priority === 'critical' && t.status === 'pending');
  if (criticalPending.length > 0) {
    suggestions.push({
      id: 'rule-critical-pending',
      title: `${criticalPending.length} tarea${criticalPending.length > 1 ? 's' : ''} crítica${criticalPending.length > 1 ? 's' : ''} pendiente${criticalPending.length > 1 ? 's' : ''}`,
      description: `Existe${criticalPending.length > 1 ? 'n' : ''} ${criticalPending.length} tarea${criticalPending.length > 1 ? 's' : ''} de prioridad crítica sin iniciar.`,
      type: 'opportunity',
      action_hint: 'Iniciar estas tareas ahora puede acelerar significativamente el proyecto.',
    });
  }

  // ── Rule 8 — Progress stagnated → alert ──────────────────────────────────
  const progress = project?.progress ?? 0;
  if (progress < 10 && tasks.length > 0) {
    suggestions.push({
      id: 'rule-stagnated-progress',
      title: 'Progreso estancado',
      description: `El proyecto tiene un ${progress}% de progreso. Completar las primeras tareas genera momentum.`,
      type: 'alert',
      action_hint: 'Completá al menos una tarea para empezar a ver avance.',
    });
  }

  // ── Sort by priority: risk > alert > opportunity > tip ───────────────────
  suggestions.sort((a, b) => (PRIORITY_ORDER[a.type] ?? 99) - (PRIORITY_ORDER[b.type] ?? 99));

  // ── Cap at MAX_SUGGESTIONS ────────────────────────────────────────────────
  return suggestions.slice(0, MAX_SUGGESTIONS);
}

module.exports = { buildLocalSuggestions };
