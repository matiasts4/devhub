# Tasks: telegram-agenthub-flow-testing

## Phase 1 — Unblocking (no deps)

- [x] T1: **Fix `jest.config.js`** — add `'<rootDir>/.next/'` to `testPathIgnorePatterns`
  - **Files**: `jest.config.js`
  - **What**: Add the `.next/` path to `testPathIgnorePatterns` so Jest skips the compiled output folder and each suite is collected exactly once.
  - **Accept**: `npx jest --listTests` shows no duplicated suite paths; total unique suites matches expected count (≥23).
  - **Deps**: none

---

## Phase 2 — Harness Patch (depends on T1)

- [x] T2: **Patch `TelegramTestHarness.executeCommand()`** — delete `require.cache` entry before loading command
  - **Files**: `tests/agenthub/telegram/harness.js`
  - **What**: Before every `require(cmdPath)` call inside `executeCommand`, run `delete require.cache[require.resolve(cmdPath)]` so the command re-evaluates fresh and picks up any service mock already placed in the cache by `mockService()`.
  - **Accept**: A test calling `harness.mockService('db', mockDb)` then `harness.executeCommand('estado', ctx)` invokes `mockDb.getDashboard`, not the real SQLite db.
  - **Deps**: T1

---

## Phase 3 — Fix Existing Failing Tests (depends on T2)

- [x] T3: **Fix `tests/agenthub/telegram/basic-commands.test.js`**
  - **Files**: `tests/agenthub/telegram/basic-commands.test.js`
  - **What**: Change `/help` assertion from `toContain('help')` → `toContain('Ayuda')`. Add `harness.mockService('db', { getDashboard: () => ({ projects: [{ name: 'TestProject' }], tasks: [], agents: [] }) })` in the `/estado` test setup.
  - **Accept**: `npx jest basic-commands` passes; `/help` and `/estado` both green.
  - **Deps**: T2

- [x] T4: **Fix `tests/agenthub/telegram/task-commands.test.js`**
  - **Files**: `tests/agenthub/telegram/task-commands.test.js`
  - **What**: Add `harness.mockService('db', { getTasks: () => [], getProject: () => null })` in `beforeEach` so all task-reading commands receive the in-memory mock instead of the real db.
  - **Accept**: `npx jest task-commands` passes with no db I/O.
  - **Deps**: T2

- [x] T5: **Fix `tests/agenthub/telegram/agent-control.test.js`**
  - **Files**: `tests/agenthub/telegram/agent-control.test.js`
  - **What**: Add `harness.mockService('db', { ... })` and any required api mock in `beforeEach`; add `harness.restoreService(...)` in `afterEach` to prevent leak.
  - **Accept**: `npx jest agent-control` passes; no real db or network calls.
  - **Deps**: T2

- [x] T6: **Fix `tests/agenthub/telegram/session-commands.test.js`**
  - **Files**: `tests/agenthub/telegram/session-commands.test.js`
  - **What**: Add `mockService('opencode', { createSession, sendMessage, abortSession })` and `mockService('session-bridge', { getActiveSession, createSession, getOrCreateSession, switchSession })`; restore in `afterEach`; ensure `jest.setTimeout` is high enough to avoid flaky timeout failures.
  - **Accept**: `npx jest session-commands` passes; no child process spawned; all timeouts respected.
  - **Deps**: T2

- [x] T7: **Fix `tests/agenthub/flows/telegram-flow.test.js`**
  - **Files**: `tests/agenthub/flows/telegram-flow.test.js`
  - **What**: Add `harness.mockService('db', { getDashboard: () => ({ projects: [...], tasks: [], agents: [] }) })` in `beforeEach` for the `estado` step; fix any spawn assertion that relies on a real binary being present by replacing it with a mock.
  - **Accept**: `npx jest telegram-flow` passes end-to-end.
  - **Deps**: T2

---

## Phase 4 — New Flow Tests (depends on Phase 3)

