# Design: telegram-agenthub-flow-testing

## Technical Approach

Fix the 5 root-cause bugs in the Telegram/AgentHub test suite by addressing module-level require caching — the single underlying issue that makes db mocks invisible to already-loaded commands. Then layer the two new test files on top of the now-reliable harness.

## Architecture Decisions

### Decision: require-cache clearing strategy for commands

| Option                                                                                                     | Tradeoff                                                                                                                                | Decision |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **A — Fresh require in `executeCommand`**: `delete require.cache[cmdPath]` before every `require(cmdPath)` | Command re-evaluates on every call; picks up any service mock set before the call. Slight overhead (negligible in tests). **✅ CHOSEN** | ✅       |
| B — DI constructor param: pass `db` as argument to command functions                                       | Requires changing command signatures; production code change; out of scope                                                              | ❌       |
| C — Mock at formatter layer: mock `formatter.formatDashboard` instead of `db.getDashboard`                 | Tests the wrong seam; doesn't verify the command actually calls the db service                                                          | ❌       |

**Rationale**: Option A is test-layer-only. It only modifies `TelegramTestHarness.executeCommand()` — no production code changes. The guarantee: `mockService(name, mock)` → `executeCommand(name, ctx)` always sees the mock because the command re-requires the service from an already-replaced cache entry.

### Decision: headless-lifecycle and mcp-toolchain — skip, not fix

| Option                                        | Tradeoff                                                            | Decision |
| --------------------------------------------- | ------------------------------------------------------------------- | -------- |
| Fix (need live server for headless-lifecycle) | Requires running Next.js server in CI; out of scope for this change | ❌       |
| **`test.skip` + documented reason**           | Safe, self-documenting, unblocks suite count                        | ✅       |

`headless-lifecycle.test.js` already has a server-reachability guard (`fetch` + early return). The `mcp-toolchain.test.js` is pure-DB and already self-contained — verify it passes as-is before skipping anything.

### Decision: No FlowVerifier extensions needed

`FlowVerifier._executeTelegramStep()` already calls `harness.executeCommand()` and resets mock history between steps via `harness.resetMockHistory()`. Timing tests (`telegram-no-hang`) use plain Jest + `Date.now()` deltas — no verifier involvement needed.

## Data Flow

```
Test file
  │
  ├─ harness.mockService('db', {...})
  │     └─ writes mock into require.cache[servicePath]
  │
  ├─ harness.executeCommand('estado', ctx)
  │     └─ delete require.cache[cmdPath]   ← KEY FIX
  │     └─ handler = require(cmdPath)       ← fresh load
  │           └─ const db = require('../services/db')  ← hits MOCK in cache
  │     └─ handler(mockBot, ctx.message, args)
  │
  └─ harness.getReplies()  →  assertions
```

For FlowVerifier flows:

```
FlowVerifier.execute(flow)
  └─ _executeTelegramStep(step)
        └─ harness.executeCommand(commandName, ctx, args)
              └─ [same fresh-require path as above]
        └─ harness.getReplies()
        └─ assert step.assert.replyContains
```

## File Changes

| File                                                 | Action | Description                                                                                     |
| ---------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `jest.config.js`                                     | Modify | Add `'<rootDir>/.next/'` to `testPathIgnorePatterns`                                            |
| `tests/agenthub/telegram/harness.js`                 | Modify | `executeCommand`: delete command cache entry before require                                     |
| `tests/agenthub/telegram/basic-commands.test.js`     | Modify | Fix `/help` assertion (`'Ayuda'` not `'help'`); add `mockService('db', ...)` for `/estado` test |
| `tests/agenthub/telegram/task-commands.test.js`      | Modify | Add `mockService('db', { getTasks, getProject })` in `beforeEach`                               |
| `tests/agenthub/telegram/agent-control.test.js`      | Modify | Add `mockService('db', ...)` in `beforeEach`                                                    |
| `tests/agenthub/telegram/session-commands.test.js`   | Modify | Add `mockService('session-bridge', ...)` + `mockService('opencode', ...)`                       |
| `tests/agenthub/flows/telegram-flow.test.js`         | Modify | Add `mockService('db', ...)` in `beforeEach` for `estado` step                                  |
| `tests/agenthub/flows/telegram-conversation.test.js` | Create | Multi-turn conversation flow using `FlowVerifier` + `telegram` action type                      |
| `tests/agenthub/flows/telegram-no-hang.test.js`      | Create | Timing assertions via `Date.now()` delta; `jest.setTimeout(5000)`                               |
| `tests/agenthub/flows/headless-lifecycle.test.js`    | Verify | Already has server-guard; confirm it passes or add `test.skip`                                  |
| `tests/agenthub/flows/mcp-toolchain.test.js`         | Verify | Pure-DB; confirm it passes as-is                                                                |

