/* global process */

import fs from 'fs';
import path from 'path';
import localDb from '@/lib/db/localDb.js';
import {
  createMcpControlCenterSnapshot,
  createMcpEvidenceRef,
  createMcpProbe,
  createMcpToolEntry,
} from '@/lib/operations/contracts';

const OFFICIAL_TOOL_NAME_REGEX = /server\.tool\(\s*['"`]([^'"`]+)['"`]/g;
const UNSAFE_TOOL_PATTERNS = [/git/i, /worktree/i, /branch/i, /merge/i, /filesystem/i, /file/i];
const READ_ONLY_TOOL_PATTERN = /^(get_|list_)/;

const CONFIGURED_SERVERS = Object.freeze([
  {
    name: 'filesystem',
    tools: [
      { name: 'read_file', description: 'Read the contents of a file' },
      { name: 'write_file', description: 'Write content to a file' },
      { name: 'list_directory', description: 'List files in a directory' },
      { name: 'search_files', description: 'Search for files by name or pattern' },
    ],
  },
  {
    name: 'web',
    tools: [
      { name: 'web_fetch', description: 'Fetch content from a URL' },
      { name: 'web_search', description: 'Search the web for information' },
    ],
  },
]);

function nowIso(value) {
  return value || new Date().toISOString();
}

function uniqueBy(items = [], keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function createEvidence(kind, ref, authority) {
  return createMcpEvidenceRef({ kind, ref, authority });
}

function createProbe({
  key,
  status,
  authority,
  freshness,
  reason,
  evidence = [],
}) {
  return createMcpProbe({ key, status, authority, freshness, reason, evidence });
}

function createToolEntry({
  name,
  server = null,
  description = '',
  authority,
  control_plane,
  safe_action,
  evidence = [],
  reason = '',
}) {
  return createMcpToolEntry({
    name,
    server,
    description,
    authority,
    control_plane,
    safe_action,
    evidence,
    reason,
  });
}

function summarizeSmokeStatus(checks = []) {
  const durableReadCheck = checks.find((check) => check.key === 'durable-read-model');
  if (durableReadCheck?.status === 'unavailable') return 'fail';
  if (checks.some((check) => check.status === 'degraded')) return 'degraded';
  if (checks.some((check) => check.status === 'unavailable')) return 'degraded';
  return 'pass';
}

function firstReason(probes = [], fallback) {
  const hit = probes.find((probe) => probe.status === 'degraded' || probe.status === 'unavailable');
  return hit?.reason || fallback;
}

function extractToolNamesFromServerSource(source) {
  const names = [];
  for (const match of source.matchAll(OFFICIAL_TOOL_NAME_REGEX)) {
    names.push(match[1]);
  }
  return names;
}

export function getConfiguredMcpServers() {
  return CONFIGURED_SERVERS.map((server) => ({
    ...server,
    tools: (server.tools || []).map((tool) => ({ ...tool })),
  }));
}

export function readDurableToolCatalog() {
  const serverPath = path.resolve(process.cwd(), 'devhub-mcp/server.js');
  try {
    const source = fs.readFileSync(serverPath, 'utf8');
    return uniqueBy(extractToolNamesFromServerSource(source), (name) => name).map((name) => ({
      name,
      server: 'devhub-control-plane',
      description: '',
    }));
  } catch {
    return [];
  }
}

export function classifyMcpToolSafety(tool = {}) {
  const authority = tool.authority || 'configured';
  const name = String(tool.name || '').trim();
  const server = String(tool.server || '').trim();
  const durableControlPlane = authority === 'durable' || server === 'devhub' || server === 'devhub-control-plane';
  const unsafeByPattern = UNSAFE_TOOL_PATTERNS.some((pattern) => pattern.test(name) || pattern.test(server));

  return {
    control_plane: durableControlPlane,
    safe_action: durableControlPlane && READ_ONLY_TOOL_PATTERN.test(name) && !unsafeByPattern,
  };
}

function flattenLiveInventory(servers = []) {
  if (!Array.isArray(servers)) return [];
  return servers.flatMap((server) =>
    (server.tools || []).map((tool) => ({
      server: server.name || 'executor',
      name: tool.name,
      description: tool.description || '',
    }))
  );
}

function flattenConfiguredInventory(servers = []) {
  return (servers || []).flatMap((server) =>
    (server.tools || []).map((tool) => ({
      server: server.name,
      name: tool.name,
      description: tool.description || '',
    }))
  );
}

function queryLatestRow(db, table, orderColumn = 'updated_at') {
  try {
    return (
      db.prepare(`SELECT * FROM ${table} ORDER BY ${orderColumn} DESC, rowid DESC LIMIT 1`).get() || null
    );
  } catch {
    return null;
  }
}

export function readDurableDiagnosticContext() {
  try {
    const db = localDb.getDb();
    const workspace = queryLatestRow(db, 'agent_workspaces');
    const run = workspace
      ? localDb.getLatestAgentRunForWorkspace(workspace.id)
      : queryLatestRow(db, 'agent_runs', 'created_at');
    const artifact = run
      ? localDb.getLatestAgentArtifactForRun(run.run_id)
      : queryLatestRow(db, 'agent_artifacts', 'created_at');
    const supervisorTaskId = run?.task_id || workspace?.current_task_id || null;
    const supervisor = supervisorTaskId
      ? localDb.getSupervisorSnapshot(supervisorTaskId)
      : queryLatestRow(db, 'supervisor_snapshots');

    return {
      status: 'healthy',
      freshness: 'current',
      db: {
        status: 'healthy',
        reason: 'DevHub durable evidence was assembled from local runtime tables.',
      },
      workspace,
      run,
      artifact,
      supervisor,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      freshness: 'unknown',
      error: error.message,
      db: {
        status: 'unavailable',
        reason: error.message,
      },
      workspace: null,
      run: null,
      artifact: null,
      supervisor: null,
    };
  }
}

function buildDoctorProbes({ durable, live, attach }) {
  const durableHealthy = durable?.status !== 'unavailable';
  const probes = [
    createProbe({
      key: 'environment',
      status: durableHealthy ? 'healthy' : 'unavailable',
      authority: durableHealthy ? 'durable' : 'configured',
      freshness: durableHealthy ? 'current' : 'unknown',
      reason: durableHealthy
        ? `Diagnostic surface running from ${process.cwd()}.`
        : 'Environment evidence unavailable because durable reads failed.',
      evidence: [createEvidence('path', process.cwd(), durableHealthy ? 'durable' : 'configured')],
    }),
    createProbe({
      key: 'runtime',
      status: live?.runtimeReachable ? 'healthy' : durableHealthy ? 'degraded' : 'unavailable',
      authority: live?.runtimeReachable ? 'live' : durableHealthy ? 'configured' : 'configured',
      freshness: live?.runtimeReachable ? 'current' : durableHealthy ? 'unknown' : 'unknown',
      reason: live?.runtimeReachable
        ? 'OpenCode runtime probe responded.'
        : live?.reason || 'OpenCode runtime probe is unavailable.',
      evidence: [
        createEvidence(
          live?.runtimeReachable ? 'live-probe' : 'runtime',
          live?.runtimeReachable ? 'opencode://runtime' : process.version,
          live?.runtimeReachable ? 'live' : 'configured'
        ),
      ],
    }),
    createProbe({
      key: 'permissions',
      status: durable?.supervisor ? 'healthy' : durableHealthy ? 'degraded' : 'unavailable',
      authority: durable?.supervisor ? 'durable' : durableHealthy ? 'durable' : 'configured',
      freshness: durable?.supervisor ? 'current' : durableHealthy ? 'unknown' : 'unknown',
      reason: durable?.supervisor
        ? `Supervisor state ${durable.supervisor.supervisor_state || 'unknown'} available.`
        : durableHealthy
          ? 'No durable supervisor evidence available for permission boundaries.'
          : 'Permissions evidence unavailable because durable reads failed.',
      evidence: durable?.supervisor
        ? [createEvidence('supervisor', durable.supervisor.evidence_ref, 'durable')]
        : [],
    }),
    createProbe({
      key: 'database',
      status: durable?.db?.status || (durableHealthy ? 'healthy' : 'unavailable'),
      authority: durableHealthy ? 'durable' : 'configured',
      freshness: durable?.freshness || (durableHealthy ? 'current' : 'unknown'),
      reason:
        durable?.db?.reason ||
        (durableHealthy ? 'Durable database connection succeeded.' : 'Durable database unavailable.'),
      evidence: [
        createEvidence(
          'database',
          durableHealthy ? 'localdb://runtime' : null,
          durableHealthy ? 'durable' : 'configured'
        ),
      ],
    }),
    createProbe({
      key: 'inventory',
      status: live?.inventoryAvailable ? 'healthy' : durableHealthy ? 'degraded' : 'unavailable',
      authority: live?.inventoryAvailable ? 'live' : durableHealthy ? 'configured' : 'configured',
      freshness: live?.inventoryAvailable ? 'current' : durableHealthy ? 'unknown' : 'unknown',
      reason: live?.inventoryAvailable
        ? 'Live MCP inventory responded.'
        : live?.reason || 'Inventory could only be derived from configured or durable evidence.',
      evidence: live?.inventoryAvailable
        ? [createEvidence('live-inventory', 'opencode://mcp', 'live')]
        : [createEvidence('config', 'mcp://configured-servers', 'configured')],
    }),
    createProbe({
      key: 'attach',
      status: attach?.available ? 'healthy' : 'unavailable',
      authority: attach?.available ? 'live' : 'configured',
      freshness: attach?.available ? 'current' : 'unknown',
      reason: attach?.reason || (attach?.available ? 'Attach evidence available.' : 'Attach evidence unavailable.'),
      evidence: attach?.available
        ? [createEvidence('attach', attach.ref || 'attach://gtk-vte', 'live')]
        : [],
    }),
  ];

  return probes;
}

function buildListTools({ durableTools, liveTools, configuredTools }) {
  return uniqueBy(
    [
      ...durableTools.map((tool) => ({ ...tool, authority: 'durable' })),
      ...liveTools.map((tool) => ({ ...tool, authority: 'live' })),
      ...configuredTools.map((tool) => ({ ...tool, authority: 'configured' })),
    ],
    (tool) => `${tool.authority}:${tool.server || 'unknown'}:${tool.name}`
  ).map((tool) => {
    const safety = classifyMcpToolSafety(tool);
    return createToolEntry({
      ...tool,
      ...safety,
      evidence:
        tool.authority === 'durable'
          ? [createEvidence('catalog', 'devhub-mcp/server.js', 'durable')]
          : tool.authority === 'live'
            ? [createEvidence('live-inventory', `opencode://${tool.server || 'executor'}`, 'live')]
            : [createEvidence('config', `mcp://${tool.server || 'configured'}`, 'configured')],
      reason: safety.control_plane
        ? safety.safe_action
          ? 'Read-only durable control-plane action.'
          : 'Durable tool exists but requires an explicit operator action outside smoke.'
        : 'Fuera del control plane durable.',
    });
  });
}

