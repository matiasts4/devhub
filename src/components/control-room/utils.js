import { Fragment } from 'react';

const TOKEN_LABELS = Object.freeze({
  unknown: 'desconocido',
  0: 'desconocido',
  disponible: 'disponible',
  patch: 'parche',
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
  blocked: 'Bloqueada',
  lease_active: 'lease activo',
  awaiting_approval: 'esperando aprobación',
  approval_required: 'aprobación requerida',
  'approval evidence': 'evidencia de aprobación',
  'approval evidence missing': 'falta evidencia de aprobación',
  'workspace evidence gap': 'falta evidencia de workspace',
  'unknown error': 'error desconocido',
  'unknown source': 'origen desconocido',
  local_snapshot: 'snapshot local',
  'stale-registry': 'registro stale',
  'orphaned-process': 'proceso huérfano',
  'quota-blocked': 'bloqueado por cuota',
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

// ── Status color palette ──────────────────────────────────────────────────────
export const STATUS_COLORS = Object.freeze({
  // green — healthy / done
  active: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', dot: '#22c55e' },
  running: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', dot: '#22c55e' },
  succeeded: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', dot: '#22c55e' },
  approved: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', dot: '#22c55e' },
  healthy: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', dot: '#22c55e' },
  online: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', dot: '#22c55e' },
  completed: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', dot: '#22c55e' },
  // amber — in-progress / waiting
  pending: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', dot: '#f59e0b' },
  in_progress: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', dot: '#f59e0b' },
  awaiting_approval: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', dot: '#f59e0b' },
  approval_required: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', dot: '#f59e0b' },
  provisioning: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', dot: '#f59e0b' },
  // red — failure
  failed: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', dot: '#ef4444' },
  aborted: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', dot: '#ef4444' },
  rejected: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', dot: '#ef4444' },
  error: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', dot: '#ef4444' },
  // orange — blocked / conflict
  blocked: { bg: 'rgba(249,115,22,0.12)', color: '#fb923c', dot: '#f97316' },
  conflicted: { bg: 'rgba(249,115,22,0.12)', color: '#fb923c', dot: '#f97316' },
  quota_blocked: { bg: 'rgba(249,115,22,0.12)', color: '#fb923c', dot: '#f97316' },
  // indigo — lease / special states
  lease_active: { bg: 'rgba(99,102,241,0.12)', color: '#a5b4fc', dot: '#6366f1' },
  // purple — paused / suspended
  paused: { bg: 'rgba(167,139,250,0.12)', color: '#c4b5fd', dot: '#a78bfa' },
  orphaned: { bg: 'rgba(167,139,250,0.12)', color: '#c4b5fd', dot: '#a78bfa' },
  orphaned_process: { bg: 'rgba(167,139,250,0.12)', color: '#c4b5fd', dot: '#a78bfa' },
  // gray — idle / stale / unknown
  idle: { bg: 'rgba(107,114,128,0.10)', color: '#9ca3af', dot: '#6b7280' },
  stale: { bg: 'rgba(107,114,128,0.10)', color: '#9ca3af', dot: '#6b7280' },
  stale_registry: { bg: 'rgba(107,114,128,0.10)', color: '#9ca3af', dot: '#6b7280' },
  offline: { bg: 'rgba(107,114,128,0.10)', color: '#9ca3af', dot: '#6b7280' },
  unknown: { bg: 'rgba(107,114,128,0.10)', color: '#9ca3af', dot: '#6b7280' },
  0: { bg: 'rgba(107,114,128,0.10)', color: '#9ca3af', dot: '#6b7280' },
  disponible: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', dot: '#22c55e' },
  patch: { bg: 'rgba(107,114,128,0.10)', color: '#9ca3af', dot: '#6b7280' },
  unavailable: { bg: 'rgba(107,114,128,0.10)', color: '#9ca3af', dot: '#6b7280' },
  degraded: { bg: 'rgba(107,114,128,0.10)', color: '#9ca3af', dot: '#6b7280' },
});

function resolveStatusTheme(status) {
  const key = String(status || 'unknown')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return STATUS_COLORS[key] || STATUS_COLORS.unknown;
}

// ── Exported components ───────────────────────────────────────────────────────

/**
 * Color-coded pill badge for agent/workspace/run statuses.
 * Replaces plain formatToken(status) spans throughout panels.
 */
export function StatusPill({ status, className = '' }) {
  const theme = resolveStatusTheme(status);
  const label = formatToken(status);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={{ background: theme.bg, color: theme.color }}
    >
      <span
        className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ background: theme.dot }}
      />
      {label}
    </span>
  );
}

