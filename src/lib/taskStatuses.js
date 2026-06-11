/** Canonical task status values for Kanban, API, and DevHub MCP. */
export const TASK_STATUSES = Object.freeze([
  'pending',
  'in_progress',
  'qa_ready',
  'blocked',
  'completed',
]);

export const TASK_STATUS_LABELS = Object.freeze({
  pending: 'Pendiente',
  in_progress: 'En Progreso',
  qa_ready: 'Pendiente revisión',
  blocked: 'Bloqueada',
  completed: 'Completada',
});

export const TASK_STATUS_ZOD_ENUM = TASK_STATUSES;
