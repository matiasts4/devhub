/**
 * dispatchPlanningAgentRun — planning-launch-hardening Fase 4.
 *
 * Behaviour under test (per design.md Decision 1 + 8 + tasks.md 4.1 / 4.2):
 *   1. Emit `devhub:run-agent` CustomEvent synchronously on the first try.
 *   2. Register a one-shot `devhub:run-agent-accepted` listener; on a matching
 *      `detail.taskId` (or a no-taskId ack), clear the retry interval and remove
 *      the listener.
 *   3. If not acked, retry every RETRY_MS up to MAX_ATTEMPTS total.
 *   4. On MAX_ATTEMPTS exhausted, console.warn with a Spanish message; do NOT
 *      throw. Returns { accepted: boolean, attempts: number }.
 *
 * Window: read off `globalThis` (Phase 2 lesson — bare-node tests crash on
 * `window is not defined`). The helper accepts `opts.eventTarget` for tests
 * that want to pass a custom dispatcher/listener registry.
 *
 * Run: `npm test -- --testPathPattern=dispatchPlanningAgentRun` (Jest, runInBand).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Late import so each test can install its own globalThis.window stub.
function loadModule() {
   
  return require('../dispatchPlanningAgentRun.js');
}

function makeWindowStub() {
  const dispatched = [];
  const listeners = new Map(); // eventType -> [handler]

  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init?.detail;
      // Carry other init props verbatim so listeners can inspect them.
      if (init && typeof init === 'object') {
        for (const k of Object.keys(init)) {
          if (k !== 'detail' && !(k in this)) this[k] = init[k];
        }
      }
    }
  }

  return {
    stub: {
      CustomEvent,
      dispatchEvent(event) {
        dispatched.push(event);
        const type = event?.type;
        if (!type) return true;
        const handlers = listeners.get(type) || [];
        for (const h of handlers) {
          try {
            h.call(null, event);
          } catch (err) {
            // Swallow listener errors in the stub — they should not abort
            // the dispatcher's retry loop.
          }
        }
        return true;
      },
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      removeEventListener(type, handler) {
        const arr = listeners.get(type);
        if (!arr) return;
        const idx = arr.indexOf(handler);
        if (idx !== -1) arr.splice(idx, 1);
      },
    },
    dispatched,
    listeners,
  };
}

function withWindow(window, fn) {
  const hadWindow = 'window' in globalThis;
  const prevWindow = globalThis.window;
  globalThis.window = window;
  try {
    return fn();
  } finally {
    if (hadWindow) globalThis.window = prevWindow;
    else delete globalThis.window;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t?.unref === 'function') t.unref();
  });
}

const SAMPLE_DETAIL = {
  taskId: '11111111-1111-4111-8111-111111111111',
  command: 'export DEVHUB_PROJECT_ID="..." && opencode --agent sdd-orchestrator --prompt "x"',
  selectedAgent: 'sdd-orchestrator',
  launchOrigin: 'planning-launch',
  promptSummary: 'Planificación (initial)',
};

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

test('dispatchPlanningAgentRun: MAX_ATTEMPTS and RETRY_MS are exported as numbers', () => {
  const mod = loadModule();
  assert.equal(typeof mod.MAX_ATTEMPTS, 'number');
  assert.equal(typeof mod.RETRY_MS, 'number');
  assert.ok(mod.MAX_ATTEMPTS > 0, 'MAX_ATTEMPTS must be positive');
  assert.ok(mod.RETRY_MS > 0, 'RETRY_MS must be positive');
  // Wall-clock budget is ~2 s — that's the design's bounded retry window.
  assert.equal(
    mod.MAX_ATTEMPTS * mod.RETRY_MS,
    2000,
    `expected MAX_ATTEMPTS * RETRY_MS ≈ 2000, got ${mod.MAX_ATTEMPTS * mod.RETRY_MS}`
  );
});

// -----------------------------------------------------------------------------
// Case 1 — happy path: first try is accepted
// -----------------------------------------------------------------------------

test('dispatchPlanningAgentRun: returns accepted=true on the first try when the listener acks synchronously', async () => {
  const win = makeWindowStub();
  // Register an ack listener that fires the `accepted` event as soon as the
  // dispatch lands. Mimic the real handler — it sets a flag and dispatches
  // the ack on the same tick.
  win.stub.addEventListener('devhub:run-agent', () => {
    win.stub.dispatchEvent(
      new win.stub.CustomEvent('devhub:run-agent-accepted', {
        detail: { taskId: SAMPLE_DETAIL.taskId },
      })
    );
  });

  const result = await withWindow(win.stub, () =>
    loadModule().dispatchPlanningAgentRun(SAMPLE_DETAIL)
  );

  assert.equal(result.accepted, true);
  assert.equal(result.attempts, 1, 'accepted on the first attempt');
  const runAgentEvents = win.dispatched.filter((e) => e?.type === 'devhub:run-agent');
  assert.equal(runAgentEvents.length, 1, 'must dispatch devhub:run-agent exactly once');
});

// -----------------------------------------------------------------------------
// Case 3 — ack on attempt 5 (fake timers; manual advance)
// -----------------------------------------------------------------------------

test('dispatchPlanningAgentRun: retries until the ack arrives, then stops and cleans up', async () => {
  const win = makeWindowStub();
  let attemptsBeforeAck = Infinity;
  let attemptsObserved = 0;

  win.stub.addEventListener('devhub:run-agent', () => {
    attemptsObserved += 1;
    if (attemptsObserved === attemptsBeforeAck) {
      // Fire the ack only on the 5th attempt.
      win.stub.dispatchEvent(
        new win.stub.CustomEvent('devhub:run-agent-accepted', {
          detail: { taskId: SAMPLE_DETAIL.taskId },
        })
      );
    }
  });

  attemptsBeforeAck = 5;
  const result = await withWindow(win.stub, () =>
    loadModule().dispatchPlanningAgentRun(SAMPLE_DETAIL)
  );

  assert.equal(result.accepted, true);
  assert.equal(result.attempts, 5);
  const runAgentEvents = win.dispatched.filter((e) => e?.type === 'devhub:run-agent');
  assert.equal(runAgentEvents.length, 5, 'must retry exactly up to the ack attempt');
  // The ack listener should be gone (no leak) — count by snapshot of removeEventListener calls
  // is brittle, so we approximate: after the dispatch, the dispatcher should NOT have any
  // active retry timer. We can verify by checking that dispatched events stop at 5 even
  // after the test yields (a leaked timer would fire on a later tick).
  await sleep(50);
  const runAgentEventsAfterYield = win.dispatched.filter((e) => e?.type === 'devhub:run-agent');
  assert.equal(
    runAgentEventsAfterYield.length,
    5,
    'no extra dispatches must fire after the ack cleans up the listener'
  );
});

// -----------------------------------------------------------------------------
// Case 2 — MAX_ATTEMPTS exhausted → accepted=false, console.warn called
// -----------------------------------------------------------------------------

test('dispatchPlanningAgentRun: returns accepted=false after MAX_ATTEMPTS with no ack; console.warn is called with a Spanish message', async () => {
  const win = makeWindowStub();
  // No ack listener — every attempt goes unacked.
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args);
  };

  let result;
  try {
    result = await withWindow(win.stub, () =>
      loadModule().dispatchPlanningAgentRun(SAMPLE_DETAIL)
    );
  } finally {
    console.warn = origWarn;
  }

  assert.equal(result.accepted, false);
  assert.equal(result.attempts, 20, 'must hit the MAX_ATTEMPTS cap exactly');
  const runAgentEvents = win.dispatched.filter((e) => e?.type === 'devhub:run-agent');
  assert.equal(runAgentEvents.length, 20);
  assert.ok(warnings.length >= 1, 'console.warn must be called at least once');
  const message = String(warnings[0][0] ?? '');
  assert.ok(
    /planificaci[oó]n|despach|no.*acusep|reintent/i.test(message),
    `console.warn should carry a Spanish planning/dispatch/retry message, got: ${message.slice(0, 200)}`
  );
});

// -----------------------------------------------------------------------------
// Case 4 — taskId mismatch: ack with a different taskId must NOT stop the loop
// -----------------------------------------------------------------------------

test('dispatchPlanningAgentRun: an ack with a mismatched taskId does NOT stop the retry loop', async () => {
  const win = makeWindowStub();
  let dispatchCount = 0;
  win.stub.addEventListener('devhub:run-agent', () => {
    dispatchCount += 1;
    // Fire an ack every time, but with the WRONG taskId.
    win.stub.dispatchEvent(
      new win.stub.CustomEvent('devhub:run-agent-accepted', {
        detail: { taskId: '22222222-2222-4222-8222-222222222222' },
      })
    );
  });

  const result = await withWindow(win.stub, () =>
    loadModule().dispatchPlanningAgentRun(SAMPLE_DETAIL)
  );

  assert.equal(result.accepted, false, 'mismatched taskId ack must not be accepted');
  assert.equal(result.attempts, 20, 'mismatch must not short-circuit the loop');
  assert.equal(dispatchCount, 20);
});

// -----------------------------------------------------------------------------
// Case 5 — listener cleanup on accepted
// -----------------------------------------------------------------------------

test('dispatchPlanningAgentRun: removes the devhub:run-agent-accepted listener when accepted', async () => {
  const win = makeWindowStub();
  const accepted = win.listeners.get('devhub:run-agent-accepted') || [];
  const initialAcceptedCount = accepted.length;
  assert.equal(initialAcceptedCount, 0, 'precondition: no ack listener registered yet');

  win.stub.addEventListener('devhub:run-agent', () => {
    win.stub.dispatchEvent(
      new win.stub.CustomEvent('devhub:run-agent-accepted', {
        detail: { taskId: SAMPLE_DETAIL.taskId },
      })
    );
  });

  await withWindow(win.stub, () => loadModule().dispatchPlanningAgentRun(SAMPLE_DETAIL));

  // The dispatcher should have added and then removed its own ack listener.
  const after = win.listeners.get('devhub:run-agent-accepted') || [];
  assert.equal(
    after.length,
    0,
    'ack listener must be removed after a successful ack (no leak)'
  );
});

// -----------------------------------------------------------------------------
// Case 6 — taskId undefined is acceptable; a taskId-less ack stops the loop
// -----------------------------------------------------------------------------

test('dispatchPlanningAgentRun: when detail.taskId is undefined, ANY devhub:run-agent-accepted ack stops the loop', async () => {
  const win = makeWindowStub();
  let attemptsObserved = 0;
  win.stub.addEventListener('devhub:run-agent', () => {
    attemptsObserved += 1;
    if (attemptsObserved === 3) {
      // Ack with no taskId — should still stop the loop because the dispatcher
      // is operating in "no-taskId" mode (the spec's case 6).
      win.stub.dispatchEvent(
        new win.stub.CustomEvent('devhub:run-agent-accepted', {
          detail: {},
        })
      );
    }
  });

  const result = await withWindow(win.stub, () =>
    loadModule().dispatchPlanningAgentRun({
      command: SAMPLE_DETAIL.command,
      selectedAgent: SAMPLE_DETAIL.selectedAgent,
      launchOrigin: SAMPLE_DETAIL.launchOrigin,
      promptSummary: SAMPLE_DETAIL.promptSummary,
      // taskId intentionally omitted
    })
  );

  assert.equal(result.accepted, true);
  assert.equal(result.attempts, 3);
});

// -----------------------------------------------------------------------------
// Detail preservation across retries
// -----------------------------------------------------------------------------

test('dispatchPlanningAgentRun: the dispatched detail is identical across retries (no mutation)', async () => {
  const win = makeWindowStub();
  const observedDetails = [];
  win.stub.addEventListener('devhub:run-agent', (event) => {
    observedDetails.push(event.detail);
    if (observedDetails.length === 3) {
      win.stub.dispatchEvent(
        new win.stub.CustomEvent('devhub:run-agent-accepted', {
          detail: { taskId: SAMPLE_DETAIL.taskId },
        })
      );
    }
  });

  await withWindow(win.stub, () => loadModule().dispatchPlanningAgentRun(SAMPLE_DETAIL));

  assert.equal(observedDetails.length, 3);
  for (const d of observedDetails) {
    assert.equal(d.taskId, SAMPLE_DETAIL.taskId);
    assert.equal(d.command, SAMPLE_DETAIL.command);
    assert.equal(d.launchOrigin, SAMPLE_DETAIL.launchOrigin);
    assert.equal(d.selectedAgent, SAMPLE_DETAIL.selectedAgent);
  }
});
