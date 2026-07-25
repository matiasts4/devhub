/**
 * Unit tests for `validatePlanningLaunch` — the planning preflight gate.
 *
 * The function calls three endpoints in parallel:
 *   - GET /api/agenthub/opencode/status
 *   - GET /api/agenthub/llm/status
 *   - GET /api/agenthub/mcp/status
 *
 * plus three synchronous checks (documentationPolicy, localPath, hasContext).
 * Each check is rolled into a `{ id, ok, level, message }` entry. `ok` is true
 * on the overall result iff no entry has `{ ok: false, level: 'error' }`.
 *
 * Test scenarios (per tasks.md §3.3):
 *   A — all three endpoints return PASS shapes → ok=true, all checks pass
 *   B — opencode returns running:false → ok=false, first error in Spanish
 *   C — mcp returns snapshot WITHOUT get_project_context → ok=false, error names the tool
 *   D — llm returns ready:false → ok=false, error message in Spanish
 *   E — documentationPolicy='missing' → ok=true but checks include a 'warn' entry
 *   F — a fetch throws (network error) → that check fails with a Spanish error
 *   G — AbortController timeout → check fails fast
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// --- Fixture builders ---

function makeOpencodeHealthyResponse() {
  return {
    process: { running: true, healthy: true, pid: 123, port: 4153 },
    concurrency: { active: 1, max: 5, atLimit: false },
    queue: { length: 0, items: [] },
  };
}

function makeOpencodeDownResponse() {
  return {
    process: { running: false, healthy: false, pid: null, port: null },
    concurrency: { active: 0, max: 5, atLimit: false },
    queue: { length: 0, items: [] },
  };
}

function makeOpencodeAtLimitResponse() {
  return {
    process: { running: true, healthy: true, pid: 123, port: 4153 },
    concurrency: { active: 5, max: 5, atLimit: true },
    queue: { length: 0, items: [] },
  };
}

function makeLlmReadyResponse(provider = 'minimax') {
  return { ready: true, provider, reason: null };
}

function makeLlmNotReadyResponse() {
  return {
    ready: false,
    provider: null,
    reason: 'No hay proveedor LLM habilitado. Configurá uno en Ajustes → LLM.',
  };
}

function makeMcpHealthyResponse() {
  return {
    list_tools: {
      tools: [
        { name: 'get_project_context', server: 'devhub-control-plane' },
        { name: 'bulk_create_milestones', server: 'devhub-control-plane' },
        { name: 'bulk_create_tasks', server: 'devhub-control-plane' },
        { name: 'update_project', server: 'devhub-control-plane' },
      ],
    },
    servers: [
      {
        name: 'devhub-control-plane',
        status: 'connected',
        tools: [
          { name: 'get_project_context' },
          { name: 'bulk_create_milestones' },
          { name: 'bulk_create_tasks' },
          { name: 'update_project' },
        ],
      },
    ],
  };
}

function makeMcpMissingGetProjectContextResponse() {
  return {
    list_tools: {
      tools: [
        { name: 'bulk_create_milestones', server: 'devhub-control-plane' },
        { name: 'bulk_create_tasks', server: 'devhub-control-plane' },
        { name: 'update_project', server: 'devhub-control-plane' },
      ],
    },
    servers: [],
  };
}

function makeJsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

function makeFetchStub(map) {
  // map: { opencode?: body, llm?: body, mcp?: body, throw?: 'opencode'|''llm'|'mcp' }
  return async (url) => {
    if (url.includes('/api/agenthub/opencode/status')) {
      if (map.throwOpencode) throw new Error('ECONNREFUSED');
      return makeJsonResponse(map.opencode || makeOpencodeHealthyResponse());
    }
    if (url.includes('/api/agenthub/llm/status')) {
      if (map.throwLlm) throw new Error('ECONNREFUSED');
      return makeJsonResponse(map.llm || makeLlmReadyResponse());
    }
    if (url.includes('/api/agenthub/mcp/status')) {
      if (map.throwMcp) throw new Error('ECONNREFUSED');
      return makeJsonResponse(map.mcp || makeMcpHealthyResponse());
    }
    throw new Error(`Unexpected URL in fetch stub: ${url}`);
  };
}

const BASE_INPUT = {
  projectId: '11111111-1111-4111-8111-111111111111',
  documentationPolicy: 'shared',
  localPath: '/home/matias/projects/demo',
  hasContext: true,
};

// --- Module under test (late import so we can require per test if needed) ---
function loadModule() {
  return require('../validatePlanningLaunch.js');
}

// --- Scenario A: all three endpoints healthy → ok=true, all checks pass ---

test('validatePlanningLaunch: scenario A — all endpoints healthy, all checks PASS', async () => {
  const fetchImpl = makeFetchStub({});
  const mod = loadModule();
  const result = await mod.validatePlanningLaunch({ ...BASE_INPUT, fetchImpl });

  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.checks));
  const ids = result.checks.map((c) => c.id);
  assert.ok(ids.includes('opencode'), 'opencode check must be present');
  assert.ok(ids.includes('llm'), 'llm check must be present');
  assert.ok(ids.includes('mcp'), 'mcp check must be present');
  assert.ok(ids.includes('documentation'), 'documentation check must be present');
  assert.ok(ids.includes('localPath'), 'localPath check must be present');
  assert.ok(ids.includes('hasContext'), 'hasContext check must be present');

  const opencode = result.checks.find((c) => c.id === 'opencode');
  const llm = result.checks.find((c) => c.id === 'llm');
  const mcp = result.checks.find((c) => c.id === 'mcp');
  assert.equal(opencode.ok, true);
  assert.equal(opencode.level, 'pass');
  assert.equal(llm.ok, true);
  assert.equal(llm.level, 'pass');
  assert.equal(mcp.ok, true);
  assert.equal(mcp.level, 'pass');
});

// --- Scenario B: opencode down → ok=false, Spanish error mentioning OpenCode ---

test('validatePlanningLaunch: scenario B — opencode down → ok=false, first error names OpenCode in Spanish', async () => {
  const fetchImpl = makeFetchStub({ opencode: makeOpencodeDownResponse() });
  const mod = loadModule();
  const result = await mod.validatePlanningLaunch({ ...BASE_INPUT, fetchImpl });

  assert.equal(result.ok, false);
  const opencode = result.checks.find((c) => c.id === 'opencode');
  assert.equal(opencode.ok, false);
  assert.equal(opencode.level, 'error');
  assert.match(opencode.message, /OpenCode/i);
  // Spanish check: must contain a Spanish stopword or a diacritic.
  assert.match(opencode.message, /[áéíóúñÁÉÍÓÚÑ]|\b(no|corre|inic|planif)\b/i);
});

// --- Scenario C: MCP missing get_project_context → ok=false, error names the tool ---

test('validatePlanningLaunch: scenario C — MCP missing get_project_context → ok=false, error names the tool', async () => {
  const fetchImpl = makeFetchStub({ mcp: makeMcpMissingGetProjectContextResponse() });
  const mod = loadModule();
  const result = await mod.validatePlanningLaunch({ ...BASE_INPUT, fetchImpl });

  assert.equal(result.ok, false);
  const mcp = result.checks.find((c) => c.id === 'mcp');
  assert.equal(mcp.ok, false);
  assert.equal(mcp.level, 'error');
  // The contract: the message must name the missing tool so the user can act.
  assert.match(mcp.message, /get_project_context/);
  // And the message must be Spanish.
  assert.match(mcp.message, /[áéíóúñÁÉÍÓÚÑ]|\b(no|falta|herramienta|revisá)\b/i);
});

// --- Scenario D: LLM not ready → ok=false, Spanish error ---

test('validatePlanningLaunch: scenario D — LLM not ready → ok=false, error in Spanish', async () => {
  const fetchImpl = makeFetchStub({ llm: makeLlmNotReadyResponse() });
  const mod = loadModule();
  const result = await mod.validatePlanningLaunch({ ...BASE_INPUT, fetchImpl });

  assert.equal(result.ok, false);
  const llm = result.checks.find((c) => c.id === 'llm');
  assert.equal(llm.ok, false);
  assert.equal(llm.level, 'error');
  assert.match(llm.message, /[áéíóúñÁÉÍÓÚÑ]|\b(no|proveedor|configurá)\b/i);
});

// --- Scenario E: documentationPolicy='missing' → ok=true but 'warn' entry present ---

test('validatePlanningLaunch: scenario E — documentationPolicy=missing → ok=true, warn-level entry present', async () => {
  const fetchImpl = makeFetchStub({});
  const mod = loadModule();
  const result = await mod.validatePlanningLaunch({
    ...BASE_INPUT,
    documentationPolicy: 'missing',
    fetchImpl,
  });

  assert.equal(result.ok, true);
  const documentation = result.checks.find((c) => c.id === 'documentation');
  assert.equal(documentation.level, 'warn');
  assert.equal(documentation.ok, true); // warn entries are not failures
});

// --- Scenario F: fetch throws (network error) → that check fails with Spanish error ---

test('validatePlanningLaunch: scenario F — fetch throws (network error) → check fails with Spanish error', async () => {
  const fetchImpl = makeFetchStub({ throwMcp: true });
  const mod = loadModule();
  const result = await mod.validatePlanningLaunch({ ...BASE_INPUT, fetchImpl });

  assert.equal(result.ok, false);
  const mcp = result.checks.find((c) => c.id === 'mcp');
  assert.equal(mcp.ok, false);
  assert.equal(mcp.level, 'error');
  assert.match(mcp.message, /[áéíóúñÁÉÍÓÚÑ]|\b(no|conexi|caíd|fall)\b/i);
});

// --- Scenario G: AbortController timeout → check fails fast ---

test('validatePlanningLaunch: scenario G — fetch never resolves → AbortController timeout fires, check fails fast', async () => {
  // A fetch stub that respects the AbortController signal but never resolves
  // on its own. This is the contract a real `fetch` (with the standard
  // WHATWG `signal` option) honors; a hand-rolled stub that ignores the
  // signal is a buggy stub, not a test of the production timeout.
  function makeAbortError() {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    return err;
  }
  const hangingFetch = (_url, init = {}) =>
    new Promise((_resolve, reject) => {
      const signal = init && init.signal;
      if (signal) {
        if (signal.aborted) {
          reject(makeAbortError());
          return;
        }
        signal.addEventListener('abort', () => {
          reject(makeAbortError());
        });
      }
    });
  const mod = loadModule();

  const start = Date.now();
  const result = await mod.validatePlanningLaunch({
    ...BASE_INPUT,
    fetchImpl: hangingFetch,
    timeoutMs: 50,
  });
  const elapsed = Date.now() - start;

  // The whole preflight should have completed in < 1500ms (3 timeouts of
  // 50ms each, fired in parallel; allow generous slack for the test runner).
  assert.ok(elapsed < 1500, `expected preflight to time out fast; took ${elapsed}ms`);

  assert.equal(result.ok, false);
  const failing = result.checks.filter((c) => c.ok === false && c.level === 'error');
  assert.ok(failing.length >= 3, 'all 3 endpoint checks should have failed with timeout');
  for (const check of failing) {
    assert.match(check.message, /tiempo|timeout|expir/i);
  }
});

// --- Triangulation: warn-only path (opencode at concurrency limit) → ok=true, warn entry ---

test('validatePlanningLaunch: warn-only — opencode at concurrency limit → ok=true, warn entry present', async () => {
  const fetchImpl = makeFetchStub({ opencode: makeOpencodeAtLimitResponse() });
  const mod = loadModule();
  const result = await mod.validatePlanningLaunch({ ...BASE_INPUT, fetchImpl });

  assert.equal(result.ok, true);
  const warnEntries = result.checks.filter((c) => c.level === 'warn');
  assert.ok(warnEntries.length >= 1, 'at least one warn entry expected');
  // The warn must be on a check related to concurrency / opencode.
  const ids = warnEntries.map((c) => c.id);
  assert.ok(
    ids.some((id) => id === 'opencode' || id.includes('concurrency')),
    `expected a warn on opencode or concurrency, got: ${ids.join(', ')}`
  );
});

// --- Triangulation: hasContext=false → ok=false, hasContext is an error ---

test('validatePlanningLaunch: hasContext=false → ok=false, hasContext check is an error', async () => {
  const fetchImpl = makeFetchStub({});
  const mod = loadModule();
  const result = await mod.validatePlanningLaunch({
    ...BASE_INPUT,
    hasContext: false,
    fetchImpl,
  });

  assert.equal(result.ok, false);
  const hasContext = result.checks.find((c) => c.id === 'hasContext');
  assert.equal(hasContext.ok, false);
  assert.equal(hasContext.level, 'error');
});

// --- Triangulation: localPath empty → ok=true, warn entry ---

test('validatePlanningLaunch: localPath empty → ok=true, localPath check is a warn', async () => {
  const fetchImpl = makeFetchStub({});
  const mod = loadModule();
  const result = await mod.validatePlanningLaunch({
    ...BASE_INPUT,
    localPath: '',
    fetchImpl,
  });

  assert.equal(result.ok, true);
  const localPath = result.checks.find((c) => c.id === 'localPath');
  assert.equal(localPath.level, 'warn');
  assert.equal(localPath.ok, true);
});
