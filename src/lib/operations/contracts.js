export const OPERATIONAL_EVENT_SEVERITIES = Object.freeze([
  'info',
  'success',
  'warning',
  'critical',
]);
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
export const CONTROL_ROOM_AUTHORITIES = Object.freeze([
  'authoritative',
  'inferred',
  'cached',
  'unavailable',
]);
export const CONTROL_ROOM_FRESHNESS = Object.freeze([
  'current',
  'degraded',
  'stale',
  'unavailable',
]);

const CONTROL_ROOM_AUTHORITY_RANK = Object.freeze({
  authoritative: 0,
  inferred: 1,
  cached: 2,
  unavailable: 3,
});

const CONTROL_ROOM_FRESHNESS_RANK = Object.freeze({
  current: 0,
  degraded: 1,
  stale: 2,
  unavailable: 3,
});

export const MCP_CONTROL_CENTER_AUTHORITIES = Object.freeze(['durable', 'live', 'configured']);
export const MCP_CONTROL_CENTER_FRESHNESS = Object.freeze(['current', 'stale', 'unknown']);
export const MCP_CONTROL_CENTER_PROBE_STATUSES = Object.freeze([
  'healthy',
  'degraded',
  'unavailable',
]);
export const MCP_CONTROL_CENTER_SMOKE_STATUSES = Object.freeze(['pass', 'degraded', 'fail']);

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

export function normalizeControlRoomAuthority(value) {
  return CONTROL_ROOM_AUTHORITIES.includes(value) ? value : 'unavailable';
}

export function normalizeControlRoomFreshness(value) {
  return CONTROL_ROOM_FRESHNESS.includes(value) ? value : 'unavailable';
}

export function normalizeEvidenceRefs(...values) {
  const refs = compactParts(values);
  return Array.from(new Set(refs));
}

export function createControlRoomStatus(input = {}) {
  const evidenceRefs = normalizeEvidenceRefs(input.evidence_refs, input.evidence_ref);

  return {
    authority: normalizeControlRoomAuthority(input.authority),
    freshness: normalizeControlRoomFreshness(input.freshness),
    evidence_ref: evidenceRefs[0] || null,
    evidence_refs: evidenceRefs,
  };
}

export function mergeControlRoomStatus(...inputs) {
  const statuses = inputs
    .flat()
    .filter(Boolean)
    .map((input) => createControlRoomStatus(input));

  if (statuses.length === 0) {
    return createControlRoomStatus();
  }

  const authority = statuses.reduce((best, current) => {
    return CONTROL_ROOM_AUTHORITY_RANK[current.authority] < CONTROL_ROOM_AUTHORITY_RANK[best]
      ? current.authority
      : best;
  }, 'unavailable');

  const freshness = statuses.reduce((worst, current) => {
    return CONTROL_ROOM_FRESHNESS_RANK[current.freshness] > CONTROL_ROOM_FRESHNESS_RANK[worst]
      ? current.freshness
      : worst;
  }, 'current');

  return createControlRoomStatus({
    authority,
    freshness,
    evidence_refs: statuses.flatMap((status) => status.evidence_refs || []),
  });
}

function normalizeMcpAuthority(value) {
  return MCP_CONTROL_CENTER_AUTHORITIES.includes(value) ? value : 'configured';
}

function normalizeMcpFreshness(value) {
  return MCP_CONTROL_CENTER_FRESHNESS.includes(value) ? value : 'unknown';
}

function normalizeMcpProbeStatus(value) {
  return MCP_CONTROL_CENTER_PROBE_STATUSES.includes(value) ? value : 'unavailable';
}

function normalizeMcpSmokeStatus(value) {
  return MCP_CONTROL_CENTER_SMOKE_STATUSES.includes(value) ? value : 'fail';
}

export function buildOperationalDedupeKey(source, eventType, parts = []) {
  return compactParts([source, eventType, parts]).join(':');
}

function deriveCategoryFromSource(source = '') {
  if (source === 'agenthub' || source === 'presence' || source === 'swarm') return 'agents';
  if (source === 'tasks' || source === 'deadline') return 'tasks';
  return 'system';
}

export function createOperationalEvent(input = {}) {
  const source = input.source || 'system';
  const eventType = input.event_type || 'system.event';
  const occurredAt = input.occurred_at || input.created_at || new Date().toISOString();
  const dedupeKey =
    input.dedupe_key || buildOperationalDedupeKey(source, eventType, input.dedupe_parts || []);
  const category = input.category || deriveCategoryFromSource(source);

  return {
    id: input.id || dedupeKey,
    event_type: eventType,
    category,
    severity: normalizeSeverity(input.severity),
    source,
    source_authority: normalizeAuthority(input.source_authority),
    occurred_at: occurredAt,
    created_at: occurredAt,
    dedupe_key: dedupeKey,
    delivery: {
      desktop: Boolean(input.delivery?.desktop),
      in_app: input.delivery?.in_app !== false,
    },
    title: input.title || eventType,
    body: input.body || input.message || '',
    message: input.message || input.body || '',
    status: input.status || 'pending',
    read_at: input.read_at || null,
    occurrence_count: Number(input.occurrence_count) || 1,
    actions: Array.isArray(input.actions) ? input.actions : [],
    entity_id: input.entity_id || input.metadata?.entity_id || null,
    metadata: input.metadata || {},
  };
}