- [x] T8: **Create `tests/agenthub/flows/telegram-conversation.test.js`**
  - **Files**: `tests/agenthub/flows/telegram-conversation.test.js` _(new)_
  - **What**: Implement a multi-turn conversation flow using `FlowVerifier` with at least 3 steps (`tareas` → `estado` → `help`); `beforeEach` must `mockService('db', ...)` and `mockService('opencode', ...)`; each step asserts `replyContains` a known string.
  - **Accept**: `npx jest telegram-conversation` passes; ≥2 non-empty bot replies logged; no errors thrown across turns.
  - **Deps**: T3, T4, T5, T6, T7

- [x] T9: **Create `tests/agenthub/flows/telegram-no-hang.test.js`**
  - **Files**: `tests/agenthub/flows/telegram-no-hang.test.js` _(new)_
  - **What**: Add `jest.setTimeout(5000)` + `const MAX_MS = 2000`; three tests (`/estado`, `/tareas`, `/help`) each capture `Date.now()` before/after `executeCommand` and assert `delta < MAX_MS`; all services mocked.
  - **Accept**: `npx jest telegram-no-hang` passes; each test completes in < 2000 ms.
  - **Deps**: T3, T4

---

## Phase 5 — Verify / Fix Existing Flows (depends on Phase 3)

- [x] T10: **Triage `tests/agenthub/flows/headless-lifecycle.test.js`**
  - **Files**: `tests/agenthub/flows/headless-lifecycle.test.js`
  - **What**: Run `npx jest headless-lifecycle`; if the server-guard already returns early gracefully, confirm it passes. If any `it()` block throws an unhandled error, convert it to `test.skip('requires live Next.js server', () => {})`.
  - **Accept**: `npx jest headless-lifecycle` exits 0; no unexpected exceptions.
  - **Deps**: T2

- [x] T11: **Triage `tests/agenthub/flows/mcp-toolchain.test.js`**
  - **Files**: `tests/agenthub/flows/mcp-toolchain.test.js`
  - **What**: Run `npx jest mcp-toolchain`; the file is pure-DB so it should pass as-is. If any test hangs past the suite timeout, add a documented `test.skip` with reason.
  - **Accept**: `npx jest mcp-toolchain` exits 0 within the Jest suite timeout.
  - **Deps**: T2

---

## Phase 6 — Follow-up Hardening Batch (pending warnings)

- [x] T12: **Add contextual plain-text conversation flow test**
  - **Files**: `tests/agenthub/flows/telegram-conversation.test.js`
  - **What**: Add one real multi-turn plain-text conversation that references prior-turn context with mocked `opencode` and seeded task data, aligning REQ-4 more closely than the current command-to-command flow.
  - **Accept**: Scoped Jest proves at least 2 non-empty printable replies across contextual turns with no thrown errors.
  - **Deps**: T8

- [x] T13: **Add plain-text no-hang timing test**
  - **Files**: `tests/agenthub/flows/telegram-no-hang.test.js`
  - **What**: Add one plain-text message timing case under mocked `opencode` so REQ-5 covers chat text, not only command paths.
  - **Accept**: Scoped Jest proves the plain-text path completes in under 2000 ms.
  - **Deps**: T9

- [x] T14: **Strengthen shallow assertions in touched Telegram tests**
  - **Files**: `tests/agenthub/telegram/basic-commands.test.js`, `tests/agenthub/telegram/task-commands.test.js`
  - **What**: Replace weak “reply exists” checks in the touched Telegram suites where feasible (`empty /estado`, `/reset`, `/progreso`, `/agentes`) with user-visible content assertions.
  - **Accept**: Scoped Jest passes with stronger reply-content expectations and no regression in Telegram flow coverage.
  - **Deps**: T3, T4

**Non-blocking suggestion**: After Telegram/flow hardening lands, consider a separate lint-env follow-up for `tests/agenthub/**` Jest/Node globals.

(End of file - total 104 lines)
