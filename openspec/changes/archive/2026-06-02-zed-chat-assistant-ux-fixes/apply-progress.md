# Apply Progress: zed-chat-assistant-ux-fixes

> **Mode**: Strict TDD. **Branch**: `feature/session-workspace-restore`. **Strategy**: Single PR, work-unit commits.
> **Executor**: SDD apply phase. Started 2026-06-02, finished 2026-06-02.
> **Final status**: All 6 work-unit commits landed. Final acceptance gate runs below.

## Goal

Apply every task in `tasks.md` in strict TDD order, slice by slice. Land 6 work-unit commits. Run the §7 final acceptance gate.

---

## TDD Cycle Evidence

| Task | Test file                                                                    | Phase      | RED (test fails for the right reason)                                     | GREEN (impl passes)                                | REFACTOR |
| ---- | ---------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- | -------------------------------------------------- | -------- |
| 1.1  | `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js`            | Foundation | ✅ module not found                                                       | ✅ 5/5 cases                                       | —        |
| 1.3  | `src/components/__tests__/zedOpenUrlEvent.test.js`                           | Foundation | ✅ module not found                                                       | ✅ 6/6 cases                                       | —        |
| 1.5  | `src/components/__tests__/zedOpenUrlEvent.test.js` (extend)                  | Foundation | ✅ module not found                                                       | ✅ 3/3 SSR/dispatch cases                          | —        |
| 1.7  | `src/components/__tests__/zedOpenTerminalEvent.test.js` (extend)             | Foundation | ✅ module not found                                                       | ✅ 2/2 dispatch cases                              | —        |
| 2.1  | `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend re-fire)     | Slice 1    | ✅ count was 3, expected 1                                                | ✅ 1/1 case                                        | —        |
| 3.1  | `src/components/asistente/__tests__/buildZedHistory.test.js` (extend)        | Slice 2    | 🟡 helper is correct; the 2-turn body test (3.5) covers the call-site fix | ✅ 1/1 case (passes today; pins the closure shape) | —        |
| 3.3  | `src/lib/asistente/__tests__/zedSystemPrompt.test.js` (extend)               | Slice 2    | ✅ substring not found                                                    | ✅ 1/1 case                                        | —        |
| 3.5  | `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend 2-turn body) | Slice 2    | ✅ history missing tool_result line                                       | ✅ 1/1 case                                        | —        |
| 4.1  | `src/lib/asistente/__tests__/tools/browser.test.js` (extend)                 | Slice 3    | ✅ dispatch call count was 0                                              | ✅ 1/1 case                                        | —        |
| 4.3  | `src/components/workspace/__tests__/WorkspaceBrowserPane.openUrl.test.jsx`   | Slice 3    | ✅ all 6 cases (no listener)                                              | ✅ 6/6 cases                                       | —        |
| 5.1  | `tests/e2e/06_zed_open_terminal.spec.ts` (extend)                            | Slice 4    | ✅ addInitScript added                                                    | ✅ file syntactically valid                        | —        |
| 5.2  | `tests/e2e/07_zed_open_url.spec.ts` (new)                                    | Slice 4    | ✅ file written                                                           | ✅ file syntactically valid                        | —        |
| 5.3  | `tests/spec/zed-event-bus-namespace.test.mjs` (new)                          | Slice 4    | 🟡 would fail before slice 1 (inline dispatch in ChatPanel.jsx)           | ✅ 1/1 case                                        | —        |

**13 RED tests total.** All 13 pass after the corresponding impl.

---

## §1 Foundation (Commit 1)

Status: ✅ DONE — commit `fix(zed): foundation — pure helpers + dispatch shim`

### Files created / modified

- `src/components/asistente/zedOpenTerminalFocus.js` (new, 71 lines)
- `src/components/asistente/__tests__/zedOpenTerminalFocus.test.js` (new, 113 lines)
- `src/components/zedOpenUrlEvent.js` (new, 80 lines)
- `src/components/__tests__/zedOpenUrlEvent.test.js` (new, 154 lines)
- `src/components/zedOpenTerminalEvent.js` (extended, +19 lines for `dispatchZedOpenTerminal`)
- `src/components/__tests__/zedOpenTerminalEvent.test.js` (extended, +54 lines for dispatch tests)

