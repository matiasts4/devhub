# Implementation Progress

**Change**: terminal-session-restore-post-reboot
**Mode**: Strict TDD

### Completed Tasks
- [x] 1.1 RED: Added route tests for `/api/opencode/sessions` success, empty, timeout, malformed JSON, cwd filtering, and bounded results.
- [x] 1.2 GREEN: Hardened `/api/opencode/sessions` with backend timeout, normalized envelope, deterministic error codes, dedupe, sorting, cwd filtering, and cap logic.
- [x] Baseline safety-net: Restored `getWorkspaceAnimProps()` to the truthful 200ms scale+opacity contract required by terminal-ux-redesign so strict TDD could continue safely.
- [x] 1.3 RED: Added adapter tests covering OpenCode normalization, provider-qualified dedupe keys, durable-provider gating, and Hermes unsupported behavior.
- [x] 1.4 GREEN: Created shared resumable-session adapters with OpenCode durable list/resume support, merge helpers, and Hermes non-durable scaffolding.
- [x] 1.5 RED: Added hook tests for loading/success/empty/error states, retry, and stale refresh cancellation.
- [x] 1.6 GREEN: Implemented `useResumableSessionCatalog()` with abortable refresh, merged provider results, and explicit state transitions.
- [x] 2.1 RED: Added topbar Reopen component tests for loading, empty, deterministic error+retry, history parity, and single-panel OpenCode resume behavior.
- [x] 2.2 GREEN: Replaced split OpenCode/Hermes reopen state in `TerminalWorkspacesManager` with the shared resumable-session catalog.
- [x] 2.3 RED: Replaced Agent Room tests and added polling tests to prove history comes from shared resumable sessions and polling no longer owns stale durable history.
- [x] 2.4 GREEN: Updated `AgentRoomSidebar` and `useAgentRegistryPolling()` so History consumes shared resumable sessions while polling remains active/live only.
- [x] 2.5 GREEN: Added deterministic reopen failure messaging so invalid sessions do not silently open blank substitute tabs.
- [x] 3.1 REFACTOR: Extracted shared DOM harness + resumable session fixtures for route, adapter, hook, polling, and component suites.
- [x] 3.2 GREEN: Added integration coverage proving topbar Reopen and Agent Room History stay in sync through timeout/error retry recovery and invalidated-session failure cleanup.
- [x] Regression fix: Restored real split rendering semantics from workspace `columns/panels` state so horizontal splits render side-by-side columns and vertical splits render stacked panels again.
- [x] Regression fix: Aligned production sidecar terminal transport with the JSON tty contract expected by `TerminalTTY`, so installed-app reopen now reports OpenCode detection/exit events instead of leaving blank terminals.
- [x] Regression fix: Added shell-only tty output hygiene so device/status response noise is stripped before shell history storage, broadcast, and reconnect replay.
- [ ] 3.3 RED/GREEN partial: Playwright spec is executable through the correct DevHub port now, but true browser E2E remains blocked by missing local Chromium binaries.

