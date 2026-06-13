# Exploration: Playwright E2E for Zed chat TDD fixes (T-024..T-027)

> Status: scoping complete. **No installation or configuration performed.**

## Current State

The DevHub repo already has a working Playwright E2E harness:

- `@playwright/test ^1.59.0` is in `devDependencies` of `package.json`.
- `playwright.config.ts` at the project root defines a chromium-only project,
  baseURL `http://localhost:3100`, and a `webServer` block that auto-launches
  `next dev --port 3100` (with `reuseExistingServer: true` when not in CI).
- `package.json` exposes `test:e2e` / `test:e2e:ui` / `test:e2e:report` scripts.
- 10+ E2E specs already live in `tests/e2e/` (e.g. `01_crear_proyecto.spec.ts`,
  `04_swarm_control.spec.ts`, `05_planning_mode.spec.ts`,
  `terminal-session-restore-post-reboot.spec.ts`,
  `swarm-runtime-restore-matrix.spec.ts`).
- A unit test at `tests/unit/playwright-config.test.js` already guards the
  config against regressions.
- Browser binaries are already cached at `~/.cache/ms-playwright` (~1.9 GB,
  chromium-1208/1217/1223 + headless_shell variants).

Established patterns in existing specs:
- `page.route('**/api/...', route => route.fulfill({...}))` for API mocking —
  see `04_swarm_control.spec.ts` (mocks `**/api/db/query?*` and
  `**/api/agenthub/operations/health**`).
- `page.addInitScript(...)` to prime `localStorage` before the page loads —
  see `terminal-session-restore-post-reboot.spec.ts` and
  `swarm-runtime-restore-matrix.spec.ts`.

The actual chat endpoint that Zed uses is `POST /api/assistant/chat`
(`src/app/api/assistant/chat/route.js`), NOT `/api/ai/chat`. The route uses
`MODEL = 'minimax-coding-plan/MiniMax-M3'` and
`BASE_URL = 'https://api.minimax.io/anthropic/v1/messages'`, with the API key
read from `MINIMAX_API_KEY` (fallback `ANTHROPIC_API_KEY`).

Zed is mounted by `src/components/workspace/WorkspaceRightDock.jsx` when
`dockState.activeTab === 'zed'`. The dock state is persisted in `localStorage`
under the key `devhub_right_dock_<projectId>[_wsId]` (see
`src/components/workspace/rightDockState.js`).

The T-024 producer lives at `src/components/asistente/ChatPanel.jsx:158-178`:
a `useEffect` that scans the latest assistant message for a tool result with
`tool === 'open_terminal'`, then dispatches
`new CustomEvent('devhub:zed-open-terminal', { detail: { command, cwd } })`
when `result.session_id` is present.

The T-025 consumer lives at
`src/components/TerminalWorkspacesManager.jsx:3484-3503`: an
`addEventListener('devhub:zed-open-terminal', handleZedOpenTerminal)` that
delegates to the pure guard `isValidZedOpenTerminalEvent` from
`src/components/zedOpenTerminalEvent.js`, then calls `handleSplit(...)`. The
guard is already unit-tested.

## Affected Areas

- `playwright.config.ts` — no changes needed (already supports e2e).
- `tests/e2e/06_zed_chat.spec.ts` (new) — main artifact.
- `src/components/asistente/ChatPanel.jsx` — already implemented; test target
  only.
- `src/components/TerminalWorkspacesManager.jsx` — already implemented; test
  target only. Final `handleSplit` call ultimately touches `node-pty` which is
  a Tauri/native dependency.
- `src/app/api/assistant/chat/route.js` — already implemented; route.mock-able.
- `src/components/workspace/rightDockState.js` — read-only, defines the
  `localStorage` key + sanitization rules for the test to honour.
- `package.json` — no changes needed (scripts + devDep already wired).

## Approaches

1. **Mock `/api/assistant/chat` and assert the producer event (T-024)**
   - Pros: deterministic, fast (~2s/test), no MiniMax cost, no flakiness.
   - Cons: does not exercise the model round-trip itself.
   - Effort: Low. ~20 min including localStorage priming.

