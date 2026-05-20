const TOKEN_LABELS = Object.freeze({
  unknown: 'desconocido',
  active: 'activo',
  paused: 'pausado',
  pending: 'pendiente',
  approved: 'aprobado',
  rejected: 'rechazado',
  completed: 'completado',
  succeeded: 'completado con éxito',
  failed: 'fallido',
  aborted: 'abortado',
  running: 'en ejecución',
  idle: 'inactivo',
  online: 'en línea',
  offline: 'fuera de línea',
  current: 'actual',
  stale: 'vencido',
  degraded: 'degradado',
  unavailable: 'no disponible',
  healthy: 'ok',
  authoritative: 'canónica',
  inferred: 'inferida',
  cached: 'en caché',
  lease_active: 'lease activo',
  awaiting_approval: 'esperando aprobación',
  approval_required: 'aprobación requerida',
  'approval evidence': 'evidencia de aprobación',
  'approval evidence missing': 'falta evidencia de aprobación',
  'workspace evidence gap': 'falta evidencia de workspace',
  'unknown error': 'error desconocido',
  'unknown source': 'origen desconocido',
});

const MISSING_SOURCE_LABELS = Object.freeze({
  'approval evidence': 'evidencia de aprobación',
  'telegram snapshot': 'snapshot de Telegram',
  'process snapshot': 'snapshot de proceso',
  'session stream snapshot': 'snapshot de stream de sesión',
  'workspace evidence': 'evidencia de workspace',
  'run evidence': 'evidencia de run',
  'artifact evidence': 'evidencia de artefacto',
  'agent evidence': 'evidencia de agente',
  'supervisor snapshot': 'snapshot de supervisor',
  'mcp snapshot': 'snapshot de MCP',
});

export function formatToken(value) {
  if (!value) return 'desconocido';
  const raw = String(value).trim();
  const normalized = raw.toLowerCase();
  return TOKEN_LABELS[normalized] || raw.replace(/_/g, ' ');
}

export function formatEvidence(evidenceRefs = []) {
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) return 'Sin evidencia';
  return evidenceRefs.join(' · ');
}

export function formatMissingSource(missingSource) {
  if (!missingSource) return null;
  const raw = String(missingSource).trim();
  const normalized = raw.toLowerCase();
  return `Fuente faltante: ${MISSING_SOURCE_LABELS[normalized] || raw}`;
}

export function formatLiveHint(liveHint) {
  if (!liveHint?.status) return null;
  return `Actividad en vivo: ${formatToken(liveHint.status)}`;
}

export function renderEmptyCopy(message) {
  return (
    <div
      className="rounded-lg border border-dashed px-3 py-4 text-sm"
      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
    >
      {message}
    </div>
  );
}

export function panelShellStyle() {
  return {
    background: 'var(--surface-muted)',
    borderColor: 'var(--border-subtle)',
  };
}

export function metaTextStyle() {
  return { color: 'var(--text-muted)' };
}
