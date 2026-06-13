import { updateTrace } from '@/lib/db/observability.js';
import {
  appendPendingUiProvision,
  consumePendingUiProvision,
  extractPendingUiProvisionsFromLaunchTraces,
} from '@/lib/operations/swarmLazySpawn';

export const SWARM_LAUNCH_TRACE_TYPE = 'swarm_launch';

function parseTraceMetadata(row) {
  if (!row) return null;
  try {
    return row.metadata ? JSON.parse(row.metadata) : null;
  } catch {
    return null;
  }
}

export function getLaunchTraceRowByLaunchId(db, launchId) {
  const normalizedLaunchId = String(launchId || '').trim();
  if (!db || !normalizedLaunchId) return null;

  const rows = db
    .prepare(
      `SELECT * FROM agent_traces
       WHERE trace_type = ?
       ORDER BY created_at DESC`
    )
    .all(SWARM_LAUNCH_TRACE_TYPE);

  for (const row of rows) {
    const metadata = parseTraceMetadata(row);
    if (String(metadata?.launchId || '').trim() === normalizedLaunchId) {
      return { ...row, metadata };
    }
  }
  return null;
}

export function listLaunchTracesForProject(db, projectId) {
  const normalizedProjectId = String(projectId || '').trim();
  if (!db || !normalizedProjectId) return [];

  const rows = db
    .prepare(
      `SELECT * FROM agent_traces
       WHERE trace_type = ?
       ORDER BY created_at DESC`
    )
    .all(SWARM_LAUNCH_TRACE_TYPE);

  return rows
    .map((row) => ({ ...row, metadata: parseTraceMetadata(row) }))
    .filter((row) => String(row.metadata?.projectId || '').trim() === normalizedProjectId);
}

export function listPendingUiProvisionsForProject(db, projectId) {
  return extractPendingUiProvisionsFromLaunchTraces(listLaunchTracesForProject(db, projectId));
}

export function findDeferredWorkerRuntimeRequest(metadata = {}, roleKey = '') {
  const normalizedRoleKey = String(roleKey || '').trim();
  const deferred = Array.isArray(metadata?.deferredWorkerRuntimeRequests)
    ? metadata.deferredWorkerRuntimeRequests
    : [];
  return (
    deferred.find((entry) => String(entry?.roleKey || '').trim() === normalizedRoleKey) || null
  );
}

export function persistLaunchTraceMetadata(db, traceId, metadata) {
  if (!db || !traceId || !metadata) return null;
  return updateTrace(db, traceId, { metadata });
}

export function queueWorkerUiProvision(db, launchId, roleKey) {
  const traceRow = getLaunchTraceRowByLaunchId(db, launchId);
  if (!traceRow?.metadata) {
    return { ok: false, reason: 'launch_trace_not_found' };
  }

  const metadata = traceRow.metadata;
  const provisionedRoleKeys = Array.isArray(metadata.provisionedRoleKeys)
    ? metadata.provisionedRoleKeys
    : [];

  if (provisionedRoleKeys.includes(roleKey)) {
    return { ok: false, reason: 'already_provisioned' };
  }

  const runtimeRequest = findDeferredWorkerRuntimeRequest(metadata, roleKey);
  if (!runtimeRequest) {
    return { ok: false, reason: 'worker_not_in_deferred_roster' };
  }

  const nextMetadata = appendPendingUiProvision(metadata, runtimeRequest);
  persistLaunchTraceMetadata(db, traceRow.id, nextMetadata);

  return {
    ok: true,
    launchId,
    roleKey,
    runtime_request: runtimeRequest,
  };
}

export function acknowledgeWorkerUiProvision(db, launchId, roleKey) {
  const traceRow = getLaunchTraceRowByLaunchId(db, launchId);
  if (!traceRow?.metadata) {
    return { ok: false, reason: 'launch_trace_not_found' };
  }

  const nextMetadata = consumePendingUiProvision(traceRow.metadata, launchId, roleKey);
  persistLaunchTraceMetadata(db, traceRow.id, nextMetadata);
  return { ok: true, launchId, roleKey };
}
