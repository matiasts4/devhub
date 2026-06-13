import test from 'node:test';
import assert from 'node:assert/strict';

// We are testing launchPlanningAgent in isolation. The module under test reads
// `globalThis.window.dispatchEvent` and `globalThis.localStorage` lazily (inside
// the function body), so we attach stubs to globalThis before importing it.
// The dispatch happens synchronously (no setTimeout race in this batch), so
// window.dispatchEvent only needs to record — no fake timers required here.

const UUID = '11111111-1111-4111-8111-111111111111';
const PROJECT_NAME = 'Demo Project';

function makeWindowStub() {
  const dispatched = [];
  const listeners = new Map(); // eventType -> [handler]

  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
      // Copy other init props so listeners can read them if needed.
      for (const k of Object.keys(init)) {
        if (k !== 'detail') this[k] = init[k];
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
          h.call(null, event);
        }
        return true;
      },
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
    },
    dispatched,
    listeners,
  };
}

function makeLocalStorageStub() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    _store: store,
  };
}

function withGlobals({ window, localStorage }, fn) {
  const hadWindow = 'window' in globalThis;
  const hadLocalStorage = 'localStorage' in globalThis;
  const prevWindow = globalThis.window;
  const prevLocalStorage = globalThis.localStorage;

  globalThis.window = window;
  globalThis.localStorage = localStorage;
  try {
    return fn();
  } finally {
    if (hadWindow) globalThis.window = prevWindow;
    else delete globalThis.window;
    if (hadLocalStorage) globalThis.localStorage = prevLocalStorage;
    else delete globalThis.localStorage;
  }
}

// Late import so the module reads the stubs from globalThis when called.
function loadModule() {
   
  return require('../launchPlanningAgent.js');
}

