# Tasks: zed-chat-assistant-ux-fixes

> Branch: `feature/session-workspace-restore`. Strict TDD. Single PR, 4 chained commits.
> Inputs: `openspec/changes/zed-chat-assistant-ux-fixes/{proposal,exploration,design}.md` + 4 specs.
> Design LOC target: **≤ 800 net** (D2 guard, C2 = single PR).
> Out of scope: `openspec/changes/native-command-executor-assistant/` (CommandBar — orthogonal).

---

## §0 Review Workload Forecast

| Field                        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Estimated changed lines      | **impl ~155 + tests ~345 = ~500 net** (matches design §6 estimate of ~497)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 800-line budget risk (D2)    | **LOW** — design totals ~497, well under 800                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 400-line budget risk (D1)    | **LOW** — every single task is < 130 LOC; largest commit is `ChatPanel.test.jsx` extend at ~60 LOC; per-slice commits are 100-160 LOC                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Chained PRs recommended      | **No** (C2 cached strategy = single PR; design already self-slices into 4 commits inside that single PR)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Decision needed before apply | **No** — LOW risk + single-PR + auto execution (A2) → orchestrator proceeds automatically                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Reasoning                    | Design §6 totals ~497 net LOC, ~155 impl + ~345 tests (4 slices: visibility+re-fire, memory+prompt, open_url+idempotence, e2e+namespace-scan). 800-line guard passes; no per-task exceeds 130 LOC. Pure helpers (`zedOpenTerminalFocus.js`, `zedOpenUrlEvent.js`) are isolated and SSR-safe. The re-fire guard is `useRef` of a `Set<session_id>` — a 5-line change in `ChatPanel.jsx`. Memory fix is 1 line. The E2E suite in slice 4 uses stubbed CustomEvent dispatchers (no Tauri runtime, matches existing `06_zed_open_terminal.spec.ts` pattern). Risk flagged: the new `devhub:zed-open-url` event may be conflated with the existing `devhub:zed-open-terminal` namespace — mitigated by the namespace-scan CI test in 5.3. |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
800-line budget risk: Low
400-line budget risk: Low

### Per-Slice LOC Breakdown

| Slice                                   | Files                                                                                                                                                                                                                                                           | Impl LOC | Test LOC |      Net |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | -------: | -------: |
| **§1 Foundation (helpers)**             | NEW `src/components/asistente/zedOpenTerminalFocus.js`; NEW `src/components/zedOpenUrlEvent.js`; extend `src/components/zedOpenTerminalEvent.js` (add `dispatchZedOpenTerminal`); NEW test files for both helpers + extension of `zedOpenTerminalEvent.test.js` |      ~98 |     ~110 | **+208** |
| **§2 Slice 1 — Visibility + re-fire**   | `src/components/TerminalWorkspacesManager.jsx` (listener wires `applyZedOpenTerminalFocus`); `src/components/asistente/ChatPanel.jsx` (`useRef` guard + `dispatchZedOpenTerminal`); extend `ChatPanel.test.jsx`                                                 |      ~17 |      ~30 |  **+47** |
| **§3 Slice 2 — Memory + system prompt** | `src/components/asistente/ChatPanel.jsx` (drop `.slice(0, -1)`); `docs/prompts/asistente/zed-system-prompt.md` (append "Prior-turn context"); extend `buildZedHistory.test.js` + `zedSystemPrompt.test.js` + `ChatPanel.test.jsx`                               |       ~7 |      ~50 |  **+57** |
| **§4 Slice 3 — `open_url` parity**      | `src/lib/asistente/tools/browser.js` (dispatch + xdg-open fallback); NEW `src/components/workspace/WorkspaceBrowserPane.jsx` `useEffect`; extend `browser.test.js`; NEW `WorkspaceBrowserPane.openUrl.test.jsx`                                                 |      ~33 |      ~70 | **+103** |
| **§5 Slice 4 — E2E + namespace scan**   | extend `tests/e2e/06_zed_open_terminal.spec.ts`; NEW `tests/e2e/07_zed_open_url.spec.ts`; NEW `tests/spec/zed-event-bus-namespace.test.mjs`                                                                                                                     |       ~0 |     ~110 | **+110** |
| **§6 Cross-cutting**                    | lint config touch-up (if needed); docs pointer; manual smoke checklist; archive prep                                                                                                                                                                            |       ~0 |       ~0 |   **~0** |
| **Total**                               |                                                                                                                                                                                                                                                                 | **~155** | **~370** | **~525** |

> **Note on §1 Foundation vs design §6 estimate.** Design §6 attributes the helper files to slice 1/3 respectively. This tasks file regroups all pure-helper work into §1 Foundation because the helpers have no UI dependencies and can be implemented + unit-tested first, in parallel with each other, before any component wiring. This is a deviation from the design's per-slice breakdown but not from its LOC totals.

> **Note on total.** The design estimates ~497; this file estimates ~525. Difference is in E2E tests (the new `07_zed_open_url.spec.ts` may need 10-20 extra LOC for the localStorage seeding) and the namespace-scan test (the regex + allow-list may need 10-15 extra LOC). Both are well under 800.

### Work Units → Commits (single PR, squash at merge)

