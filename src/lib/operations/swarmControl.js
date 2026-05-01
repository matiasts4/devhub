export function getSourceByKey(snapshot, key) {
  return snapshot?.sources?.find((source) => source.key === key) || null;
}

export function deriveSwarmControlHealthModel(snapshot = {}) {
  const processSource = getSourceByKey(snapshot, 'opencode-process');
  const queueSource = getSourceByKey(snapshot, 'queue');

  return {
    summary: snapshot.summary || { total: 0, worst_status: 'unknown' },
    process: processSource
      ? {
          status: processSource.status,
          authority: processSource.authority,
          pid: processSource.metrics?.pid ?? null,
          port: processSource.metrics?.port ?? null,
          memory_rss: processSource.metrics?.memory_rss ?? null,
          status_reason: processSource.status_reason || '',
        }
      : null,
    queue: queueSource
      ? {
          status: queueSource.status,
          authority: queueSource.authority,
          length: queueSource.metrics?.length ?? 0,
          estimated_wait_ms: queueSource.metrics?.estimated_wait_ms ?? 0,
          active_agents: queueSource.metrics?.active_agents ?? 0,
        }
      : null,
  };
}

function getProcessTone(status) {
  if (status === 'healthy') return 'success';
  if (status === 'offline') return 'danger';
  if (status === 'degraded' || status === 'stale') return 'warning';
  return 'muted';
}

function getProcessLabel(process) {
  if (!process) return 'Server sin datos';
  if (process.status === 'healthy') return 'Server OK';
  if (process.status === 'offline') return 'Server off';
  if (process.status === 'degraded' || process.status === 'stale') return 'Server degradado';
  return 'Server sin datos';
}

export function deriveSwarmHeaderModel({
  snapshot = {},
  swarmConfig = null,
  activeAgentsCount = 0,
} = {}) {
  const health = deriveSwarmControlHealthModel(snapshot);
  const process = health.process;
  const queue = health.queue || { length: 0, active_agents: 0, estimated_wait_ms: 0 };

  return {
    process,
    processLabel: getProcessLabel(process),
    processTone: getProcessTone(process?.status),
    processReason: process?.status_reason || '',
    queue,
    concurrency: {
      current: activeAgentsCount,
      max: swarmConfig?.max_concurrent_swarms ?? 0,
    },
  };
}