function buildSmokeChecks({ durable, live, attach }) {
  const checks = [
    createProbe({
      key: 'durable-read-model',
      status: durable?.status === 'unavailable' ? 'unavailable' : 'healthy',
      authority: durable?.status === 'unavailable' ? 'configured' : 'durable',
      freshness: durable?.freshness || 'unknown',
      reason:
        durable?.status === 'unavailable'
          ? durable?.error || 'Durable read-model unavailable.'
          : 'Durable task/workspace/run/artifact evidence is reachable.',
      evidence: [
        createEvidence(
          'database',
          durable?.status === 'unavailable' ? null : 'localdb://runtime',
          durable?.status === 'unavailable' ? 'configured' : 'durable'
        ),
      ],
    }),
    createProbe({
      key: 'bounded-connectivity',
      status: live?.reachable ? 'healthy' : durable?.status === 'unavailable' ? 'unavailable' : 'degraded',
      authority: live?.reachable ? 'live' : durable?.status === 'unavailable' ? 'configured' : 'configured',
      freshness: live?.reachable ? 'current' : 'unknown',
      reason: live?.reachable
        ? 'Bounded live probe responded without mutating durable truth.'
        : live?.reason || 'Live probe unavailable; smoke stays diagnostic.',
      evidence: live?.reachable
        ? [createEvidence('live-probe', 'opencode://mcp', 'live')]
        : [createEvidence('config', 'mcp://configured-servers', 'configured')],
    }),
    createProbe({
      key: 'attach',
      status: attach?.available ? 'healthy' : 'unavailable',
      authority: attach?.available ? 'live' : 'configured',
      freshness: attach?.available ? 'current' : 'unknown',
      reason: attach?.reason || 'Attach evidence unavailable.',
      evidence: attach?.available
        ? [createEvidence('attach', attach.ref || 'attach://gtk-vte', 'live')]
        : [],
    }),
  ];

  return checks;
}