| Commit                                                           | Tasks     |  LOC | Note                                           |
| ---------------------------------------------------------------- | --------- | ---: | ---------------------------------------------- |
| `feat(zeb): foundation — pure helpers + dispatch shim`           | 1.1 – 1.7 | +208 | helpers are pure, no React, no DOM; ship first |
| `feat(zeb): visibility + re-fire guard (slice 1)`                | 2.1 – 2.3 |  +47 | consumer wiring + re-fire guard                |
| `feat(zeb): memory + system-prompt prior-turn clause (slice 2)`  | 3.1 – 3.5 |  +57 | smallest commit, 1-line fix                    |
| `feat(zeb): open_url parity + idempotent listener (slice 3)`     | 4.1 – 4.4 | +103 | browser tool + listener + idempotence          |
| `test(zeb): e2e visibility + re-fire + namespace scan (slice 4)` | 5.1 – 5.3 | +110 | E2E coverage + ZEB-005 enforcement             |

---

## §1 Foundation — Pure Helpers (do first)

Sequential by file: tests RED before impl. The three helper modules in this phase have NO React, NO DOM, NO `window` access at import time (SSR-safe). All test files use `node:test` style (matches existing `zedOpenTerminalEvent.test.js`).

### 1.1 [TEST FIRST] `applyZedOpenTerminalFocus` focus-chain cases

- **File**: `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js` (new)
- **Dependencies**: none
- **Spec ref**: ASST-UI-002 (Listener Focus Chain), ASST-UI-003 (Pizarra De-Max is Opt-In)
- **Description**: Pure-function tests for the new `applyZedOpenTerminalFocus(targetWsId, newPanelId, detail, deps)` helper. Four cases: (a) `focus: true` + `maximizedView: 'pizarra'` → `activated:true, focused:true, demaximized:true`; (b) `focus: true` + `maximizedView: 'browser'` → `activated:true, focused:true, demaximized:false`; (c) `focus: undefined` → `activated:true, focused:false, demaximized:false` (no focused clear, no de-max); (d) empty `targetWsId` → returns `{ activated: false, … }` and does NOT call any dep.
- **Acceptance**: all 4 cases fail (the helper file does not exist); each asserts the relevant dep callable was invoked with the expected args using stub `vi.fn()`.
- **Estimated LOC**: ~50 (test only)

### 1.2 `applyZedOpenTerminalFocus` helper

- **File**: `src/components/asistente/zedOpenTerminalFocus.js` (new)
- **Dependencies**: 1.1
- **Spec ref**: ASST-UI-002, ASST-UI-003, ASST-UI-004
- **Description**: Pure function — no React imports, no `window` access. Signature `(targetWsId, newPanelId, detail, { activateWorkspacePanel, setFocusedPanelByWorkspace, updateRightDockState, maximizedView }) → { activated, focused, demaximized }`. When `targetWsId && newPanelId`: always call `activateWorkspacePanel`. When `detail.focus === true`: call `setFocusedPanelByWorkspace` (functional update) AND, only if `maximizedView === 'pizarra'`, call `updateRightDockState` (functional update) with `{ maximized:false, maximizedView:'browser' }`. Otherwise return the all-false shape.
- **Acceptance**: tests from 1.1 all pass; helper has zero side effects on import; JSDoc block quotes the design §3.1 contract.
- **Estimated LOC**: ~35 (Sequential: do after test)

### 1.3 [TEST FIRST] `zedOpenUrlEvent` validators

- **File**: `src/components/__tests__/zedOpenUrlEvent.test.js` (new)
- **Dependencies**: 1.1 (same jest setup; pure module; OK to run in parallel with 1.1)
- **Spec ref**: ZEB-003 (`devhub:zed-open-url` Payload), ZEB-004 (Helper Module Exports)
- **Description**: Validators only. Cases: `isValidZedOpenUrlEvent({ url: 'https://x' }) → true`; `{ url: 'javascript:alert(1)' } → false` (rejected by `isSafeHttpUrl`); `null → false`; `resolveZedOpenUrlBrowserShape({ label: 'repo' }) → 'repo'`; `resolveZedOpenUrlBrowserShape({}) → null`.
- **Acceptance**: 5 cases fail (the file does not exist).
- **Estimated LOC**: ~25 (test only) (Parallel: with 1.1)

### 1.4 `zedOpenUrlEvent` helper module

- **File**: `src/components/zedOpenUrlEvent.js` (new)
- **Dependencies**: 1.3
- **Spec ref**: ZEB-003, ZEB-004, ZEB-005, ZEB-006 (SSR Safety)
- **Description**: Mirrors `zedOpenTerminalEvent.js` pattern. Three exports: `isValidZedOpenUrlEvent(detail)` (validates via `isSafeHttpUrl` from `@/lib/asistente/tools/urlSafety`); `resolveZedOpenUrlBrowserShape(detail)` (returns `detail.label` if non-empty string, else `null`); `dispatchZedOpenUrl(detail)` (SSR-safe — `typeof window === 'undefined'` returns silently; else dispatches `new CustomEvent('devhub:zed-open-url', { detail: { url, label, focus } })` with the `focus` coerced to `Boolean(detail.focus === true)`). JSDoc quotes design §3.3 contract.
- **Acceptance**: tests from 1.3 all pass; dispatch is a no-op in Node.js context.
- **Estimated LOC**: ~55 (Sequential: do after test)

### 1.5 [TEST FIRST] `dispatchZedOpenUrl` SSR-safety + invalid-URL drop

