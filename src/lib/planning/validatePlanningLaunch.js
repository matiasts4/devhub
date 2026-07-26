/**
 * @module validatePlanningLaunch
 *
 * Preflight gate for the planning-agent launch. Calls the three
 * `/api/agenthub/[name]/status` endpoints in parallel (with per-check
 * timeout) and rolls the results plus three synchronous checks on the
 * launch inputs into a flat list of check entries.
 *
 * The result is consumed by Planificacion.jsx to render an inline
 * first-error banner when any required check fails.
 *
 * Locked contract (openspec/changes/planning-launch-hardening/tasks.md 3.4):
 *   - 3 fetches in parallel, each with a 4 s timeout (AbortController)
 *   - `ok` is true iff no entry has `ok: false, level: 'error'`
 *   - All `message` strings are in Spanish
 *   - `fetchImpl` is injectable so the test suite can run without a DOM
 *     and without touching the global `fetch`
 */

const DEFAULT_TIMEOUT_MS = 4000;

const SPANISH = Object.freeze({
  opencodeDown: 'OpenCode no está corriendo. Inicialo desde Ajustes → Swarm antes de planificar.',
  opencodeAtLimit: 'OpenCode está al límite de concurrencia — el agente entrará en cola.',
  llmNotReady: (reason) =>
    reason || 'No hay proveedor LLM configurado. Andá a Ajustes → LLM y activá un proveedor.',
  mcpMissingTool: (tool) =>
    `DevHub MCP no expone la herramienta "${tool}". Revisá la config del server MCP y reinicialo.`,
  mcpUnreachable: 'DevHub MCP no responde. Verificá que esté corriendo.',
  docsMissing: 'Política documental no definida — el agente usará "personal" por defecto.',
  localPathMissing:
    'El proyecto no tiene local_path: el agente no podrá inspeccionar el repo local.',
  noContext: 'Agregá contexto en el prompt o subí al menos un archivo antes de planificar.',
  fetchFailed: (subsystem) =>
    `No se pudo contactar el subsistema ${subsystem}. Verificá que esté corriendo.`,
  fetchTimeout: (subsystem) =>
    `Tiempo de espera agotado al consultar ${subsystem}. Reintentá en unos segundos.`,
});

/**
 * Plan the MCP tool catalog lookup. The MCP route returns a snapshot shaped
 * by `buildMcpControlCenterSnapshot()` (see `src/lib/mcp/control-center.js`).
 * The two locations we consult for tool names:
 *   1. `list_tools.tools[].name` — flat catalog of every tool across every
 *      server. Each entry has `{ name, server, description, authority, ... }`.
 *   2. `servers[].tools[].name` — per-server tool list. Some snapshots only
 *      populate this view (e.g. when the durable catalog is unavailable and
 *      the response is built from configured servers alone).
 * The function is defensive: it accepts either or both shapes and returns the
 * union of tool names. Missing tool names are reported by the caller.
 *
 * @param {object} snapshot
 * @returns {Set<string>}
 */
export function collectMcpToolNames(snapshot) {
  const names = new Set();
  if (!snapshot || typeof snapshot !== 'object') return names;

  // Path 1: flat catalog at list_tools.tools[].name
  const flat = Array.isArray(snapshot.list_tools?.tools) ? snapshot.list_tools.tools : [];
  for (const tool of flat) {
    if (tool && typeof tool.name === 'string' && tool.name.length > 0) {
      names.add(tool.name);
    }
  }

  // Path 2: per-server view at servers[].tools[].name
  const servers = Array.isArray(snapshot.servers) ? snapshot.servers : [];
  for (const server of servers) {
    const serverTools = Array.isArray(server?.tools) ? server.tools : [];
    for (const tool of serverTools) {
      if (tool && typeof tool.name === 'string' && tool.name.length > 0) {
        names.add(tool.name);
      }
    }
  }

  return names;
}

/**
 * Fetch a single endpoint with a hard timeout via AbortController.
 *
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @param {number} timeoutMs
 * @returns {Promise<{ body: object, status: number } | { error: 'timeout'|'network'|'http', status?: number, message: string }>}
 */