### Files Changed
| File | Action | What Was Done |
|------|--------|---------------|
| `src/app/api/opencode/sessions/route.test.js` | Modified | Switched route cases to shared OpenCode session fixtures while preserving bounded-route assertions. |
| `src/app/api/opencode/sessions/route.js` | Existing | Preserved bounded OpenCode route contract from prior batch. |
| `src/app/api/terminal/session/route.js` | Modified | Switched production sidecar sessions to the `/tty` JSON websocket path so installed-app transport matches the client event contract. |
| `src/components/terminal/workspaceAnimProps.js` | Modified previously | Baseline safety-net remained intact. |
| `src/lib/agentSessions/resumableSessionAdapters.test.js` | Modified | Reused shared resumable-session fixtures for dedupe/order coverage. |
| `src/lib/agentSessions/resumableSessionAdapters.js` | Existing | Shared resumable-session adapter contract unchanged. |
| `src/hooks/useResumableSessionCatalog.test.js` | Modified | Reused shared DOM harness + fixtures across loading/error/retry/stale-response coverage. |
| `src/hooks/useResumableSessionCatalog.js` | Existing | Hook contract unchanged. |
| `src/hooks/useAgentRegistryPolling.test.js` | Modified | Reused shared DOM harness for polling safety-net coverage. |
| `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx` | Modified | Added retry-parity, invalidated-session failure cleanup, reboot-style persisted command, and unsupported-Hermes substitute coverage; rewired to shared helpers. |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Added pending-reopen tracking plus `devhub:terminal-exit` failure cleanup, then restored real column/panel split rendering instead of flattening all panels into one stacked single-view model. |
| `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` | Created | Added regression tests proving horizontal splits render side-by-side columns and vertical splits render stacked panels from persisted workspace state. |
| `src/components/__tests__/AgentRoomSidebar.test.js` | Modified | Reused shared helpers for history parity/error coverage. |
| `src/components/AgentRoomSidebar.jsx` | Existing | History contract unchanged, still fed by shared resumable catalog. |
| `sidecar-backend/sessionTransport.js` | Created | Extracted transport helpers for raw/json websocket modes, structured server messages, and OpenCode session-id detection. |
| `sidecar-backend/server.js` | Modified | Added `/tty` JSON websocket transport, structured `output/exit/opencode-session-detected` events, replay on reconnect, and input detection for installed-app reopen semantics. |
| `src/test-support/domHarness.js` | Created | Centralized jsdom mount/click/cleanup/deferred helpers for strict-TDD frontend suites. |
| `src/test-support/resumableSessionFixtures.js` | Created | Centralized OpenCode route payloads, resumable session view models, and catalog error fixtures. |
| `tests/unit/sidecar-sessionTransport.test.js` | Created | Added contract tests for sidecar transport mode resolution, input parsing, structured event encoding, and OpenCode session-id detection. |
| `tests/e2e/terminal-session-restore-post-reboot.spec.ts` | Created | Added targeted Playwright spec documenting intended reboot-style OpenCode resume and unsupported-Hermes assertions. |
| `playwright.config.ts` | Modified | Aligned Playwright `baseURL`, `webServer.url`, and `webServer.command` with DevHub's actual dev port and `BASE_URL` override semantics. |
| `tests/unit/playwright-config.test.js` | Created | Added strict-TDD unit coverage proving Playwright config targets the real DevHub port and stays aligned under URL overrides. |
| `src/lib/terminal/ttyServer.js` | Modified | Stripped shell-mode DA/DSR-style terminal response noise before history persistence, socket broadcast, and reconnect replay, while leaving TUI passthrough intact. |
| `src/lib/terminal/ttyServer.test.js` | Modified | Added strict-TDD regression coverage for preserved shell output, filtered terminal-response noise, and clean existing-session replay. |
| `openspec/changes/terminal-session-restore-post-reboot/tasks.md` | Modified | Marked tasks 3.1 and 3.2 complete; left 3.3 open with documented blocker. |
| `openspec/changes/terminal-session-restore-post-reboot/apply-progress.md` | Created | Persisted merged apply progress in canonical OpenSpec storage. |

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `src/app/api/opencode/sessions/route.test.js` | Integration | N/A (new coverage on existing file) | ✅ Written first | ✅ Passed | ✅ success + timeout + malformed JSON + cwd + cap + empty/error cases | ➖ None needed |
| 1.2 | `src/app/api/opencode/sessions/route.test.js` | Integration | ✅ route suite green before follow-up edits | ✅ Driven by 1.1 RED | ✅ Passed | ✅ multiple envelope/result branches | ✅ Normalization/dedupe helpers kept minimal |
| baseline blocker | `src/components/__tests__/TerminalWorkspacesManager.test.js` | Unit | ❌ 2/4 failing pre-existing | ➖ Existing truthful test | ✅ Passed after fix | ➖ Existing 4 cases | ✅ Minimal product fix |
| 1.3 | `src/lib/agentSessions/resumableSessionAdapters.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 4 cases | ✅ Small helper extraction in adapter module |
| 1.4 | `src/lib/agentSessions/resumableSessionAdapters.test.js` | Unit | ✅ 4/4 | ✅ Written first | ✅ Passed | ✅ normalization + dedupe + Hermes unsupported cases | ✅ Shared normalization/sort helpers |
| 1.5 | `src/hooks/useResumableSessionCatalog.test.js` | Integration | N/A (new) | ✅ Written | ✅ Passed | ✅ loading + empty + retry + stale-response cases | ✅ None needed |
| 1.6 | `src/hooks/useResumableSessionCatalog.test.js` | Integration | ✅ 4/4 | ✅ Written first | ✅ Passed | ✅ merged provider + explicit state transitions | ✅ Small error helper extracted |
| 2.1 | `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx` | Integration | ✅ 4/4 panel-subtabs + 11/11 right-dock + 4/4 animation baseline | ✅ Written | ✅ Passed | ✅ loading/error/empty/success/resume cases | ✅ None needed |
| 2.2 | `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx` | Integration | ✅ 5/5 | ✅ Written first | ✅ Passed | ✅ shared catalog replaces split reopen state | ✅ Removed duplicate local reopen state |
| 2.3 | `src/components/__tests__/AgentRoomSidebar.test.js`, `src/hooks/useAgentRegistryPolling.test.js` | Integration | ✅ 5/5 prior sidebar badge + targeted polling safety-net | ✅ Written | ✅ Passed | ✅ 5 cases across sidebar/polling | ✅ Tests replaced to align with new contract |
| 2.4 | `src/components/__tests__/AgentRoomSidebar.test.js`, `src/hooks/useAgentRegistryPolling.test.js` | Integration | ✅ 5/5 | ✅ Written first | ✅ Passed | ✅ shared-history + active-only polling cases | ✅ Removed stale inactive history synthesis |
| 2.5 | `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx` | Integration | ✅ 5/5 | ✅ Written first | ✅ Passed | ✅ invalid/error+retry + resume launch cases | ✅ Reopen error state isolated from catalog state |
| 3.1 | `src/app/api/opencode/sessions/route.test.js`, `src/lib/agentSessions/resumableSessionAdapters.test.js`, `src/hooks/useResumableSessionCatalog.test.js`, `src/hooks/useAgentRegistryPolling.test.js`, `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx`, `src/components/__tests__/AgentRoomSidebar.test.js` | Unit + Integration | ✅ 23/23 prior targeted tests | ✅ Shared helpers extracted after coverage existed | ✅ Passed | ✅ route + adapter + hook + component suites now reuse the same fixture families | ✅ New `src/test-support/*` helpers removed duplication |
| 3.2 | `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx` | Integration | ✅ 5/5 | ✅ Written first | ✅ Passed | ✅ retry parity + invalidated-session exit + reboot persistence + unsupported-Hermes substitute cases | ✅ Shared helper reuse |
| 2.2 regression repair | `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`, `src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx`, `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx`, `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx` | Integration | ✅ 30/30 workspace safety-net | ✅ Split-layout RED written first | ✅ Passed | ✅ horizontal-column + vertical-stack persisted-state cases | ✅ Extracted `renderWorkspacePanel()` and restored geometry without changing workspace state shape |
| 2.5 production sidecar repair | `src/app/api/terminal/session/route.test.js`, `tests/unit/sidecar-sessionTransport.test.js` | Unit + Integration | ✅ 7/7 route + tty safety-net | ✅ Route/helper RED written first | ✅ Passed | ✅ `/tty` contract + json input/exit/output + session-detect cases | ✅ Extracted reusable sidecar transport helper instead of ad-hoc socket branching |
| tty shell replay hygiene | `src/lib/terminal/ttyServer.test.js` | Unit + Integration | ✅ 7/7 tty safety-net | ✅ Shell-noise RED written first | ✅ Passed | ✅ normal shell output + filtered DA/DSR chunks + clean reconnect replay | ✅ Extracted shell-only sanitizer + replay helper without touching TUI mode |
| 3.3 | `tests/unit/playwright-config.test.js`, `tests/e2e/terminal-session-restore-post-reboot.spec.ts` | Unit + E2E | ✅ config safety net added before config edit | ✅ Unit RED written first for 3100/default + override alignment | ⚠️ Unit GREEN passed; E2E startup reached browser launch but browser binary missing | ✅ default-port + override-port cases in config tests, plus 2 Playwright spec cases listed/runnable by config | ✅ Config now derives URL/port from one base source |

### Test Summary
- **Total tests written**: 23 additional assertions/spec assertions across this change, including 3 new tty hygiene assertions in this batch.
- **Total tests passing**: 44 targeted Jest tests passing across the current change-scoped suites.
- **Layers used**: Unit (17), Integration (27), E2E (1 spec file with 2 cases authored; execution reaches browser launch but is blocked by missing Chromium binary).
- **Approval tests**: 1 existing baseline animation test suite used earlier to validate/refit pre-existing behavior.
- **Pure functions created**: 3 new helpers/modules (`src/test-support/*`, Playwright config derivation constants, and `sidecar-backend/sessionTransport.js`).

### Deviations from Design
- True browser E2E for task 3.3 remains blocked by local Playwright browser installation debt, so executable proof stops at verified config alignment plus Playwright test discovery/browser-launch handoff.

### Issues Found
- Port/config mismatch is FIXED: Playwright now targets DevHub's actual Next dev port (`3100`) by default and stays aligned when `BASE_URL` is overridden.
- Split regression root cause is FIXED: `handleSplit()` kept correct `columns/panels` state, but the render path flattened that state into one stacked single-view model; rendering now follows the real workspace geometry again.
- Installed-app reopen contract is FIXED: production sidecar no longer uses the raw-only `/` websocket path for terminal sessions, and now emits structured `output`, `exit`, and `opencode-session-detected` events over `/tty` so client reopen logic can confirm success or fail deterministically.
- Shell reconnect noise is FIXED: shell-mode PTY output now drops DA/DSR terminal-response fragments before they enter persisted history, so reconnect/tab-switch replay no longer prints artifacts like `1;2c0;276;0c...`.
- Residual blocker is environment-only: `npx playwright test tests/e2e/terminal-session-restore-post-reboot.spec.ts` now gets past webServer startup and fails only because the local Chromium executable is missing (`npx playwright install`).
- Targeted route tests still emit expected `console.error` noise for timeout/ENOENT branches, and right-dock safety-net tests still emit known visual-edit `console.warn` logs; behavior remains green.

### Remaining Tasks
- [ ] 3.3 Execute the authored Playwright spec after installing the local Playwright Chromium browser (`npx playwright install`).

### Status
12/13 tasks complete (plus baseline blocker resolved). Current apply batch fixed the verified split-layout and installed-app reopen regressions; only environment-level browser installation debt still prevents full E2E execution.
