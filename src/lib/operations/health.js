import { createHealthSource } from '@/lib/operations/contracts';

const STATUS_RANK = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
  stale: 3,
  offline: 4,
};

function resolveNow(now) {
  return now ? new Date(now) : new Date();
}

function resolveFreshnessMs(observedAt, now) {
  if (!observedAt) return null;

  const observed = new Date(observedAt);
  if (Number.isNaN(observed.getTime())) return null;

  return Math.max(resolveNow(now).getTime() - observed.getTime(), 0);
}

export function buildProcessHealthSource(process = {}, options = {}) {
  const observedAt = options.now || new Date().toISOString();
  const status = process.running ? (process.healthy ? 'healthy' : 'degraded') : 'offline';

  return createHealthSource({
    key: 'opencode-process',
    label: 'OpenCode Process',
    status,
    authority: 'authoritative',
    freshness_ms: 0,
    observed_at: observedAt,
    status_reason: process.running
      ? 'OpenCode process responded to health checks.'
      : 'OpenCode process is not running.',
    metrics: {
      pid: process.pid ?? null,
      port: process.port ?? null,
      uptime: process.uptime ?? process.processInfo?.uptime ?? null,
      memory_rss:
        process.memoryRss ??
        (process.processInfo?.memoryMB ? process.processInfo.memoryMB * 1024 * 1024 : null),
    },
  });
}

export function buildQueueHealthSource(queue = {}, options = {}) {
  const observedAt = options.now || new Date().toISOString();
  return createHealthSource({
    key: 'queue',
    label: 'Swarm Queue',
    status: 'healthy',
    authority: 'authoritative',
    freshness_ms: 0,
    observed_at: observedAt,
    status_reason:
      (queue.length || 0) > 0
        ? 'Queue backlog is present but tracked authoritatively.'
        : 'Queue is empty.',
    metrics: {
      length: queue.length || 0,
      estimated_wait_ms: queue.estimatedWaitMs || queue.items?.[0]?.estimatedWaitMs || 0,
      active_agents: options.activeAgentCount ?? 0,
    },
  });
}

export function buildSessionStreamHealthSource(payload = {}, options = {}) {
  const observedAt = payload.checked_at || options.now || new Date().toISOString();
  const freshnessMs = resolveFreshnessMs(observedAt, options.now);

  if (!payload.live_check_available) {
    return createHealthSource({
      key: 'session-stream',
      label: 'Session Stream',
      status: 'stale',
      authority: 'cached',
      freshness_ms: freshnessMs,
      observed_at: observedAt,
      status_reason: 'Live session check unavailable. Using cached database state.',
      metrics: {
        active_sessions: payload.active_sessions?.length || 0,
        stale_sessions: payload.stale_sessions?.length || 0,
        aborted_count: payload.aborted_count || 0,
      },
    });
  }

  const hasStaleSessions =
    (payload.stale_sessions?.length || 0) > 0 || (payload.aborted_count || 0) > 0;

  return createHealthSource({
    key: 'session-stream',
    label: 'Session Stream',
    status: hasStaleSessions ? 'degraded' : 'healthy',
    authority: 'authoritative',
    freshness_ms: freshnessMs,
    observed_at: observedAt,
    status_reason: hasStaleSessions
      ? 'One or more sessions were marked stale or aborted.'
      : 'Live session checks are current.',
    metrics: {
      active_sessions: payload.active_sessions?.length || 0,
      stale_sessions: payload.stale_sessions?.length || 0,
      aborted_count: payload.aborted_count || 0,
    },
  });
}

export function buildMcpHealthSource(payload = {}, options = {}) {
  const observedAt = payload.observed_at || options.now || new Date().toISOString();

  if (payload.doctor?.probes && payload.list_tools?.tools) {
    const problematicProbes = payload.doctor.probes.filter(
      (probe) => probe.status === 'degraded' || probe.status === 'unavailable'
    );
    const status =
      payload.smoke?.status === 'fail'
        ? 'offline'
        : problematicProbes.length > 0 || payload.smoke?.status === 'degraded'
          ? 'degraded'
          : 'healthy';

    return createHealthSource({
      key: 'mcp',
      label: 'MCP',
      status,
      authority: payload.authority === 'durable' ? 'authoritative' : 'inferred',
      freshness_ms: resolveFreshnessMs(observedAt, options.now),
      observed_at: observedAt,
      status_reason:
        problematicProbes[0]?.reason ||
        payload.status_reason ||
        (payload.smoke?.status === 'degraded'
          ? 'MCP diagnostics are degraded.'
          : 'MCP control center snapshot available.'),
      metrics: {
        probe_count: payload.doctor.probes.length,
        degraded_probes: problematicProbes.length,
        tool_count: payload.list_tools.tools.length,
        safe_tool_count: payload.list_tools.tools.filter((tool) => tool.safe_action).length,
      },
    });
  }

  const isCached = Boolean(payload.note) || payload.authority === 'inferred';
  const disconnectedCount = (payload.servers || []).filter(
    (server) => server.status !== 'connected'
  ).length;

  return createHealthSource({
    key: 'mcp',
    label: 'MCP',
    status: isCached ? 'stale' : disconnectedCount > 0 ? 'degraded' : 'healthy',
    authority: isCached ? 'inferred' : 'authoritative',
    freshness_ms: resolveFreshnessMs(observedAt, options.now),
    observed_at: observedAt,
    status_reason: isCached
      ? payload.note || 'MCP status is cached and inferred.'
      : disconnectedCount > 0
        ? 'Some MCP servers are disconnected.'
        : 'MCP servers reported live status.',
    metrics: {
      server_count: payload.servers?.length || 0,
      connected_servers: (payload.servers || []).filter((server) => server.status === 'connected')
        .length,
      tool_count: (payload.servers || []).reduce(
        (sum, server) => sum + (server.tools?.length || 0),
        0
      ),
    },
  });
}

