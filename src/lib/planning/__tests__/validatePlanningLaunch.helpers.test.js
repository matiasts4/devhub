/**
 * Unit tests for the pure helpers in `validatePlanningLaunch.js` that the
 * UI consumes:
 *   - `shouldBlockOnPreflight(preflight) → boolean`
 *   - `firstPreflightError(preflight) → { id, message } | null`
 *   - `collectMcpToolNames(snapshot) → Set<string>`
 *
 * The decision logic for whether to block the launch lives here (not in
 * `Planificacion.jsx`) so the rule can be unit-tested without rendering
 * React. The component only consumes the boolean + the first-error object.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

 
const {
  shouldBlockOnPreflight,
  firstPreflightError,
  collectMcpToolNames,
} = require('../validatePlanningLaunch.js');

function okResult(checks = []) {
  return { ok: true, checks };
}

function failingResult(checks) {
  return { ok: false, checks };
}

// --- shouldBlockOnPreflight ---

test('shouldBlockOnPreflight: returns true when preflight is null or undefined', () => {
  assert.equal(shouldBlockOnPreflight(null), true);
  assert.equal(shouldBlockOnPreflight(undefined), true);
});

test('shouldBlockOnPreflight: returns false when ok === true', () => {
  assert.equal(shouldBlockOnPreflight(okResult()), false);
});

test('shouldBlockOnPreflight: returns true when ok === false', () => {
  assert.equal(
    shouldBlockOnPreflight(
      failingResult([{ id: 'opencode', ok: false, level: 'error', message: 'X' }])
    ),
    true
  );
});

test('shouldBlockOnPreflight: returns true when ok field is missing entirely (defensive)', () => {
  // The orchestrator contract: the function must be conservative — if the
  // shape is wrong, block. This is a regression net for accidental
  // `result.ok` rename to something else.
  assert.equal(shouldBlockOnPreflight({ checks: [] }), true);
});

// --- firstPreflightError ---

test('firstPreflightError: returns null when preflight is null/undefined', () => {
  assert.equal(firstPreflightError(null), null);
  assert.equal(firstPreflightError(undefined), null);
});

test('firstPreflightError: returns null when preflight is ok', () => {
  assert.equal(firstPreflightError(okResult([{ id: 'x', ok: true, level: 'pass', message: 'X' }])), null);
});

test('firstPreflightError: returns the first error-level entry', () => {
  const checks = [
    { id: 'documentation', ok: true, level: 'warn', message: 'warn1' },
    { id: 'opencode', ok: false, level: 'error', message: 'OpenCode no está corriendo.' },
    { id: 'llm', ok: false, level: 'error', message: 'No hay proveedor LLM.' },
  ];
  const first = firstPreflightError(failingResult(checks));
  assert.deepEqual(first, { id: 'opencode', message: 'OpenCode no está corriendo.' });
});

test('firstPreflightError: skips warn entries and picks the first error', () => {
  const checks = [
    { id: 'documentation', ok: true, level: 'warn', message: 'warn' },
    { id: 'opencode', ok: false, level: 'error', message: 'real error' },
  ];
  const first = firstPreflightError(failingResult(checks));
  assert.equal(first.id, 'opencode');
  assert.equal(first.message, 'real error');
});

test('firstPreflightError: returns null when ok=false but no error-level entry exists', () => {
  // Defensive: an ok=false result with only warn entries is a malformed
  // preflight (the function only sets ok=false on real errors). The UI
  // should NOT render a banner in that case — return null.
  const checks = [
    { id: 'documentation', ok: true, level: 'warn', message: 'warn' },
  ];
  assert.equal(firstPreflightError({ ok: false, checks }), null);
});

// --- collectMcpToolNames ---

test('collectMcpToolNames: returns an empty Set for null / undefined / non-object input', () => {
  assert.equal(collectMcpToolNames(null).size, 0);
  assert.equal(collectMcpToolNames(undefined).size, 0);
  assert.equal(collectMcpToolNames('not an object').size, 0);
});

test('collectMcpToolNames: collects names from list_tools.tools', () => {
  const snapshot = {
    list_tools: {
      tools: [
        { name: 'get_project_context', server: 'devhub-control-plane' },
        { name: 'bulk_create_tasks', server: 'devhub-control-plane' },
        { name: 'update_project', server: 'devhub-control-plane' },
      ],
    },
  };
  const names = collectMcpToolNames(snapshot);
  assert.equal(names.size, 3);
  assert.ok(names.has('get_project_context'));
  assert.ok(names.has('bulk_create_tasks'));
  assert.ok(names.has('update_project'));
});

test('collectMcpToolNames: also collects names from servers[].tools (legacy view)', () => {
  const snapshot = {
    servers: [
      {
        name: 'devhub-control-plane',
        tools: [{ name: 'get_project_context' }, { name: 'bulk_create_tasks' }],
      },
    ],
  };
  const names = collectMcpToolNames(snapshot);
  assert.equal(names.size, 2);
  assert.ok(names.has('get_project_context'));
  assert.ok(names.has('bulk_create_tasks'));
});

test('collectMcpToolNames: union of list_tools + servers (deduplicated)', () => {
  const snapshot = {
    list_tools: {
      tools: [
        { name: 'get_project_context' },
        { name: 'update_project' },
      ],
    },
    servers: [
      {
        name: 'devhub-control-plane',
        tools: [
          { name: 'get_project_context' }, // duplicate from list_tools
          { name: 'bulk_create_tasks' }, // new from servers
        ],
      },
    ],
  };
  const names = collectMcpToolNames(snapshot);
  assert.equal(names.size, 3);
  assert.ok(names.has('get_project_context'));
  assert.ok(names.has('update_project'));
  assert.ok(names.has('bulk_create_tasks'));
});

test('collectMcpToolNames: ignores tool entries with empty or non-string name', () => {
  const snapshot = {
    list_tools: {
      tools: [
        { name: 'good_tool' },
        { name: '' },
        { name: null },
        { name: 42 },
        {},
        { name: 'another_good_tool' },
      ],
    },
  };
  const names = collectMcpToolNames(snapshot);
  assert.equal(names.size, 2);
  assert.ok(names.has('good_tool'));
  assert.ok(names.has('another_good_tool'));
});