async function fetchWithTimeout(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      return { error: 'http', status: res.status, message: `HTTP ${res.status}` };
    }
    const body = await res.json();
    return { body, status: res.status };
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) {
      return { error: 'timeout', message: 'AbortError' };
    }
    return { error: 'network', message: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

const SUBSYSTEM_LABELS = Object.freeze({
  opencode: 'OpenCode',
  llm: 'LLM',
  mcp: 'DevHub MCP',
});

/**
 * Validate that the planning agent can be launched.
 *
 * @param {object} input
 * @param {string} input.projectId
 * @param {string|undefined} input.documentationPolicy
 * @param {string|undefined} input.localPath
 * @param {boolean} input.hasContext
 * @param {typeof fetch} [input.fetchImpl] — defaults to `globalThis.fetch`
 * @param {number} [input.timeoutMs=4000] — per-check timeout
 * @param {string} [input.baseUrl] — defaults to '' (same-origin)
 * @returns {Promise<{ ok: boolean, checks: Array<{ id: string, ok: boolean, level: 'pass'|'warn'|'error', message: string }> }>}
 */
export async function validatePlanningLaunch(input = {}) {
  const {
    projectId: _projectId,
    documentationPolicy,
    localPath,
    hasContext,
    fetchImpl = (typeof globalThis !== 'undefined' && globalThis.fetch) || fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseUrl = '',
  } = input;

  const checks = [];
  const url = (suffix) => `${baseUrl}/api/agenthub${suffix}`;

  // --- Three parallel endpoint checks ---
  const [opencodeResult, llmResult, mcpResult] = await Promise.all([
    fetchWithTimeout(url('/opencode/status'), fetchImpl, timeoutMs),
    fetchWithTimeout(url('/llm/status'), fetchImpl, timeoutMs),
    fetchWithTimeout(url('/mcp/status'), fetchImpl, timeoutMs),
  ]);

  // opencode: PASS if running && healthy !== false; WARN if atLimit; FAIL otherwise
  if (opencodeResult.error === 'timeout') {
    checks.push({
      id: 'opencode',
      ok: false,
      level: 'error',
      message: SPANISH.fetchTimeout(SUBSYSTEM_LABELS.opencode),
    });
  } else if (opencodeResult.error) {
    checks.push({
      id: 'opencode',
      ok: false,
      level: 'error',
      message: SPANISH.fetchFailed(SUBSYSTEM_LABELS.opencode),
    });
  } else {
    const proc = opencodeResult.body?.process;
    const concurrency = opencodeResult.body?.concurrency;
    const running = proc?.running === true;
    const healthy = proc?.healthy !== false;
    if (running && healthy) {
      checks.push({
        id: 'opencode',
        ok: true,
        level: 'pass',
        message: 'OpenCode está corriendo y responde.',
      });
    } else {
      checks.push({
        id: 'opencode',
        ok: false,
        level: 'error',
        message: SPANISH.opencodeDown,
      });
    }
    if (concurrency?.atLimit === true) {
      checks.push({
        id: 'concurrency',
        ok: true,
        level: 'warn',
        message: SPANISH.opencodeAtLimit,
      });
    }
  }

  // llm: PASS if body.ready === true
  if (llmResult.error === 'timeout') {
    checks.push({
      id: 'llm',
      ok: false,
      level: 'error',
      message: SPANISH.fetchTimeout(SUBSYSTEM_LABELS.llm),
    });
  } else if (llmResult.error) {
    checks.push({
      id: 'llm',
      ok: false,
      level: 'error',
      message: SPANISH.fetchFailed(SUBSYSTEM_LABELS.llm),
    });
  } else {
    const ready = llmResult.body?.ready === true;
    if (ready) {
      checks.push({
        id: 'llm',
        ok: true,
        level: 'pass',
        message: `Proveedor LLM listo: ${llmResult.body?.provider || 'configurado'}.`,
      });
    } else {
      checks.push({
        id: 'llm',
        ok: false,
        level: 'error',
        message: SPANISH.llmNotReady(llmResult.body?.reason),
      });
    }
  }

  // mcp: PASS if the catalog exposes get_project_context AND bulk_create_tasks
  // (the two tools the planning flow consumes; bulk_create_milestones is
  // optional here because the agent can call it via the same `bulk_*` family,
  // and update_project is the close instruction — already implied by context).
  if (mcpResult.error === 'timeout') {
    checks.push({
      id: 'mcp',
      ok: false,
      level: 'error',
      message: SPANISH.fetchTimeout(SUBSYSTEM_LABELS.mcp),
    });
  } else if (mcpResult.error) {
    checks.push({
      id: 'mcp',
      ok: false,
      level: 'error',
      message: SPANISH.mcpUnreachable,
    });
  } else {
    const names = collectMcpToolNames(mcpResult.body);
    const required = ['get_project_context', 'bulk_create_tasks'];
    const missing = required.filter((name) => !names.has(name));
    if (missing.length === 0) {
      checks.push({
        id: 'mcp',
        ok: true,
        level: 'pass',
        message: 'DevHub MCP expone las herramientas de planificación.',
      });
    } else {
      checks.push({
        id: 'mcp',
        ok: false,
        level: 'error',
        message: SPANISH.mcpMissingTool(missing[0]),
      });
    }
  }

  // --- Three synchronous input checks ---

  if (documentationPolicy === 'missing') {
    checks.push({
      id: 'documentation',
      ok: true,
      level: 'warn',
      message: SPANISH.docsMissing,
    });
  } else {
    checks.push({
      id: 'documentation',
      ok: true,
      level: 'pass',
      message: 'Política documental configurada.',
    });
  }

  if (!localPath || String(localPath).trim() === '') {
    checks.push({
      id: 'localPath',
      ok: true,
      level: 'warn',
      message: SPANISH.localPathMissing,
    });
  } else {
    checks.push({
      id: 'localPath',
      ok: true,
      level: 'pass',
      message: 'Ruta local del proyecto configurada.',
    });
  }

  if (hasContext) {
    checks.push({
      id: 'hasContext',
      ok: true,
      level: 'pass',
      message: 'Hay contexto para planificar.',
    });
  } else {
    checks.push({
      id: 'hasContext',
      ok: false,
      level: 'error',
      message: SPANISH.noContext,
    });
  }

  const ok = !checks.some((c) => c.ok === false && c.level === 'error');
  return { ok, checks };
}

/**
 * Pure helper used by the UI: pick the first `level: 'error'` check from a
 * preflight result. Returns `null` when the result is `ok === true`. The UI
 * renders the returned entry's `message` in the inline banner.
 *
 * Extracted as a pure function so it can be unit-tested without rendering the
 * full React tree (per tasks.md §3.5 fallback).
 *
 * @param {{ ok: boolean, checks: Array<{ id: string, ok: boolean, level: string, message: string }> } | null | undefined} preflight
 * @returns {{ id: string, message: string } | null}
 */
export function firstPreflightError(preflight) {
  if (!preflight || preflight.ok === true) return null;
  const checks = Array.isArray(preflight.checks) ? preflight.checks : [];
  const errorEntry = checks.find((c) => c && c.level === 'error' && c.ok === false);
  if (!errorEntry) return null;
  return { id: errorEntry.id, message: errorEntry.message };
}

/**
 * Pure helper used by the UI: decide whether the preflight result blocks
 * the launch. The UI calls this from `handleStartPlanning` to short-circuit
 * before invoking `launchPlanningAgent`. Returns `true` when the preflight
 * failed (block) and `false` when the preflight passed (proceed).
 *
 * Extracted as a pure function so the unit test can verify the decision
 * without rendering React.
 *
 * @param {{ ok: boolean } | null | undefined} preflight
 * @returns {boolean}
 */
export function shouldBlockOnPreflight(preflight) {
  if (!preflight) return true; // missing preflight = block
  return preflight.ok !== true;
}