- **File**: `src/components/__tests__/zedOpenUrlEvent.test.js` (extend)
- **Dependencies**: 1.4
- **Spec ref**: ZEB-005 (All Dispatch Goes Through Helpers), ZEB-006 (SSR Safety)
- **Description**: Extend the file from 1.3. Three more cases: (a) `dispatchZedOpenUrl({ url: 'x' })` with `window === undefined` → does NOT throw; (b) `dispatchZedOpenUrl({ url: 'https://x' })` with a stub `window.dispatchEvent` → exactly one `CustomEvent` of type `devhub:zed-open-url` with `detail.url === 'https://x'`; (c) `dispatchZedOpenUrl({ url: 'javascript:alert(1)' })` → `window.dispatchEvent` is NOT called (invalid URL silently dropped per design §3.3 last paragraph).
- **Acceptance**: 3 new cases pass after 1.4; old 5 cases still pass.
- **Estimated LOC**: ~20 (test only) (Sequential: do after 1.4)

### 1.6 `dispatchZedOpenTerminal` shim

- **File**: `src/components/zedOpenTerminalEvent.js` (extend)
- **Dependencies**: none
- **Spec ref**: ZEB-004 (Helper Module Exports), ZEB-005 (All Dispatch Goes Through Helpers)
- **Description**: Add a new export `dispatchZedOpenTerminal(detail)` — SSR-safe wrapper that does `typeof window === 'undefined' ? no-op : window.dispatchEvent(new CustomEvent('devhub:zed-open-terminal', { detail: detail ?? {} }))`. The existing `isValidZedOpenTerminalEvent` + `resolveZedOpenTerminalPanelId` exports are unchanged. Update the JSDoc header to mention the new export. This is the ONLY place in the project (outside `zedOpenUrlEvent.js`) that constructs a `devhub:zed-*` CustomEvent (ZEB-005).
- **Acceptance**: existing tests in `zedOpenTerminalEvent.test.js` still pass; the new export is a pure function.
- **Estimated LOC**: ~8 (impl only) (Parallel: with 1.1 + 1.3)

### 1.7 [TEST FIRST] `dispatchZedOpenTerminal` SSR + happy path

- **File**: `src/components/__tests__/zedOpenTerminalEvent.test.js` (extend)
- **Dependencies**: 1.6
- **Spec ref**: ZEB-005, ZEB-006
- **Description**: Two cases appended to the existing file. (a) `dispatchZedOpenTerminal({ session_id: 'term-X' })` with `window === undefined` → no throw, no error; (b) `dispatchZedOpenTerminal({ session_id: 'term-X', command: 'ls', cwd: '/tmp' })` with a stub `window.dispatchEvent` → exactly one `CustomEvent` of type `devhub:zed-open-terminal` with `detail.session_id === 'term-X'`, `detail.command === 'ls'`, `detail.cwd === '/tmp'`.
- **Acceptance**: 2 new cases pass after 1.6; the 3 pre-existing cases (validator + resolver) still pass.
- **Estimated LOC**: ~15 (test only) (Sequential: do after 1.6)

---

## §2 Slice 1 — Visibility (TWM listener + ChatPanel re-fire guard)

Wires the pure helpers from §1 into the existing components. Sequential: each task is RED → GREEN.

### 2.1 [TEST FIRST] ChatPanel re-fire guard across 2 messages