## Interfaces / Contracts

### Modified: `TelegramTestHarness.executeCommand`

```js
async executeCommand(commandName, ctx, args = '') {
  const cmdPath = path.join(this._commandsDir, `${commandName}.js`);
  // Force fresh require so mocked services are picked up
  delete require.cache[require.resolve(cmdPath)];
  const handler = require(cmdPath);
  return handler(this.mockBot, ctx.message, args);
}
```

### mockService call pattern (db)

```js
harness.mockService('db', {
  getDashboard: () => ({ projects: [], tasks: [], agents: [] }),
  getTasks: () => [],
  getProject: () => null,
});
```

### mockService call pattern (session-bridge + opencode)

```js
harness.mockService('opencode', {
  createSession: () => Promise.resolve({ sessionId: 'ses_mock-1', session: {} }),
  sendMessage: () => Promise.resolve('OK'),
  abortSession: () => Promise.resolve(true),
});
harness.mockService('session-bridge', {
  getActiveSession: () => null,
  createSession: () => Promise.resolve({ id: 'ses_mock-1', title: 'Test', status: 'active' }),
  getOrCreateSession: () =>
    Promise.resolve({ session_id: 'ses_mock-1', project_id: 'test-proj-1' }),
  switchSession: () => Promise.resolve({ id: 'ses_mock-1', title: 'Test' }),
});
```

### New file: `telegram-conversation.test.js` structure

```js
describe('Flow: Telegram Conversation', () => {
  // beforeEach: setup harness, mockService('db', ...), mockService('opencode', ...)
  // test 'multi-turn task flow': FlowVerifier.execute({ steps: [
  //   { action:'telegram', command:'tareas', assert:{ replyContains:'tareas' } },
  //   { action:'telegram', command:'estado', assert:{ replyContains:'Estado' } },
  //   { action:'telegram', command:'help',   assert:{ replyContains:'Ayuda' } },
  // ]})
});
```

### New file: `telegram-no-hang.test.js` structure

```js
jest.setTimeout(5000);
const MAX_MS = 2000;
// test: '/estado responds within MAX_MS': Date.now() before/after executeCommand; expect delta < MAX_MS
// test: '/tareas responds within MAX_MS': same pattern
// test: '/help responds within MAX_MS':   same pattern
```

## Testing Strategy

| Layer               | What to Test                                       | Approach                                                     |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Unit (harness fix)  | `executeCommand` picks up mocked service           | Assert mock fn called, not real service                      |
| Command integration | `/estado`, `/tareas`, `/help`, session subcommands | `mockService` + `executeCommand` + `assertReplyContains`     |
| Flow (multi-turn)   | 3-step conversation with FlowVerifier              | `telegram-conversation.test.js` using `telegram` action type |
| Timing              | Bot responds within 2000ms                         | `telegram-no-hang.test.js` with `Date.now()` delta           |
| Regression          | headless-lifecycle, mcp-toolchain                  | Verify pass as-is; add `test.skip` only if server-required   |

## Migration / Rollout

No migration required. All changes are test-layer (`tests/`, `jest.config.js`). Zero production code modifications.

## Open Questions

- [ ] Confirm `session-commands.test.js` uses `session.js` command (calls `session-bridge`) — needs `restoreService` in `afterEach` to avoid leaking mocks between suites. Verify `teardown()` doesn't already clear require.cache entries.
