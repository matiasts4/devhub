export const OPERATIONAL_EVENT_SEVERITIES = Object.freeze(['info', 'warning', 'critical']);
export const OPERATIONAL_SOURCE_AUTHORITIES = Object.freeze([
  'authoritative',
  'inferred',
  'cached',
]);
export const HEALTH_STATUSES = Object.freeze([
  'healthy',
  'degraded',
  'stale',
  'offline',
  'unknown',
]);

function compactParts(parts = []) {
  return parts
    .flat()
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => String(value).trim());
}

function normalizeSeverity(value) {
  return OPERATIONAL_EVENT_SEVERITIES.includes(value) ? value : 'info';
}

function normalizeAuthority(value) {
  return OPERATIONAL_SOURCE_AUTHORITIES.includes(value) ? value : 'authoritative';
}

function normalizeHealthStatus(value) {
  return HEALTH_STATUSES.includes(value) ? value : 'unknown';
}

export function buildOperationalDedupeKey(source, eventType, parts = []) {
  return compactParts([source, eventType, parts]).join(':');
}

export function createOperationalEvent(input = {}) {
  const source = input.source || 'system';
  const eventType = input.event_type || 'system.event';
  const occurredAt = input.occurred_at || new Date().toISOString();
  const dedupeKey =
    input.dedupe_key || buildOperationalDedupeKey(source, eventType, input.dedupe_parts || []);

  return {
    id: input.id || dedupeKey,
    event_type: eventType,
    severity: normalizeSeverity(input.severity),
    source,
    source_authority: normalizeAuthority(input.source_authority),
    occurred_at: occurredAt,
    dedupe_key: dedupeKey,
    delivery: {
      desktop: Boolean(input.delivery?.desktop),
      in_app: input.delivery?.in_app !== false,
    },
    title: input.title || eventType,
    body: input.body || '',
    status: input.status || 'pending',
    metadata: input.metadata || {},
  };
}

export function createHealthSource(input = {}) {
  return {
    key: input.key || 'unknown',
    label: input.label || input.key || 'Unknown',
    status: normalizeHealthStatus(input.status),
    authority: normalizeAuthority(input.authority),
    freshness_ms: Number.isFinite(input.freshness_ms) ? input.freshness_ms : null,
    observed_at: input.observed_at || null,
    status_reason: input.status_reason || '',
    metrics: input.metrics || {},
  };
}

function mapSubagentStatus(status) {
  if (status === 'error' || status === 'failed' || status === 'aborted') {
    return { event_type: 'subagent.failed', severity: 'critical' };
  }

  return { event_type: 'subagent.completed', severity: 'info' };
}

export function normalizeLegacySubagentLifecycleEvent(input = {}) {
  const mapped = mapSubagentStatus(input.status);
  const agent = input.agent || 'subagent';
  const occurredAt = input.occurredAt || input.occurred_at || new Date().toISOString();
  const body = input.errorMessage
    ? `${agent} terminó con error: ${input.errorMessage}`
    : `${agent} terminó su ejecución.`;

  return createOperationalEvent({
    event_type: mapped.event_type,
    severity: mapped.severity,
    source: 'agenthub',
    source_authority: 'authoritative',
    occurred_at: occurredAt,
    title:
      mapped.event_type === 'subagent.failed'
        ? `${agent} finalizó con errores`
        : `${agent} finalizó`,
    body,
    dedupe_parts: [input.sessionID || input.sessionId, agent, input.messageId],
    delivery: { desktop: mapped.severity === 'critical', in_app: true },
    metadata: {
      agent,
      session_id: input.sessionID || input.sessionId || null,
      message_id: input.messageId || null,
      error_message: input.errorMessage || null,
    },
  });
}