- **File**: `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend)
- **Dependencies**: 1.6 (need the `dispatchZedOpenTerminal` shim; otherwise the test still passes structurally because we spy on `window.dispatchEvent`)
- **Spec ref**: ASST-UI-001 (Re-Fire Guard for `devhub:zed-open-terminal`)
- **Description**: Append a test that mocks `window.dispatchEvent` via `vi.spyOn(window, 'dispatchEvent')`. Sends 1st message, mocks `fetch` to return a JSON with `tool_results: [{ tool: 'open_terminal', result: { session_id: 'term-1' } }]`. Sends 2nd message (any content; can be a free-form "ahora corré ls"). Asserts `dispatchEvent` was called with a `CustomEvent` whose `type === 'devhub:zed-open-terminal'` exactly ONCE (not twice) — once for `'term-1'`. A 2nd new-session result would dispatch a SECOND time; this test specifically asserts the re-fire does NOT happen for the same `session_id`. Uses the existing `createRoot` + `flushSync` pattern in this repo (see `tests/unit/operational-feedback-components.test.jsx`).
- **Acceptance**: test fails (current code re-fires on every `messages` change; count would be 2).
- **Estimated LOC**: ~30 (test only) (Sequential: do after 1.6; can run in parallel with 2.3 if 1.1 + 1.2 are merged)

### 2.2 ChatPanel re-fire guard impl

- **File**: `src/components/asistente/ChatPanel.jsx` (modify, ~+5 lines near the dispatch `useEffect` at line 167)
- **Dependencies**: 2.1
- **Spec ref**: ASST-UI-001, ASST-UI-002 (Listener Focus Chain — wire `dispatchZedOpenTerminal` so the focus field is plumbed)
- **Description**: (a) Add `const dispatchedSessionIdsRef = useRef(new Set())` next to the other refs in `ChatPanel`. (b) In the dispatch `useEffect`, after `parsed?.session_id` is confirmed, check `if (dispatchedSessionIdsRef.current.has(parsed.session_id)) return;` and then `dispatchedSessionIdsRef.current.add(parsed.session_id)`. (c) Replace the inline `window.dispatchEvent(new CustomEvent('devhub:zed-open-terminal', { detail: { command, cwd, session_id } }))` with `dispatchZedOpenTerminal({ command, cwd, session_id, focus: parsed.focus === true })` (imported from `@/components/zedOpenTerminalEvent`). (d) Add `focus` to the `safeParse` of the tool result so the new field is preserved.
- **Acceptance**: tests from 2.1 pass; existing `ChatPanel.test.jsx` tests still green; lint clean.
- **Estimated LOC**: ~5 (Sequential: do after 2.1)

### 2.3 TWM `handleZedOpenTerminal` wires the focus chain

- **File**: `src/components/TerminalWorkspacesManager.jsx` (modify, ~+12 lines in `handleZedOpenTerminal` at line 3715)
- **Dependencies**: 1.2 (need `applyZedOpenTerminalFocus`); 2.2 not strictly required (this is a separate change site)
- **Spec ref**: ASST-UI-002, ASST-UI-003, ASST-UI-004
- **Description**: After `handleSplit('horizontal', targetPanelId, command, cwd || null, explicitPanelId)` returns, capture `const newPanelId = handleSplit(...);` and if truthy, call `applyZedOpenTerminalFocus(targetWsId, newPanelId, { focus: e.detail.focus === true }, { activateWorkspacePanel, setFocusedPanelByWorkspace, updateRightDockState, maximizedView: rightDockState?.maximizedView ?? null })`. Read `e.detail.focus` (not `e.detail.session_id`); the helper handles the rest. Add the import: `import { applyZedOpenTerminalFocus } from './asistente/zedOpenTerminalFocus'`.
- **Acceptance**: existing TWM tests still pass (`TerminalWorkspacesManager.*.test.jsx` — 13 files); the new branch is exercised by the E2E in 5.1. No new TWM component test (per design §5: TWM is 4 600 lines; pure helper is unit-tested in 1.1, wiring is E2E-tested in 5.1).
- **Estimated LOC**: ~12 (impl only) (Parallel: with 2.2 — different file)

---

## §3 Slice 2 — Memory (closure fix + system prompt nudge)

Smallest slice. Tests first, then 1-line fix + 1-section prompt addition.

### 3.1 [TEST FIRST] `buildZedHistory` 2-turn integration scenario

- **File**: `src/components/asistente/__tests__/buildZedHistory.test.js` (extend)
- **Dependencies**: none
- **Spec ref**: ASST-CHAT-001 (Full `messages` State Sent as History), ASST-CHAT-002 (Stable Snapshot)
- **Description**: Append a new test that calls `buildZedHistory(messages)` where `messages = [welcome, { role:'user', content:'abre una terminal' }, { role:'assistant', content:'listo', tool_results:[{ tool:'open_terminal', result:{ session_id:'term-X' } }] }]`. Asserts the output contains: (a) the assistant turn `{ role:'assistant', content:'listo' }`; (b) the tool_results-derived line `Tool open_terminal result: {…session_id:"term-X"…}` (substring match, allow formatting variance); (c) the previous user turn `{ role:'user', content:'abre una terminal' }`. The test does NOT assert anything about the new user message (it's not in the input array).
- **Acceptance**: test passes today (the helper is correct; only the call site is broken). The test is RED only insofar as the integration in `ChatPanel.handleSend` does not yet use this input shape — that gap is closed by 3.2.
- **Estimated LOC**: ~15 (test only)

### 3.2 ChatPanel.handleSend drop `.slice(0, -1)`

- **File**: `src/components/asistente/ChatPanel.jsx` (modify, line ~78-82, 1 line removed + comment)
- **Dependencies**: 3.1
- **Spec ref**: ASST-CHAT-001, ASST-CHAT-002
- **Description**: Change `const history = buildZedHistory(messages.slice(0, -1));` to `const history = buildZedHistory(messages);`. Replace the comment block above it with the design §3.2 closure-fix explanation. No other change to `handleSend`. The closure `messages` is the previous render's state (does NOT include the new user message just queued via `setMessages`); the new user message is sent as the `message` field, not inside `history`. The server's `safeHistory` filter (route.js:136-146) caps to 20 and the harmless duplicate of the previous-turn user message is OK.
- **Acceptance**: existing `ChatPanel.test.jsx` tests still pass; the 2-turn memory body test (3.5) passes; no 400/500 errors.
- **Estimated LOC**: ~1 (Sequential: do after 3.1)

### 3.3 [TEST FIRST] System-prompt prior-turn clause

- **File**: `src/lib/asistente/__tests__/zedSystemPrompt.test.js` (extend)
- **Dependencies**: none
- **Spec ref**: ASST-CHAT-003 (System-Prompt Clause on Prior-Turn Context)
- **Description**: Append a new test that reads the prompt file (existing helper `loadSystemPrompt` is in scope) and asserts two substrings: (a) `"treat them as user-visible context"`; (b) `"use the history to resolve the reference"`. Both must be present in the same "Prior-turn context" section.
- **Acceptance**: test fails today (no such section in the prompt).
- **Estimated LOC**: ~5 (test only) (Parallel: with 3.1)

### 3.4 zed-system-prompt.md append "Prior-turn context" section

- **File**: `docs/prompts/asistente/zed-system-prompt.md` (modify, append after line 65)
- **Dependencies**: 3.3
- **Spec ref**: ASST-CHAT-003
- **Description**: Append the new "### Prior-turn context (T-WSR-zed-002)" section per design §3.4. The section MUST contain the substrings `"treat them as user-visible context"` and `"use the history to resolve the reference"`, and the imperative clause "do NOT call `open_terminal` again when a session already exists" (so the model can find the section by name).
- **Acceptance**: tests from 3.3 pass; existing `zedSystemPrompt.test.js` tests still pass.
- **Estimated LOC**: ~6 (Sequential: do after 3.3)

### 3.5 [TEST FIRST] ChatPanel 2-turn memory body

- **File**: `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend)
- **Dependencies**: 3.2
- **Spec ref**: ASST-CHAT-001
- **Description**: Stub `fetch` with a `vi.fn()` that captures all body payloads. Send 1st message "abre una terminal"; mock the 1st `fetch` response with `tool_results: [{ tool: 'open_terminal', result: { session_id: 'term-X' } }]`. Wait for the assistant turn to land in `messages`. Send 2nd message "ahora corré ls". Capture the 2nd `fetch` body. Assert the JSON body string contains (a) the substring `Tool open_terminal result: {"session_id":"term-X"` (allow whitespace), (b) `message === "ahora corré ls"`, (c) the new user message string does NOT appear inside `history` (only as `message`).
- **Acceptance**: test fails before 3.2 (the slice excludes the assistant turn so the substring is missing); passes after 3.2.
- **Estimated LOC**: ~30 (test only) (Sequential: do after 3.2)