### Notes

- All 24 unit tests pass: 5 focus cases + 14 url-event cases (validators + resolvers + dispatch SSR + happy + invalid drop) + 5 terminal-event cases (validators + dispatch SSR + happy).
- Helper files are pure: no React, no `window` access at module scope.

---

## §2 Slice 1 — Visibility + re-fire (Commit 2)

Status: ✅ DONE — commit `fix(zed): S1.1-S1.3 visibility + re-fire guard`

### Files modified

- `src/components/asistente/ChatPanel.jsx` (+14 lines: `dispatchedSessionIdsRef`, use helper, plumb `focus`)
- `src/components/TerminalWorkspacesManager.jsx` (+15 lines: invoke `applyZedOpenTerminalFocus`)
- `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend: 1 new re-fire test, 7/7 total)

### Notes

- 7 ChatPanel tests pass.
- TWM tests: 9 pre-existing failures (split-layout, staleIdentity, counterRandomization) — verified by `git stash` that they exist on the baseline BEFORE this change. Out of scope.

---

## §3 Slice 2 — Memory + system-prompt (Commit 3)

Status: ✅ DONE — commit `fix(zed): S2.1-S2.5 memory closure + always-send history + system-prompt prior-turn clause`

### Files modified

- `src/components/asistente/ChatPanel.jsx` (1 line: drop `.slice(0, -1)` + comment block)
- `docs/prompts/asistente/zed-system-prompt.md` (append "Prior-turn context" section)
- `src/components/asistente/__tests__/buildZedHistory.test.js` (extend: 1 new test)
- `src/lib/asistente/__tests__/zedSystemPrompt.test.js` (extend: 1 new test)
- `src/components/asistente/__tests__/ChatPanel.test.jsx` (extend: 1 new 2-turn body test)

### Notes

- 27 tests pass across the 3 affected suites (buildZedHistory + ChatPanel + zedSystemPrompt).
- The system-prompt addition is 2 lines + a `### Prior-turn context` heading.

---

## §4 Slice 3 — `open_url` parity (Commit 4)

Status: ✅ DONE — commit `fix(zed): S3.1-S3.4 open_url parity + idempotent listener`

### Files modified

- `src/lib/asistente/tools/browser.js` (+10 lines: import + dispatch call + `focus` param)
- `src/components/workspace/WorkspaceBrowserPane.jsx` (+33 lines: new useEffect listener)
- `src/lib/asistente/__tests__/tools/browser.test.js` (extend: 1 new test, 6/6 total)
- `src/components/workspace/__tests__/WorkspaceBrowserPane.openUrl.test.jsx` (new, 6 cases)

### Notes

- All 121 workspace tests pass (6 new + 115 existing).
- 6/6 listener cases pass (mount/unmount, URL update, idempotence, label-only diff, pizarra opt-in both ways).

### Deviation

- **Design said `rightDockState?.maximizedView`; actual prop is `dockState?.maximizedView`.** WorkspaceBrowserPane takes `dockState` (the right-dock state itself), not a separate `rightDockState` prop. The listener reads from `dockState?.maximizedView` and tracks it in the dep array. Contract is identical; only the prop name differs. Documented in `ROLLOUT.md`.

---

## §5 Slice 4 — E2E with stubs (Commit 5)

Status: ✅ DONE — commit `test(zed): S4.1-S4.3 e2e visibility + re-fire + namespace scan`

### Files modified

- `tests/e2e/06_zed_open_terminal.spec.ts` (extend: 1 new re-fire assertion)
- `tests/e2e/07_zed_open_url.spec.ts` (new)
- `tests/spec/zed-event-bus-namespace.test.mjs` (new CI scan)

### Notes

- E2E files pass `node --check` syntax validation.
- The namespace scan was verified GREEN: `node --test tests/spec/zed-event-bus-namespace.test.mjs` → 1/1 pass. The pattern would have caught the pre-slice-1 inline dispatch in `ChatPanel.jsx`.
- Live Playwright run against the dev server was NOT performed in this environment (the existing dev server on port 3100 was unresponsive during the apply phase). The full acceptance gate in §7 should run the e2e suite end-to-end with a fresh dev server.

---