export function createAgentPresenceEvent({
  agentId,
  newState,
  prevState = 'unknown',
  statusSummary = '',
  missionId = null,
} = {}) {
  let severity = 'info';
  let title = `Agente ${agentId}: ${newState}`;
  let body = statusSummary || `Transición de estado de ${prevState} a ${newState}.`;
  const actions = [
    { label: 'Ver Agente', action_type: 'navigate', target: `/control-room?agent=${agentId}` },
  ];

  if (newState === 'blocked') {
    severity = 'warning';
    title = `Agente Requiere Intervención (${agentId})`;
    body = `El agente está esperando aprobación o input del usuario.${statusSummary ? ` Detalle: ${statusSummary}` : ''}`;
  } else if (newState === 'error' || newState === 'failed') {
    severity = 'critical';
    title = `Fallo Crítico en Agente (${agentId})`;
    body = `El agente se ha detenido o ha fallado.${statusSummary ? ` Detalle: ${statusSummary}` : ''}`;
    actions.push({
      label: 'Inspeccionar Logs',
      action_type: 'navigate',
      target: `/control-room?agent=${agentId}&tab=logs`,
    });
  } else if (newState === 'completed') {
    severity = 'info';
    title = `Tarea Completada (${agentId})`;
    body = statusSummary || 'El agente ha finalizado su ejecución exitosamente.';
  } else if (newState === 'running') {
    severity = 'info';
    title = `Agente Activo (${agentId})`;
  }

  return createOperationalEvent({
    event_type: `agent.presence.${newState}`,
    category: 'agents',
    severity,
    source: 'presence',
    source_authority: 'authoritative',
    dedupe_key: `presence:${newState}:${agentId}`,
    title,
    body,
    entity_id: agentId,
    actions,
    delivery: {
      desktop: severity === 'critical' || severity === 'warning',
      in_app: true,
    },
    metadata: {
      agent_id: agentId,
      new_state: newState,
      prev_state: prevState,
      mission_id: missionId,
    },
  });
}

export function createHealthSource(input = {}) {
  const evidenceRefs = normalizeEvidenceRefs(input.evidence_refs, input.evidence_ref);

  return {
    key: input.key || 'unknown',
    label: input.label || input.key || 'Unknown',
    status: normalizeHealthStatus(input.status),
    authority: normalizeAuthority(input.authority),
    freshness_ms: Number.isFinite(input.freshness_ms) ? input.freshness_ms : null,
    observed_at: input.observed_at || null,
    status_reason: input.status_reason || '',
    evidence_ref: evidenceRefs[0] || null,
    evidence_refs: evidenceRefs,
    metrics: input.metrics || {},
  };
}

export function createMcpEvidenceRef(input = {}) {
  return {
    kind: input.kind || 'unknown',
    ref: input.ref || null,
    authority: normalizeMcpAuthority(input.authority),
  };
}

export function createMcpProbe(input = {}) {
  return {
    key: input.key || 'unknown',
    status: normalizeMcpProbeStatus(input.status),
    authority: normalizeMcpAuthority(input.authority),
    freshness: normalizeMcpFreshness(input.freshness),
    reason: input.reason || '',
    evidence: Array.isArray(input.evidence)
      ? input.evidence.map((item) => createMcpEvidenceRef(item))
      : [],
  };
}

export function createMcpToolEntry(input = {}) {
  return {
    name: input.name || 'unknown',
    server: input.server || null,
    description: input.description || '',
    authority: normalizeMcpAuthority(input.authority),
    control_plane: Boolean(input.control_plane),
    safe_action: Boolean(input.safe_action),
    reason: input.reason || '',
    evidence: Array.isArray(input.evidence)
      ? input.evidence.map((item) => createMcpEvidenceRef(item))
      : [],
  };
}

export function createMcpControlCenterSnapshot(input = {}) {
  return {
    observed_at: input.observed_at || new Date().toISOString(),
    authority: normalizeMcpAuthority(input.authority),
    freshness: normalizeMcpFreshness(input.freshness),
    doctor: {
      probes: Array.isArray(input.doctor?.probes)
        ? input.doctor.probes.map((probe) => createMcpProbe(probe))
        : [],
    },
    list_tools: {
      tools: Array.isArray(input.list_tools?.tools)
        ? input.list_tools.tools.map((tool) => createMcpToolEntry(tool))
        : [],
    },
    smoke: {
      status: normalizeMcpSmokeStatus(input.smoke?.status),
      checks: Array.isArray(input.smoke?.checks)
        ? input.smoke.checks.map((probe) => createMcpProbe(probe))
        : [],
    },
    evidence: input.evidence || {},
    note: input.note || null,
    status_reason: input.status_reason || '',
    servers: Array.isArray(input.servers) ? input.servers : [],
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