---

## §4 Slice 3 — `open_url` parity (browser tool + helper + listener)

### 4.1 [TEST FIRST] `browserTool.execute` dispatches `devhub:zed-open-url`

- **File**: `src/lib/asistente/__tests__/tools/browser.test.js` (extend)
- **Dependencies**: 1.4 (need `dispatchZedOpenUrl` exported)
- **Spec ref**: ZEB-003, ZEB-004 (Scenario: `browserTool.execute` dispatches via the helper)
- **Description**: Append a test that imports `dispatchZedOpenUrl` and `vi.spyOn(window, 'dispatchEvent')`. Calls `browserTool.execute({ url: 'https://github.com/foo/bar', label: 'repo' })`. Asserts the result shape `{ url: 'https://github.com/foo/bar', opened: true, message: ... }` is unchanged AND `window.dispatchEvent` was called with a `CustomEvent` whose `type === 'devhub:zed-open-url'` and `detail.url === 'https://github.com/foo/bar'`. The existing xdg-open call may fail in test env; the test asserts only on the new event dispatch.
- **Acceptance**: test fails (current code does NOT dispatch the event).
- **Estimated LOC**: ~10 (test only)

### 4.2 `browserTool.execute` dispatches `devhub:zed-open-url`

- **File**: `src/lib/asistente/tools/browser.js` (modify, +3 lines: import + dispatch call)
- **Dependencies**: 4.1
- **Spec ref**: ZEB-003, ZEB-004, ZEB-005
- **Description**: Add `import { dispatchZedOpenUrl } from '@/components/zedOpenUrlEvent';` at the top. In `execute`, after `zedLog.info('TOOL', 'open_url', { url, label, focus })`, call `dispatchZedOpenUrl({ url: safety.url, label: label ?? null, focus: focus === true });` BEFORE the `execSync('xdg-open …')` fallback. The fallback is preserved (existing behavior). Accept a new `focus` param (default `false`). The tool's `description` is updated to mention the in-app navigation.
- **Acceptance**: tests from 4.1 pass; existing `browser.test.js` cases still pass; the `xdg-open` fallback still runs.
- **Estimated LOC**: ~3 (Sequential: do after 4.1)

### 4.3 [TEST FIRST] `WorkspaceBrowserPane` listener + idempotence + pizarra opt-in

- **File**: `src/components/workspace/__tests__/WorkspaceBrowserPane.openUrl.test.jsx` (new)
- **Dependencies**: 1.4
- **Spec ref**: BBP-001 (Listener for `devhub:zed-open-url`), BBP-002 (Idempotence on `(url, label)`), BBP-003 (Spawn vs Update — reconciled to single-pane update in design §3.3), BBP-004 (Pizarra De-Max is Opt-In)
- **Description**: Component test (JSDOM + `createRoot` + `flushSync`). Cases: (a) `addEventListener('devhub:zed-open-url', …)` is called on mount, `removeEventListener` on unmount. (b) Dispatch `{ url: 'https://github.com', label: 'repo' }` → `onDockStateChange` called once with updater that sets `browserUrl:'https://github.com'`. (c) Dispatch the SAME event again → `onDockStateChange` NOT called again (idempotence on `(url, label)`). (d) Dispatch `{ url: 'https://gitlab.com', label: 'repo' }` (same label, new URL) → `onDockStateChange` called with `browserUrl:'https://gitlab.com'` (no re-spawn, just URL update). (e) Render with `dockState.maximizedView='pizarra'`, dispatch event WITHOUT `focus` → no `maximized:false` call. (f) Same render, dispatch WITH `focus:true` → `onDockStateChange` called with `maximized:false, maximizedView:'browser'`.
- **Acceptance**: 6 cases fail (the listener does not exist).
- **Estimated LOC**: ~60 (test only) (Parallel: with 4.1)

### 4.4 `WorkspaceBrowserPane` `useEffect` listener