function groupToolsAsServers(tools = [], inventoryProbe) {
  const grouped = new Map();
  const sortWeight = {
    live: 0,
    durable: 1,
    configured: 2,
  };

  for (const tool of tools) {
    const serverName = tool.control_plane ? 'devhub-control-plane' : tool.server || 'executor';
    if (!grouped.has(serverName)) {
      grouped.set(serverName, {
        name: serverName,
        status: tool.authority === 'live' || tool.authority === 'durable' ? 'connected' : 'degraded',
        authority: tool.authority,
        freshness: tool.authority === 'configured' ? 'unknown' : 'current',
        status_reason:
          tool.authority === 'configured'
            ? inventoryProbe?.reason || 'Inventory is based on configured evidence.'
            : tool.authority === 'durable'
              ? 'Durable DevHub tool catalog.'
              : 'Live executor inventory.',
        tools: [],
      });
    }
    grouped.get(serverName).tools.push({
      name: tool.name,
      description: tool.description,
      authority: tool.authority,
      safe_action: tool.safe_action,
      control_plane: tool.control_plane,
      reason: tool.reason,
      evidence: tool.evidence,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const leftWeight = sortWeight[left.authority] ?? 99;
    const rightWeight = sortWeight[right.authority] ?? 99;
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    return String(left.name).localeCompare(String(right.name));
  });
}

export function buildMcpControlCenterSnapshot(input = {}) {
  const observedAt = nowIso(input.observedAt);
  const durable = input.durable || { status: 'unavailable', freshness: 'unknown' };
  const live = input.live || {};
  const attach = input.attach || { available: false, reason: 'Attach evidence unavailable.' };
  const durableTools = (input.durableTools || []).map((tool) => ({
    server: tool.server || 'devhub-control-plane',
    description: tool.description || '',
    ...tool,
  }));
  const liveTools = (input.live?.tools || []).map((tool) => ({ description: '', ...tool }));
  const configuredTools = flattenConfiguredInventory(input.configuredServers || []);

  const doctorProbes = buildDoctorProbes({ durable, live, attach });
  const listTools = buildListTools({ durableTools, liveTools, configuredTools });
  const smokeChecks = buildSmokeChecks({ durable, live, attach });
  const smokeStatus = input.smokeStatus || summarizeSmokeStatus(smokeChecks);
  const authority = durable?.status === 'unavailable' ? 'configured' : 'durable';
  const freshness = durable?.status === 'unavailable' ? 'unknown' : durable?.freshness || 'current';
  const inventoryProbe = doctorProbes.find((probe) => probe.key === 'inventory');

  return createMcpControlCenterSnapshot({
    observed_at: observedAt,
    authority,
    freshness,
    evidence: {
      durable:
        durable?.status === 'unavailable'
          ? []
          : [
              createEvidence('database', 'localdb://runtime', 'durable'),
              durable?.artifact?.evidence_ref
                ? createEvidence('artifact', durable.artifact.evidence_ref, 'durable')
                : null,
              durable?.supervisor?.evidence_ref
                ? createEvidence('supervisor', durable.supervisor.evidence_ref, 'durable')
                : null,
            ].filter(Boolean),
      live: live?.reachable ? [createEvidence('live-probe', 'opencode://mcp', 'live')] : [],
    },
    doctor: {
      probes: doctorProbes,
    },
    list_tools: {
      tools: listTools,
    },
    smoke: {
      status: smokeStatus,
      checks: smokeChecks,
    },
    status_reason: firstReason(doctorProbes, 'MCP diagnostics assembled from durable evidence first.'),
    note:
      inventoryProbe?.status !== 'healthy'
        ? inventoryProbe?.reason || 'Inventory could not be fully verified.'
        : null,
    servers: groupToolsAsServers(listTools, inventoryProbe),
  });
}

export async function fetchLiveMcpInventory({ fetchImpl = fetch, serverUrl, timeoutMs = 2000 } = {}) {
  if (typeof fetchImpl !== 'function' || !serverUrl) {
    return {
      reachable: false,
      runtimeReachable: false,
      inventoryAvailable: false,
      reason: 'Live MCP probe not configured.',
      tools: [],
      servers: [],
    };
  }

  try {
    const response = await fetchImpl(`${serverUrl}/mcp`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return {
        reachable: false,
        runtimeReachable: false,
        inventoryAvailable: false,
        reason: `Live MCP probe responded with ${response.status}.`,
        tools: [],
        servers: [],
      };
    }

    const body = await response.json();
    const servers = Array.isArray(body) ? body : [];
    return {
      reachable: true,
      runtimeReachable: true,
      inventoryAvailable: Array.isArray(servers),
      reason: 'Live MCP inventory responded.',
      tools: flattenLiveInventory(servers),
      servers,
    };
  } catch {
    return {
      reachable: false,
      runtimeReachable: false,
      inventoryAvailable: false,
      reason: 'OpenCode did not expose a live inventory endpoint.',
      tools: [],
      servers: [],
    };
  }
}

export async function assembleMcpControlCenterSnapshot(options = {}) {
  const durable = options.durable || readDurableDiagnosticContext();
  const configuredServers = options.configuredServers || getConfiguredMcpServers();
  const durableTools = options.durableTools || readDurableToolCatalog();
  const live =
    options.live ||
    (await fetchLiveMcpInventory({
      fetchImpl: options.fetchImpl,
      serverUrl: options.serverUrl,
      timeoutMs: options.timeoutMs,
    }));
  const attach = options.attach || {
    available: false,
    reason: 'GTK/VTE attach is optional and unavailable in this environment.',
  };

  return buildMcpControlCenterSnapshot({
    observedAt: nowIso(options.now),
    durable,
    live,
    attach,
    durableTools,
    configuredServers,
  });
}
