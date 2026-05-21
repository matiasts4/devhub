# Proposal: telegram-agenthub-flow-testing

## Intent

The Telegram bot and AgentHub test suite has 5 root-cause bugs causing 23 suites to run twice (46 detected), commands to query the wrong DB, and session tests to hang at 5000ms. Until these are fixed, CI is unreliable and new flow tests cannot be trusted. This change fixes all existing failures and adds multi-turn conversation flow tests with bounded-timeout "no-hang" verification.

## Scope

### In Scope

- Fix Jest config `.next/` exclusion (suites deduplicated from 46 → 23)
- Fix `/help` test assertion (wrong expected string)
- Fix db-singleton isolation in command tests (mock via harness)
- Fix session-command tests (mock `opencode` service, prevent 5s timeouts)
- Fix `telegram-flow` spawn failure (db mock in flow harness)
- Add multi-turn conversation flow tests (task → follow-up → response)
- Add bounded-timeout "no-hang" tests (assert response within N ms)
- Verify `headless-lifecycle.test.js` and `mcp-toolchain.test.js` for residual failures

### Out of Scope

- UI/visual changes
- Refactoring commands to accept db as constructor parameter (use harness mocks instead)
- New Telegram commands or features
- Changes to `telegram-bot/services/formatter.js` output format

## Capabilities

### New Capabilities

- `telegram-flow-tests`: Multi-turn conversation flows and bounded-timeout bot-response verification

### Modified Capabilities

- None — fixes are test-layer only; no spec-level behavior changes

## Approach

**Track 1 — Fix existing failures** (unblocking):

1. `jest.config.js`: add `<rootDir>/.next/` to `testPathIgnorePatterns`
2. `basic-commands.test.js`: replace `toContain('help')` → `toContain('Ayuda')` (or `/estado`)
3. `basic-commands.test.js`, `task-commands.test.js`, `agent-control.test.js`: add `harness.mockService('db', { getDashboard: ..., getTasks: ..., ... })` before each test
4. `session-commands.test.js`: add `harness.mockService('opencode', { getSession: ..., switchSession: ... })`
5. `telegram-flow.test.js`: add db mock in flow harness setup

**Track 2 — Multi-turn flow tests** (new coverage):

- Add `tests/agenthub/flows/telegram-conversation.test.js`
- Simulate: user sends task → bot replies → user follows up → bot replies correctly
- Use existing `TelegramTestHarness` + `FlowVerifier` infrastructure

**Track 3 — No-hang timeout tests**:

- Add a suite that sends a command and asserts bot responds within `MAX_RESPONSE_MS = 2000`
- Use `jest.setTimeout` per suite + explicit timing assertion
- Cover at least: `/estado`, `/tareas`, `/spawn`

## Affected Areas

| Area                                                 | Impact   | Description                     |
| ---------------------------------------------------- | -------- | ------------------------------- |
| `jest.config.js`                                     | Modified | Add `.next/` to ignored paths   |
| `tests/agenthub/telegram/basic-commands.test.js`     | Modified | Fix `/help` assertion + db mock |
| `tests/agenthub/telegram/session-commands.test.js`   | Modified | Mock opencode service           |
| `tests/agenthub/telegram/task-commands.test.js`      | Modified | Add db mock                     |
| `tests/agenthub/telegram/agent-control.test.js`      | Modified | Add db mock                     |
| `tests/agenthub/flows/telegram-flow.test.js`         | Modified | Fix spawn + db mock             |
| `tests/agenthub/flows/telegram-conversation.test.js` | New      | Multi-turn flow tests           |
| `tests/agenthub/flows/telegram-no-hang.test.js`      | New      | Bounded-timeout tests           |

## Risks

| Risk                                                  | Likelihood | Mitigation                                                         |
| ----------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| User running bot manually — shared disk DB            | Med        | All tests use in-memory DB + mocked services; never hit disk       |
| Mock setup diverges from real service API             | Med        | Keep mocks minimal (only methods called by the command under test) |
| `harness.mockService` doesn't support all modules     | Low        | Verify harness API before writing tests; patch if needed           |
| Headless-lifecycle / mcp-toolchain have deeper issues | Low        | Triage first; fix or skip with a documented reason if out of scope |

## Rollback Plan

All changes are test-only (`tests/`, `jest.config.js`). No production code is modified. Rollback = `git revert` on the change or delete the new test files. Zero runtime risk.

## Dependencies

- `telegram-bot/test-harness.js` — `mockService` API must exist (verify before Track 1 fixes)
- `tests/agenthub/flows/` — `FlowVerifier` must support timing assertions (verify before Track 3)

## Success Criteria

- [ ] `npx jest` reports exactly 23 suites (not 46)
- [ ] All pre-existing tests pass with 0 failures
- [ ] Multi-turn flow test: 2+ conversation turns verified in `telegram-conversation.test.js`
- [ ] No-hang test: bot responds to `/estado`, `/tareas`, `/spawn` within 2000ms
- [ ] No test requires a live server or disk DB (verified via `--testEnvironment=node` isolation)