- **File**: `src/components/workspace/WorkspaceBrowserPane.jsx` (modify, insert new `useEffect` between the existing fallback-clearing effect at line 263-270 and `handleRuntimeReload` at line 274)
- **Dependencies**: 4.3
- **Spec ref**: BBP-001, BBP-002, BBP-003 (reconciled — single in-app pane, no multi-shape), BBP-004
- **Description**: Add `const lastAppliedUrlRef = useRef({ url: null, label: null });` and a new `useEffect` that subscribes to `devhub:zed-open-url`. Handler: validate via `isValidZedOpenUrlEvent(e.detail)`, read `(url, label, focus)`, bail if `(url, label)` matches `lastAppliedUrlRef.current` (idempotence), else call `onDockStateChange((currentState) => ({ ...currentState, browserUrl: url, browserHistory: [...(currentState.browserHistory ?? []), url], browserHistoryIndex: currentState.browserHistory?.length ?? 0 }))`, update the ref, and (if `focus === true && rightDockState?.maximizedView === 'pizarra'`) call `onDockStateChange` again with `{ maximized:false, maximizedView:'browser', activeTab:'browser' }`. Cleanup returns `removeEventListener`. Dependency array: `[onDockStateChange, rightDockState?.maximizedView]`.
- **Acceptance**: 6 cases from 4.3 pass; existing `WorkspaceBrowserPane`-related tests (`WorkspaceBridgePane.test.jsx`, `BrowserTabStrip.test.jsx`) still green; no new TWM mount dependencies.
- **Estimated LOC**: ~30 (Sequential: do after 4.3)

---

## §5 Slice 4 — E2E with stubs (no Tauri runtime)

E2E tests use Playwright + `page.route()` to stub `/api/assistant/chat` and `localStorage` to seed right-dock state. No Tauri runtime. CustomEvent dispatchers are stubbed via `addInitScript`. Existing `06_zed_open_terminal.spec.ts` is the pattern reference.

### 5.1 [TEST FIRST] `06_zed_open_terminal.spec.ts` visibility + re-fire assertions

- **File**: `tests/e2e/06_zed_open_terminal.spec.ts` (extend)
- **Dependencies**: §2 (Slice 1 must be merged to give the listener + guard something to assert)
- **Spec ref**: ASST-UI-001 (re-fire guard), ASST-UI-002 (visibility)
- **Description**: Two new test cases appended. (a) Seed `localStorage.devhub_terminal_state:*` with `activePanelIds:{ws9:'p1'}`; mock `/api/assistant/chat` to return `tool_results: [open_terminal{session_id:'term-test-123'}]`; send a chat turn; after settle, assert the localStorage has been mutated and `activePanelIds[ws9]` is a NEW id (not `'p1'`). (b) Stub `window.__lastZedOpenTerminalEvent` via `addInitScript`; send 1st message, send 2nd message; assert the spy fired exactly ONCE.
- **Acceptance**: both cases fail before §2 lands; pass after.
- **Estimated LOC**: ~30 (test only)

### 5.2 [TEST FIRST] `07_zed_open_url.spec.ts` E2E

- **File**: `tests/e2e/07_zed_open_url.spec.ts` (new)
- **Dependencies**: §4 (Slice 3 must be merged)
- **Spec ref**: BBP-001, BBP-002, BBP-004
- **Description**: Mirrors the structure of `06_zed_open_terminal.spec.ts`. `addInitScript` records dispatched `devhub:zed-open-url` events on `window.__lastZedOpenUrlEvent`. Mock `/api/assistant/chat` to return `tool_results: [open_url{url:'https://github.com', label:'repo'}]`. Send a chat turn. Assert the spy fired once with the right detail. Send a 2nd message with the SAME URL → assert the spy fired ONLY ONCE (idempotence in real browser). Then test pizarra opt-in: seed right-dock state with `maximizedView:'pizarra'`, dispatch via a chat turn with `focus:true`, assert the right-dock state no longer has `maximized:true`.
- **Acceptance**: 3 cases fail before §4; pass after.
- **Estimated LOC**: ~50 (test only) (Parallel: with 5.1)

### 5.3 [TEST FIRST] ZEB-005 namespace scan

- **File**: `tests/spec/zed-event-bus-namespace.test.mjs` (new)
- **Dependencies**: §1 + §2 + §3 + §4 (all `devhub:zed-*` dispatch sites must be in the helpers)
- **Spec ref**: ZEB-005 (No inline dispatch outside helpers), ZEB-001 (namespace)
- **Description**: `node:test` script that globs `src/components/`, `src/lib/`, `src/app/` for the regex `/window\.dispatchEvent\(\s*new\s+CustomEvent\(\s*['"]devhub:zed-/`. Asserts the only matches are inside `src/components/zedOpenTerminalEvent.js` or `src/components/zedOpenUrlEvent.js`. Failed matches are reported with file:line for review. The script reads from `node:fs` + `node:path`; no extra deps. Run via `pnpm test` (the `npm test` pipeline).
- **Acceptance**: script fails today (the existing inline dispatch in `ChatPanel.jsx:181-189` is a match); passes after §2.2 (the inline dispatch is replaced with `dispatchZedOpenTerminal`).
- **Estimated LOC**: ~30 (test only) (Sequential: do after all upstream changes)

---

## §6 Cross-cutting (lint, e2e harness, final review)

Small, non-TDD cleanup tasks. Done in order.

### 6.1 ESLint config touch-up (if needed)