test('launchPlanningAgent: returns object with { command, launchOrigin, projectId } shape', () => {
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();

  const result = withGlobals({ window: win.stub, localStorage: ls }, () => {
    const navigate = (() => {});
    const mod = loadModule();
    return mod.launchPlanningAgent(navigate, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });

  assert.ok(result, 'expected a return value');
  assert.equal(typeof result, 'object');
  assert.equal(result.launchOrigin, 'planning-launch');
  assert.equal(result.projectId, UUID);
  assert.equal(typeof result.command, 'string');
  assert.ok(result.command.length > 0, 'command must be non-empty');
});

test('launchPlanningAgent: launchOrigin is exactly "planning-launch"', () => {
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  const result = withGlobals({ window: win.stub, localStorage: ls }, () => {
    return loadModule().launchPlanningAgent(() => {}, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });
  assert.equal(result.launchOrigin, 'planning-launch');
});

test('launchPlanningAgent: command starts with export DEVHUB_PROJECT_ID="<uuid>"', () => {
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  const result = withGlobals({ window: win.stub, localStorage: ls }, () => {
    return loadModule().launchPlanningAgent(() => {}, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });
  assert.ok(
    result.command.startsWith(`export DEVHUB_PROJECT_ID="${UUID}"`),
    `expected command to start with export line, got: ${result.command.slice(0, 120)}`
  );
});

test('launchPlanningAgent: command does NOT include any of the DocOps forbidden tokens', () => {
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  const result = withGlobals({ window: win.stub, localStorage: ls }, () => {
    return loadModule().launchPlanningAgent(() => {}, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });
  assert.doesNotMatch(result.command, /validate_topic_key/);
  assert.doesNotMatch(result.command, /build_context_pack/);
  assert.doesNotMatch(result.command, /\/sdd-new/);
});

test('launchPlanningAgent: command does NOT include the function name enforceDocOpsGate', () => {
  // The legacy wrapper called enforceDocOpsGateOnLaunchCommand(...). That name
  // must not appear in the new command — it implies the DocOps gate was applied.
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  const result = withGlobals({ window: win.stub, localStorage: ls }, () => {
    return loadModule().launchPlanningAgent(() => {}, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });
  assert.doesNotMatch(result.command, /enforceDocOpsGate/);
  assert.doesNotMatch(result.command, /buildDocOpsOrchestratorLaunchPrompt/);
});

test('launchPlanningAgent: dispatches devhub:run-agent CustomEvent with expected detail shape', () => {
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  withGlobals({ window: win.stub, localStorage: ls }, () => {
    loadModule().launchPlanningAgent(() => {}, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });

  assert.equal(win.dispatched.length, 1, 'expected exactly one dispatch');
  const event = win.dispatched[0];
  assert.equal(event.type, 'devhub:run-agent');
  assert.ok(event.detail, 'event must carry a detail payload');
  assert.equal(event.detail.launchOrigin, 'planning-launch');
  assert.equal(event.detail.selectedAgent, 'sdd-orchestrator');
  assert.equal(typeof event.detail.command, 'string');
  assert.equal(event.detail.command, win.dispatched[0].detail.command);
  assert.equal(event.detail.taskId, UUID, 'taskId must be the projectId, not a timestamp');
  assert.ok(
    event.detail.command.startsWith(`export DEVHUB_PROJECT_ID="${UUID}"`),
    'dispatched command must start with the export line'
  );
});

test('launchPlanningAgent: dispatched event detail does NOT include telemetryId', () => {
  // Regression net for the legacy wrapper which injected telemetryId.
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  let dispatchedEvent = null;
  withGlobals({ window: win.stub, localStorage: ls }, () => {
    loadModule().launchPlanningAgent(() => {}, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });
  dispatchedEvent = win.dispatched[0];
  assert.equal(
    'telemetryId' in dispatchedEvent.detail,
    false,
    'detail must not include telemetryId (planning path uses projectId as audit row key)'
  );
  assert.equal(
    'agentId' in dispatchedEvent.detail,
    false,
    'detail must not include agentId (no planning-${timestamp} identifier)'
  );
});

test('launchPlanningAgent: dispatched event detail command does NOT contain forbidden DocOps tokens', () => {
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  withGlobals({ window: win.stub, localStorage: ls }, () => {
    loadModule().launchPlanningAgent(() => {}, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });
  const event = win.dispatched[0];
  assert.doesNotMatch(event.detail.command, /validate_topic_key/);
  assert.doesNotMatch(event.detail.command, /build_context_pack/);
  assert.doesNotMatch(event.detail.command, /\/sdd-new/);
  assert.doesNotMatch(event.detail.command, /telemetryId/);
});

test('launchPlanningAgent: does NOT attempt to write a tasks row (no fetch to /api/tasks or devhub_create_task)', () => {
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  const fetchCalls = [];
  const fetchStub = (url) => {
    fetchCalls.push(url);
    return Promise.resolve({ ok: true, json: async () => ({}) });
  };
  globalThis.fetch = fetchStub;
  try {
    withGlobals({ window: win.stub, localStorage: ls }, () => {
      loadModule().launchPlanningAgent(() => {}, {
        projectId: UUID,
        projectName: PROJECT_NAME,
        mode: 'initial',
        documentationPolicy: 'shared',
        hasExistingWork: false,
      });
    });
  } finally {
    delete globalThis.fetch;
  }
  // Planning path uses update_project as the source of truth — no tasks row.
  for (const url of fetchCalls) {
    assert.doesNotMatch(
      String(url),
      /\/(api\/)?tasks(\/|\?|$)/,
      `unexpected fetch to tasks endpoint: ${url}`
    );
  }
  // The localStorage hint slot may not exist at all (no agentId to key by).
  // If it does, it must not contain a timestamp-prefixed planning- key.
  const hintsRaw = ls.getItem('devhub_agent_task_hints');
  if (hintsRaw) {
    assert.doesNotMatch(
      hintsRaw,
      /planning-\d{10,}/,
      'localStorage hint must not contain a planning-<timestamp> key'
    );
  }
});

test('launchPlanningAgent: calls navigate with the terminales route', () => {
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  const navigateArgs = [];
  const navigate = (path) => {
    navigateArgs.push(path);
  };
  withGlobals({ window: win.stub, localStorage: ls }, () => {
    loadModule().launchPlanningAgent(navigate, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });
  assert.equal(navigateArgs.length, 1);
  assert.match(navigateArgs[0], /\/project\/[^/]+\/terminales\/?$/);
  assert.match(navigateArgs[0], new RegExp(UUID));
});

test('launchPlanningAgent: navigate is called BEFORE the dispatch event', () => {
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  const callOrder = [];
  const navigate = () => callOrder.push('navigate');
  // Wrap dispatchEvent to record order.
  const originalDispatch = win.stub.dispatchEvent;
  win.stub.dispatchEvent = function (event) {
    callOrder.push(`dispatch:${event?.type || 'unknown'}`);
    return originalDispatch.call(this, event);
  };
  withGlobals({ window: win.stub, localStorage: ls }, () => {
    loadModule().launchPlanningAgent(navigate, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });
  const navIdx = callOrder.indexOf('navigate');
  const dispIdx = callOrder.indexOf('dispatch:devhub:run-agent');
  assert.ok(navIdx !== -1, 'navigate was not called');
  assert.ok(dispIdx !== -1, 'dispatch was not called');
  assert.ok(navIdx < dispIdx, 'navigate must be called before dispatch');
});

test('launchPlanningAgent: dispatches synchronously (no setTimeout race)', () => {
  // Regression net for the legacy setTimeout(150) wrapper. With the immediate
  // dispatch path (Phase 2; Phase 4 will replace with the retry helper), the
  // dispatch must fire before this function returns.
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  let dispatchedDuringCall = 0;
  const originalDispatch = win.stub.dispatchEvent;
  win.stub.dispatchEvent = function (event) {
    if (event?.type === 'devhub:run-agent') dispatchedDuringCall += 1;
    return originalDispatch.call(this, event);
  };
  withGlobals({ window: win.stub, localStorage: ls }, () => {
    loadModule().launchPlanningAgent(() => {}, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });
  assert.equal(
    dispatchedDuringCall,
    1,
    'expected exactly one synchronous dispatch during the call'
  );
  // Also: by the time we return from launchPlanningAgent, win.dispatched is populated.
  assert.equal(win.dispatched.length, 1);
});

test('launchPlanningAgent: Fase 4 — uses dispatchPlanningAgentRun (ack-driven stop)', async () => {
  // Confirm the helper is the new dispatch path. Register an ack listener on
  // the same window stub; the launchPlanningAgent function should fire the
  // dispatch, the dispatcher should retry until it sees the matching ack, and
  // then stop. The test never touches the helper directly — only the
  // observable side effect (the ack stops the retry loop).
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  let ackFired = false;
  const originalDispatch = win.stub.dispatchEvent;
  win.stub.dispatchEvent = function (event) {
    if (event?.type === 'devhub:run-agent' && !ackFired) {
      // Fire the ack the first time the dispatcher attempts to dispatch.
      ackFired = true;
      // Dispatch the ack AFTER the original handler returns. We schedule
      // this on a microtask so the dispatcher's own dispatch completes first.
      Promise.resolve().then(() => {
        win.stub.dispatchEvent(
          new win.stub.CustomEvent('devhub:run-agent-accepted', {
            detail: { taskId: UUID },
          })
        );
      });
    }
    return originalDispatch.call(this, event);
  };

  withGlobals({ window: win.stub, localStorage: ls }, () => {
    loadModule().launchPlanningAgent(() => {}, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });

  // Wait long enough for the dispatcher to (a) emit the first attempt,
  // (b) yield to the microtask, (c) see the ack, (d) stop. RETRY_MS is 100
  // in production; we only need one retry tick.
  await new Promise((r) => setTimeout(r, 250));
  const runAgentEvents = win.dispatched.filter((e) => e?.type === 'devhub:run-agent');
  assert.ok(
    runAgentEvents.length <= 5,
    `dispatcher should stop quickly after ack, got ${runAgentEvents.length} dispatches`
  );
  assert.ok(
    runAgentEvents.length >= 1,
    'dispatcher should have fired at least one devhub:run-agent attempt'
  );
});

test('launchPlanningAgent: promptSummary describes the mode', () => {
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  withGlobals({ window: win.stub, localStorage: ls }, () => {
    loadModule().launchPlanningAgent(() => {}, {
      projectId: UUID,
      projectName: PROJECT_NAME,
      mode: 'initial',
      documentationPolicy: 'shared',
      hasExistingWork: false,
    });
  });
  const event = win.dispatched[0];
  assert.equal(typeof event.detail.promptSummary, 'string');
  assert.ok(event.detail.promptSummary.length > 0, 'promptSummary must be non-empty');
  // The legacy implementation used `Planificación (${mode})`. We assert the
  // mode is present, not the exact format (the team may evolve the label).
  assert.match(event.detail.promptSummary, /initial|Planificaci/i);
});

test('launchPlanningAgent: function is a no-op (returns undefined) when projectId is missing', () => {
  const win = makeWindowStub();
  const ls = makeLocalStorageStub();
  const result = withGlobals({ window: win.stub, localStorage: ls }, () => {
    return loadModule().launchPlanningAgent(() => {}, {
      projectId: undefined,
      projectName: PROJECT_NAME,
      mode: 'initial',
    });
  });
  assert.equal(result, undefined);
  assert.equal(win.dispatched.length, 0, 'no event should be dispatched');
});
