const AUTHORITY_LABELS = {
  authoritative: 'Autoritativo',
  inferred: 'Inferido',
  cached: 'En caché',
};

const STATUS_LABELS = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  stale: 'Stale',
  offline: 'Offline',
  unknown: 'Unknown',
};

const STATUS_TONES = {
  healthy: 'success',
  degraded: 'warning',
  stale: 'warning',
  offline: 'danger',
  unknown: 'muted',
};

export function getAuthorityLabel(authority) {
  return AUTHORITY_LABELS[authority] || 'Desconocido';
}

export function getHealthStatusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.unknown;
}

export function getHealthTone(status) {
  return STATUS_TONES[status] || STATUS_TONES.unknown;
}

export function formatFreshnessLabel(freshnessMs) {
  if (!Number.isFinite(freshnessMs) || freshnessMs < 0) return '—';
  if (freshnessMs < 60_000) return `${Math.max(1, Math.round(freshnessMs / 1000))}s`;
  if (freshnessMs < 60 * 60_000) return `${Math.round(freshnessMs / 60_000)}m`;
  return `${Math.round(freshnessMs / (60 * 60_000))}h`;
}