- **File**: `eslint.config.mjs` (modify, if needed)
- **Dependencies**: none
- **Spec ref**: ZEB-005 (enforcement layer)
- **Description**: Per design §7 risk #3, ESLint `no-restricted-syntax` is REJECTED as too heavy for one rule. The chosen enforcement is the CI scan in 5.3. Therefore this task is a NO-OP unless a future ESLint config extension is desired. Verify by running `pnpm lint` — no new rule added.
- **Acceptance**: `pnpm lint` clean. If a rule IS added, it MUST be a one-liner in the existing flat config and MUST only match `devhub:zed-*` (not the entire `new CustomEvent` family).
- **Estimated LOC**: ~0 (verifier, no change)

### 6.2 Doc update — spec pointer

- **File**: `openspec/changes/zed-chat-assistant-ux-fixes/ROLLOUT.md` (new, small)
- **Dependencies**: §2 + §3 + §4
- **Spec ref**: ZEB-005 archive baseline gap
- **Description**: One-paragraph note for the archive phase: "the `asistente-ui` and `asistente-chat` capabilities have no `openspec/specs/` baseline; the archive step MUST create new capability files at `openspec/specs/asistente-ui/spec.md` and `openspec/specs/asistente-chat/spec.md` from these deltas (not the usual delta-into-existing flow). The `zed-event-bus` capability is NEW and gets a brand-new spec file; the `board-browser-pane` delta merges into the existing baseline." Mirrors the design §9 open-question #1.
- **Acceptance**: file exists, contains the paragraph, points to design §9.
- **Estimated LOC**: ~3 (Sequential: do after §2 + §3 + §4 merge)

### 6.3 Manual smoke checklist

- **File**: none (informational only)
- **Dependencies**: §5
- **Spec ref**: all
- **Description**: A 6-step manual checklist for the maintainer to run after `pnpm test` is green. (1) Start `pnpm dev`, open the chat panel. (2) Send "abre una terminal" → confirm a new panel becomes visible (no manual click). (3) Send "ahora corré `ls`" → confirm the assistant uses the same `session_id` (visible in the request body via devtools or in the chat response). (4) Send "abre https://github.com" → confirm the right-dock browser pane navigates AND the system browser also opens. (5) Open devtools console, manually `window.dispatchEvent(new CustomEvent('devhub:zed-open-url', { detail: { url: 'https://example.com', label: 'test' }}))` twice → confirm the second is a no-op (browser does not re-navigate). (6) Verify pizarra is NOT de-maximized when no `focus: true` is set.
- **Acceptance**: checklist written into `ROLLOUT.md` § "Manual smoke" (or a sibling `SMOKE.md`).
- **Estimated LOC**: ~0 (no code)

### 6.4 Archive prep

- **File**: none
- **Dependencies**: §1 + §2 + §3 + §4 + §5 + 6.1 + 6.2 + 6.3
- **Spec ref**: all
- **Description**: Pre-archive checklist for the orchestrator. (a) All tasks `[x]` checked. (b) `git status --short` clean OR only unrelated WIP. (c) Local checkpoint commit per slice (4 commits expected). (d) `[git:checkpoint]` comment with `commit=<sha|none>` per task. (e) Verify the `devhub:zed-*` namespace scan (5.3) passes. (f) Re-run the final acceptance gate (see §7) one more time.
- **Acceptance**: archive-phase handoff doc complete.
- **Estimated LOC**: ~0

---

## §7 Final Acceptance Gate

The orchestrator runs these EXACT commands before declaring done. Each MUST be green.

```bash
# 1. Unit tests (Jest, includes the new helper tests + extended existing tests)
pnpm exec jest --runInBand

# 2. Component tests (separate config used for component tests in this repo)
pnpm exec jest --config jest.config.component.js --runInBand

# 3. E2E tests (Playwright, no Tauri runtime; uses localStorage + page.route stubs)
pnpm exec playwright test

# 4. Lint (ESLint flat config; ZEB-005 is enforced by the script in 5.3, not by lint)
pnpm run lint
```

**All four MUST return exit code 0.** If any fail:

- Jest unit failure → re-run the failing file with `--verbose`; the failure pinpoints the test name.
- Jest component failure → check `flushSync` is called in the test (existing pattern).
- Playwright failure → check the `__TAURI_INTERNALS__` catch path is exercising (TWM:3762-3767); check `localStorage` keys use the correct `devhub_terminal_state:*` suffix.
- Lint failure → almost always a missing import; the diff should be tiny.

