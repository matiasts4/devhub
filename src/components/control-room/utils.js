export function formatToken(value) {
  if (!value) return 'unknown';
  return String(value).replace(/_/g, ' ');
}

export function formatEvidence(evidenceRefs = []) {
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) return 'No evidence';
  return evidenceRefs.join(' · ');
}

export function formatMissingSource(missingSource) {
  return missingSource ? `Missing source: ${missingSource}` : null;
}

export function formatLiveHint(liveHint) {
  if (!liveHint?.status) return null;
  return `Live activity: ${formatToken(liveHint.status)}`;
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