export function buildRuntimeDiagnosticsHealthSource(payload = {}, options = {}) {
  const observedAt = payload?.generatedAt || options.now || new Date().toISOString();
  const evidenceRefs = Array.isArray(payload?.evidence_refs) ? payload.evidence_refs : [];

  if (!payload || payload.error) {
    return createHealthSource({
      key: 'runtime-diagnostics',
      label: 'Runtime Diagnostics',
      status: 'stale',
      authority: 'inferred',
      freshness_ms: resolveFreshnessMs(observedAt, options.now),
      observed_at: observedAt,
      status_reason: payload?.error || 'Runtime diagnostics snapshot unavailable.',
      evidence_refs: evidenceRefs,
      metrics: {
        total_terminals: 0,
        total_processes: 0,
        total_registry_agents: 0,
        reattachable_terminals: 0,
        orphaned_processes: 0,
        stale_registry_agents: 0,
        quota_blocked: false,
      },
    });
  }

  const anomalies = payload.anomalies || {};
  const summary = payload.summary || {};
  const reattachableCount = Array.isArray(anomalies.reattachableTerminals)
    ? anomalies.reattachableTerminals.length
    : 0;
  const orphanedProcessCount = Array.isArray(anomalies.orphanedProcesses)
    ? anomalies.orphanedProcesses.length
    : 0;
  const staleRegistryCount = Array.isArray(anomalies.staleRegistryAgents)
    ? anomalies.staleRegistryAgents.length
    : 0;
  const quotaBlocked = Boolean(anomalies.quotaBlocked);

  const degraded = quotaBlocked || orphanedProcessCount > 0 || staleRegistryCount > 0;
  const hasWarnings = reattachableCount > 0;

  return createHealthSource({
    key: 'runtime-diagnostics',
    label: 'Runtime Diagnostics',
    status: degraded || hasWarnings ? 'degraded' : 'healthy',
    authority: 'authoritative',
    freshness_ms: resolveFreshnessMs(observedAt, options.now),
    observed_at: observedAt,
    evidence_refs: evidenceRefs,
    status_reason: quotaBlocked
      ? 'Runtime diagnostics detected quota-blocked signals.'
      : orphanedProcessCount > 0
        ? 'Runtime diagnostics detected orphaned processes.'
        : staleRegistryCount > 0
          ? 'Runtime diagnostics detected stale registry entries.'
          : hasWarnings
            ? 'Runtime diagnostics detected reattachable terminals.'
            : 'Runtime diagnostics snapshot is consistent.',
    metrics: {
      total_terminals: Number(summary.totalTerminals || 0),
      total_processes: Number(summary.totalProcesses || 0),
      total_registry_agents: Number(summary.totalRegistryAgents || 0),
      reattachable_terminals: reattachableCount,
      orphaned_processes: orphanedProcessCount,
      stale_registry_agents: staleRegistryCount,
      quota_blocked: quotaBlocked,
    },
  });
}

export function buildHealthSnapshot(input = {}) {
  const sources = input.sources || [];
  const summary = {
    total: sources.length,
    healthy: sources.filter((source) => source.status === 'healthy').length,
    degraded: sources.filter((source) => source.status === 'degraded').length,
    stale: sources.filter((source) => source.status === 'stale').length,
    offline: sources.filter((source) => source.status === 'offline').length,
    unknown: sources.filter((source) => source.status === 'unknown').length,
    worst_status: 'healthy',
  };

  summary.worst_status = sources.reduce((worst, source) => {
    return STATUS_RANK[source.status] > STATUS_RANK[worst] ? source.status : worst;
  }, 'healthy');

  return {
    generated_at: input.generated_at || new Date().toISOString(),
    summary,
    sources,
  };
}