If the gate is green, the orchestrator proceeds to `sdd-archive` (per design §9 open question #1: the archive step creates new capability files for `asistente-ui`, `asistente-chat`, and `zed-event-bus` from these deltas; the `board-browser-pane` delta merges into the existing baseline).

---

## Phase Dependencies (must be sequential)

```
§1 Foundation ──┬──> §2 Slice 1 (needs 1.2 + 1.6)
                ├──> §3 Slice 2 (independent; 1 line + prompt)
                ├──> §4 Slice 3 (needs 1.4)
                │       └──> §5 Slice 4 (E2E needs §2 + §4)
                └──> §6 Cross-cutting (after §5)
```

**Critical path**: §1 → §4 → §5 → §6 (longest sequential chain). §2 and §3 can be applied in parallel with §4 once §1 lands.

**Independent tests within a task**: `[TEST FIRST]` and `[IMPL]` are strictly sequential (RED → GREEN). The `(Parallel: with X)` markers indicate independent tasks that may run concurrently.

---

## Strict TDD — RED tests to write FIRST

| Task | Test file                                                                            | Phase      |
| ---- | ------------------------------------------------------------------------------------ | ---------- |
| 1.1  | `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js` (new)              | Foundation |
| 1.3  | `src/components/__tests__/zedOpenUrlEvent.test.js` (new, validators)                 | Foundation |
| 1.5  | `src/components/__tests__/zedOpenUrlEvent.test.js` (extend, dispatch SSR)            | Foundation |
| 1.7  | `src/components/__tests__/zedOpenTerminalEvent.test.js` (extend)                     | Foundation |
| 2.1  | `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend, re-fire)            | Slice 1    |
| 3.1  | `src/components/asistente/__tests__/buildZedHistory.test.js` (extend, integration)   | Slice 2    |
| 3.3  | `src/lib/asistente/__tests__/zedSystemPrompt.test.js` (extend, substring)            | Slice 2    |
| 3.5  | `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend, 2-turn memory body) | Slice 2    |
| 4.1  | `src/lib/asistente/__tests__/tools/browser.test.js` (extend, dispatch event)         | Slice 3    |
| 4.3  | `src/components/workspace/__tests__/WorkspaceBrowserPane.openUrl.test.jsx` (new)     | Slice 3    |
| 5.1  | `tests/e2e/06_zed_open_terminal.spec.ts` (extend)                                    | Slice 4    |
| 5.2  | `tests/e2e/07_zed_open_url.spec.ts` (new)                                            | Slice 4    |
| 5.3  | `tests/spec/zed-event-bus-namespace.test.mjs` (new)                                  | Slice 4    |

**Total RED tests: 13.** Each test file is paired with exactly one impl task (or extension of one).

---

## Final Summary

### Task count

- Total tasks: **24** (numbered 1.1 through 6.4) across **6 phases** (§1–§6)
- RED tests: **13**
- Impl tasks: **10**
- E2E tasks: **3** (in §5)
- Cross-cutting / smoke: **4** (in §6)
- Final acceptance gate: **1** (§7)

### Total estimated LOC

| Section          |     Impl |    Tests |      Net |
| ---------------- | -------: | -------: | -------: |
| §1 Foundation    |       98 |      110 |      208 |
| §2 Slice 1       |       17 |       30 |       47 |
| §3 Slice 2       |        7 |       50 |       57 |
| §4 Slice 3       |       33 |       70 |      103 |
| §5 Slice 4       |        0 |      110 |      110 |
| §6 Cross-cutting |       ~0 |       ~0 |       ~0 |
| **Total**        | **~155** | **~370** | **~525** |

> **Note**: design §6 estimates ~497 net; this file estimates ~525. Delta of +28 LOC is in the E2E + namespace-scan files (allow for the 4 cases × ~15 LOC in `WorkspaceBrowserPane.openUrl.test.jsx` plus the regex+allow-list in `zed-event-bus-namespace.test.mjs`). Still well under 800.

### Risk areas (highest uncertainty)

| #   | Risk                                                                                                                                                                                                                                         | Section    | Mitigation                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `applyZedOpenTerminalFocus` reads `maximizedView` from a `deps` snapshot, not from React state. If TWM is ever refactored to pass `rightDockState` via a ref (not a prop), the helper call site must update.                                 | §1.2, §2.3 | The design §9 open question #6 already flags this; for now, the snapshot is the chosen pattern. E2E in 5.1 verifies the visible behavior.                                                                                                                |
| 2   | The 1-line closure fix in §3.2 may surface pre-existing model confusion with `tool_results` flattened as user-role messages.                                                                                                                 | §3         | The system-prompt addition in §3.4 covers this. The 2-line clause in `zed-system-prompt.md` is independent and can be kept even if the closure fix is reverted.                                                                                          |
| 3   | E2E tests in §5.1 + §5.2 depend on Playwright being able to mount the page without `__TAURI_INTERNALS__`. The TWM catch path (TWM:3762-3767) is a no-op in chromium.                                                                         | §5         | Existing `06_zed_open_terminal.spec.ts` already runs the same path; if it passes, the new tests will too.                                                                                                                                                |
| 4   | The new `dispatchZedOpenTerminal` shim (1.6) is added to an existing file. If the test file (1.7) is written before the impl, the test will fail to import.                                                                                  | §1.6, §1.7 | Sequentially locked; 1.7 is `Sequential: do after 1.6`.                                                                                                                                                                                                  |
| 5   | `WorkspaceBrowserPane` listener (4.4) reads `rightDockState?.maximizedView` from props. The dependency array tracks only that field. If TWM passes a new `rightDockState` reference every render, the listener re-registers on every render. | §4.4       | The existing pattern in the file (line 263-270) uses the same `useEffect` pattern; the dep array `[onDockStateChange, rightDockState?.maximizedView]` is stable across renders if the prop is referentially stable. E2E 5.2 catches re-registering bugs. |
| 6   | The 4-slice budget could be exceeded by tests (design §7 risk #9).                                                                                                                                                                           | All        | Each test file is bounded (~50-60 LOC). If a test runs over, defer the case to a follow-up — the unit tests cover the regression anyway.                                                                                                                 |

### Apply-phase gate

**Decision needed before apply: No** — LOW 800-line risk + cached `single-pr` (C2) + auto execution (A2) → orchestrator proceeds automatically with the 5-commit squash (1 foundation + 4 slice commits) as outlined in the Work Units table. The orchestrator should respect the per-task `(Sequential: do after test)` and `(Parallel: with X)` markers when launching sub-agents.