/**
 * Count badge for panel headers — only renders when count > 0.
 */
export function CountBadge({ count }) {
  if (!count) return null;
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums"
      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
    >
      {count}
    </span>
  );
}

// ── Exported functions ────────────────────────────────────────────────────────

export function formatToken(value) {
  if (!value) return 'desconocido';
  const raw = String(value).trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (TOKEN_LABELS[normalized]) return TOKEN_LABELS[normalized];
  // Unknown raw value — return a readable fallback, not the raw enum
  const cleaned = raw.replace(/_/g, ' ');
  // Guard against numeric or gibberish values showing as status
  if (!isNaN(Number(cleaned)) || cleaned.length > 30) return 'desconocido';
  return cleaned;
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

/**
 * Truncates long IDs (UUIDs, run IDs) for display.
 * Shows first 8 chars + … + last 5 chars when over maxLen.
 */
export function truncateId(id, maxLen = 22) {
  if (!id) return '—';
  const s = String(id);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, 8)}…${s.slice(-5)}`;
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

/**
 * Inline styles for scrollable list containers inside panels.
 * Caps height and shows a thin native scrollbar.
 */
export function panelListStyle() {
  return {
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--border-subtle) transparent',
  };
}

// ── Compact layout components ─────────────────────────────────────────────────

/**
 * Shared panel shell used by compact list panels (AgentsClaimsPanel, etc).
 */
export function CompactPanelShell({
  title,
  description,
  count,
  items,
  renderItem,
  emptyMessage,
  ariaLabel,
  headerExtra,
  maxHeight = '300px',
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const resolvedEmptyMessage = emptyMessage || 'Sin datos';

  return (
    <section
      className="rounded-xl border p-3"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-muted)' }}
      aria-label={ariaLabel || title}
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-default)' }}>
            {title}
          </h2>
          {description ? (
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <CountBadge count={count} />
        </div>
      </div>

      <div
        data-testid="compact-panel-body"
        className="flex flex-col gap-2 overflow-y-auto"
        style={{ ...panelListStyle(), maxHeight, overflowY: 'auto' }}
      >
        {safeItems.length === 0
          ? renderEmptyCopy(resolvedEmptyMessage)
          : safeItems.map((item, idx) => (
              <Fragment key={item?.id || item?.key || idx}>{renderItem(item)}</Fragment>
            ))}
      </div>
    </section>
  );
}

/**
 * Compact row used inside list panels.
 */
export function CompactRow({ status, primary, secondary, badge, timestamp, icon = null }) {
  const primaryText = truncateId(primary);
  const hasBadge = badge !== null && badge !== undefined;
  const timeText = timestamp ? formatRelativeTime(timestamp) : null;

  return (
    <div className="flex items-center justify-between gap-2" data-testid="compact-row">
      <div className="flex items-center gap-2">
        {icon}
        <StatusPill status={status} />
        <div className="flex flex-col">
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--text-default)' }}
            data-testid="compact-row-primary"
          >
            {primaryText}
          </span>
          {secondary ? (
            <span
              className="text-[10px]"
              style={{ color: 'var(--text-muted)' }}
              data-testid="compact-row-secondary"
            >
              {secondary}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasBadge ? (
          <span
            data-testid="compact-row-badge"
            className="rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
          >
            {badge}
          </span>
        ) : null}
        {timeText ? (
          <span
            data-testid="compact-row-timestamp"
            className="text-[10px] tabular-nums"
            style={{ color: 'var(--text-muted)' }}
          >
            {timeText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ── Time formatting ───────────────────────────────────────────────────────────

/**
 * Formats a date as a relative Spanish string (e.g. "hace 2 minutos").
 */
export function formatRelativeTime(dateInput) {
  if (!dateInput) return '—';
  const raw = String(dateInput);
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return raw.length > 8 ? raw.slice(-8) : raw;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (diffSec < 60) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString('es-AR');
}