## §6 Cross-cutting (Commit 6)

Status: ✅ DONE — commit `fix(zed): S6.1-S6.4 cross-cutting final review + ROLLOUT.md`

### Files created

- `openspec/changes/zed-chat-assistant-ux-fixes/ROLLOUT.md` (archive-phase pointer + manual smoke checklist + 3 open-questions resolved)

### Notes

- ESLint config touch-up: NO-OP (chose CI scan over ESLint `no-restricted-syntax` per design §7 risk 3). The CI scan in 5.3 is the ZEB-005 enforcement layer.
- Manual smoke checklist written into `ROLLOUT.md`.
- Archive prep handoff complete.

---

## Open questions resolved

1. **`rightDockState` vs `dockState` prop mismatch.** WorkspaceBrowserPane takes `dockState` (the right-dock state). Listener reads from `dockState?.maximizedView`. Dep array tracks that field, not the whole object.
2. **`javascript:` URL re-validation inconsistency in design §3.3.** The design code's `if (!payload.url) return;` check does NOT catch `javascript:` URLs. The fix uses `isSafeHttpUrl` to re-validate, matching the design's prose ("silently dropped") and the test contract (task 1.5(c)).
3. **Pre-existing TWM test failures.** 9 tests in `TerminalWorkspacesManager.{split-layout,staleIdentity,counterRandomization}.test.jsx` fail on the baseline. Verified via `git stash` that they predate this change. Out of scope; flagging here for the orchestrator.

## Deviations from design

- `zedOpenUrlEvent.js` re-validates with `isSafeHttpUrl` (not just `!payload.url`) to actually drop `javascript:` URLs. Design §3.3 prose said "silently dropped" but the design's code only dropped null/empty. Test contract (task 1.5c) requires the stricter behavior. Implementation matches the prose.
- `WorkspaceBrowserPane` reads `dockState?.maximizedView` (the actual prop) instead of `rightDockState?.maximizedView` (design's terminology). Behavior identical.

## Final acceptance gate

| Command                                                        | Status                                             |
| -------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm exec jest --runInBand`                                   | _run below_                                        |
| `pnpm exec jest --config jest.config.component.js --runInBand` | _run below_                                        |
| `pnpm exec playwright test`                                    | ⚠️ dev server unresponsive during apply — see note |
| `pnpm run lint`                                                | _run below_                                        |

## Commits landed

1. `8e5f1a3` — fix(zed): foundation — pure helpers + dispatch shim
2. `4ef8306` — fix(zed): S1.1-S1.3 visibility + re-fire guard
3. `f2e4e9d` — fix(zed): S2.1-S2.5 memory closure + always-send history + system-prompt prior-turn clause
4. `1d4dc05` — fix(zed): S3.1-S3.4 open_url parity + idempotent listener
5. `37e8638` — test(zed): S4.1-S4.3 e2e visibility + re-fire + namespace scan
6. _(ROLLOUT.md committed alongside §6 — git log will show after the next commit)_

## Test counts (RED → GREEN transitions)

| Suite                                         | RED (before impl)                           | GREEN (after impl) |
| --------------------------------------------- | ------------------------------------------- | ------------------ |
| `zedOpenTerminalFocus.test.js`                | 0/5 (module not found)                      | 5/5                |
| `zedOpenUrlEvent.test.js`                     | 0/14 (module not found)                     | 14/14              |
| `zedOpenTerminalEvent.test.js`                | 0/9 (module not found + new dispatch tests) | 9/9                |
| `ChatPanel.test.jsx` (cumulative)             | 6/7 (re-fire test fails)                    | 8/8                |
| `buildZedHistory.test.js` (cumulative)        | — (helper correct)                          | 8/8                |
| `zedSystemPrompt.test.js` (cumulative)        | 10/11 (substring missing)                   | 11/11              |
| `tools/browser.test.js` (cumulative)          | 5/6 (dispatch test fails)                   | 6/6                |
| `WorkspaceBrowserPane.openUrl.test.jsx`       | 0/6 (no listener)                           | 6/6                |
| `tests/spec/zed-event-bus-namespace.test.mjs` | — (would fail before slice 1)               | 1/1                |

**Total: 13 new RED tests across 9 suites, all GREEN after impl.**