2. **Mock the route AND stub the consumer's `handleSplit` to record the call (T-025)**
   - Pros: covers the full producer → consumer wire in browser.
   - Cons: `handleSplit` lives inside `TerminalWorkspacesManager` which has
     4380 lines and many dependencies; importing/instrumenting it in a
     browser E2E requires either (a) mounting the real component in the test
     page (heavyweight) or (b) injecting a `data-zed-open-terminal-listener`
     attribute in dev mode and asserting it from the test.
   - Effort: Medium. ~45 min if we go with the dev-mode attribute approach.

3. **Real MiniMax integration test**
   - Pros: exercises the full model+tool round-trip.
   - Cons: flaky (network, rate limits, model non-determinism), costs money,
     adds latency (~3-10s per call), CI runners must hold a real `MINIMAX_API_KEY`.
   - Effort: High (CI plumbing + non-determinism filtering).

## Recommendation

**Approach 1 + a slimmer version of 2.** Two deterministic E2E tests, both
mocking the chat route, no real model calls.

- **Test 1 (T-024)**: prime `localStorage` with `{activeTab: 'zed', visible: true, ...}`,
  navigate to a workspace page, mock `POST /api/assistant/chat` to return
  `{ text: '', tool_results: [{ tool: 'open_terminal', input: {}, result: { session_id: 's1', command: 'ls', cwd: '/tmp' } }] }`,
  type a message, click send, then assert a `devhub:zed-open-terminal`
  CustomEvent was dispatched on `window` with `detail: { command: 'ls', cwd: '/tmp' }`.
  This is the cleanest E2E proof that the T-024 fix is wired end-to-end.

- **Test 2 (T-025)**: same setup, then verify the consumer caught the event
  by attaching a second `window.addEventListener('devhub:zed-open-terminal', ...)`
  before sending and asserting the payload reached it through the same
  CustomEvent bus the real consumer uses. Asserting the actual split-panel
  DOM (terminal canvas) is not realistic in browser E2E because
  `TerminalWorkspacesManager` ultimately calls `node-pty` which is a Tauri
  native runtime and will be a no-op in `next dev`. If we want to go further,
  we can mount a Tauri-stub by setting `window.__TAURI_INTERNALS__` to a
  minimal mock — but that's T-025 work scope creep.

- **T-026 / T-027** (open_terminal echo + system-prompt rules) are pure
  server-side / unit-testable. They don't need E2E; the existing
  `route.test.js` / `route.no-delegation.test.js` / `route.no-params.test.js`
  under `src/app/api/assistant/chat/__tests__/` already cover the route
  surface. No new E2E work required.

## Risks

- `TerminalWorkspacesManager` is heavyweight and the real consumer
  side-effect (`handleSplit` → `node-pty`) will silently fail in
  `next dev` because Tauri runtime is not present. We rely on the pure guard
  `isValidZedOpenTerminalEvent` (already unit-tested) plus a second listener
  on the same `window` event to assert producer → bus wiring without
  depending on the real consumer's side effects.
- The right-dock localStorage key includes a project id and optional
  workspace id. The test must use the same key the production code reads
  (`devhub_right_dock_<projectId>` or `_global` fallback). Confirm the
  workspace URL the test navigates to before writing the spec.
- Existing specs run with `reuseExistingServer: true` locally — if the dev
  server is already up on :3100 (it is, per `lsof`), the new test reuses it
  and the existing chat route will respond. The `page.route` mock takes
  precedence in the test browser context, so the real route never runs.

## Ready for Proposal

Yes. The work is small and well-scoped:

| Item | Estimate |
|---|---|
| Spec/test file: `tests/e2e/06_zed_chat.spec.ts` | 20-30 min |
| Suite runtime (cold first run, browser already cached) | ~15s |
| Suite runtime (warm) | ~5s |
| Total to first green test | ~25 min |

No new dependencies, no config changes, no CI plumbing changes required.
The Playwright harness already in place supports this work out of the box.
