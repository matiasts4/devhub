# Verification Report

**Change**: terminal-session-restore-post-reboot  
**Version**: N/A  
**Mode**: Strict TDD

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 13 |
| Tasks complete | 12 |
| Tasks incomplete | 1 |

Incomplete tasks:
- [ ] 3.3 Add `tests/e2e/terminal-session-restore-post-reboot.spec.ts` for restart/reboot-style OpenCode resume and explicit unsupported-Hermes behavior.

Focused re-check:
- ✅ Split-layout regression is now explicitly covered: `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx` proves persisted `columns/panels` state renders horizontal splits as side-by-side columns and vertical splits as stacked panels.
- ✅ Installed-app sidecar reopen contract is covered at route + transport layers: `src/app/api/terminal/session/route.test.js` verifies production `wsPath: '/tty'`; `tests/unit/sidecar-sessionTransport.test.js` verifies structured `output`, `exit`, and `opencode-session-detected` JSON events.
- ⚠️ Task 3.3 is still incomplete: the Playwright file exists, but browser execution is blocked by missing Chromium and the authored assertions still stop short of proving the real UI reopen flow.

---

## Build & Tests Execution

**Build**: ➖ Skipped by explicit instruction (`Do NOT build`).

**Tests (project command: `npm test`)**: ❌ Failed

```text
Test Suites: 12 failed, 114 passed, 126 total
Tests:       33 failed, 1 skipped, 681 passed, 715 total
```

Representative repo-wide failures outside this change:
- `tests/agenthub/api/*` → repeated `fetch failed`
- `src/components/__tests__/TerminalTabsManager.test.js` → `getRestoredTabLabel is not a function`
- `src/lib/projectClassification.test.js` → `crypto is not defined`
- `src/lib/terminal/ttyServer.test.js` → hardcoded-home-path expectation mismatch
- `src/components/__tests__/cssTokens.test.js` / `Sidebar.test.js` / `rightDockState.test.js` → pre-existing UI/token expectation drift

**Targeted change tests**: ✅ Passed

```text
Command:
npm test -- --runTestsByPath \
  src/app/api/opencode/sessions/route.test.js \
  src/lib/agentSessions/resumableSessionAdapters.test.js \
  src/hooks/useResumableSessionCatalog.test.js \
  src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx \
  src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx \
  src/components/__tests__/AgentRoomSidebar.test.js \
  src/hooks/useAgentRegistryPolling.test.js \
  src/app/api/terminal/session/route.test.js \
  tests/unit/sidecar-sessionTransport.test.js \
  tests/unit/playwright-config.test.js

Result:
Test Suites: 10 passed, 10 total
Tests:       41 passed, 41 total
```

**E2E (`tests/e2e/terminal-session-restore-post-reboot.spec.ts`)**: ❌ Blocked

```text
Command:
npx playwright test tests/e2e/terminal-session-restore-post-reboot.spec.ts

Observed behavior:
- Playwright webServer starts against the configured app URL successfully.
- Execution stops at browser launch only because Chromium is not installed locally:
  browserType.launch: Executable doesn't exist ...
  Please run: npx playwright install
```

**Coverage (targeted)**: Available, no threshold configured in `openspec/config.yaml`.

---

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress` contains a TDD Cycle Evidence table |
| All completed change tasks have tests | ✅ | 12/12 completed tasks map to existing test coverage |
| RED confirmed (tests exist) | ✅ | Route, adapter, hook, component, config, transport, and Playwright spec files exist |
| GREEN confirmed (tests pass) | ⚠️ | 10/11 change-scoped test files are executable and green; Playwright spec is still blocked at browser launch |
| Triangulation adequate | ⚠️ | Split-layout and sidecar regressions now have targeted triangulation, but task 3.3 still lacks executable browser proof |
| Safety Net for modified files | ⚠️ | Strong change-scoped safety net exists; some earlier apply-progress rows still record partial legacy safety-net wording |

**TDD Compliance**: 3/6 fully green, 3/6 partial

---

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 10 | 3 | Jest via `npm test` |
| Integration | 31 | 7 | Jest + jsdom/custom DOM harness |
| E2E | 0 executed (2 authored) | 1 | Playwright configured, runtime blocked by missing browser binary |
| **Total** | **41 passing + 2 blocked E2E cases** | **11** | |

---

## Changed File Coverage

| File | Line % | Branch % | Uncovered Lines | Rating |
|------|--------|----------|-----------------|--------|
| `src/app/api/opencode/sessions/route.js` | 94.28% | 66.66% | See prior detailed report; json-summary run kept aggregate only | ⚠️ Acceptable |
| `src/app/api/terminal/session/route.js` | 64.28% | 70.00% | See prior detailed report; json-summary run kept aggregate only | ⚠️ Low |
| `sidecar-backend/sessionTransport.js` | 73.07% | 60.00% | See prior detailed report; json-summary run kept aggregate only | ⚠️ Low |
| `src/lib/agentSessions/resumableSessionAdapters.js` | 82.69% | 51.38% | See prior detailed report; json-summary run kept aggregate only | ⚠️ Acceptable |
| `src/hooks/useResumableSessionCatalog.js` | 80.00% | 42.85% | See prior detailed report; json-summary run kept aggregate only | ⚠️ Acceptable |
| `src/components/TerminalWorkspacesManager.jsx` | 55.92% | 43.10% | See prior detailed report; json-summary run kept aggregate only | ⚠️ Low |
| `src/components/AgentRoomSidebar.jsx` | 62.90% | 53.46% | See prior detailed report; json-summary run kept aggregate only | ⚠️ Low |
| `src/hooks/useAgentRegistryPolling.js` | 90.24% | 54.54% | See prior detailed report; json-summary run kept aggregate only | ⚠️ Acceptable |
| `src/test-support/domHarness.js` | 100% | 66.66% | — | ✅ Excellent |
| `src/test-support/resumableSessionFixtures.js` | 100% | 62.50% | — | ✅ Excellent |
| `src/components/terminal/workspaceAnimProps.js` | 100% | 100% | — | ✅ Excellent |

**Average changed file coverage**: 67.69% total lines across the targeted changed-file set. `TerminalWorkspacesManager.jsx`, `AgentRoomSidebar.jsx`, `src/app/api/terminal/session/route.js`, and `sidecar-backend/sessionTransport.js` remain the weakest areas.

---

## Assertion Quality

| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| `tests/e2e/terminal-session-restore-post-reboot.spec.ts` | 61-65 | localStorage `initialCommand` check after `page.goto('/')` | Confirms persisted state only; does not prove Reopen UI launches exactly one resumed OpenCode panel | WARNING |
| `tests/e2e/terminal-session-restore-post-reboot.spec.ts` | 97-101 | localStorage/JSON string checks for Hermes | Confirms absence of fake resume metadata, but not user-visible unsupported-Hermes history behavior | WARNING |

**Assertion quality**: 0 CRITICAL, 2 WARNING

---

## Quality Metrics

**Linter**: ⚠️ Not green on changed files. Main blockers are environment/config mismatches for Jest/CommonJS globals in test files (`no-undef` on `jest`, `describe`, `require`, `module`, `global`) plus existing warnings in modified UI modules and `no-undef` on `require`/`process` in `src/app/api/terminal/session/route.js`.

**Type Checker**: ➖ Not available (`openspec/config.yaml` marks this JS project as having no type-checker step).

---

## Focused Regression Checks

| Focus area | Runtime evidence | Result | Notes |
|-----------|------------------|--------|-------|
| Split horizontal rendering | `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx > renders horizontal splits as side-by-side workspace columns` | ✅ COMPLIANT | Confirms two persisted columns render in one horizontal `PanelGroup` instead of a flattened vertical stack |
| Split vertical rendering | `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx > renders vertical splits as stacked panels inside the same column` | ✅ COMPLIANT | Confirms one column with two panels renders in a vertical `PanelGroup` |
| Installed-app reopen sidecar contract | `src/app/api/terminal/session/route.test.js > returns the json tty path for the production sidecar transport` + `tests/unit/sidecar-sessionTransport.test.js > builds structured json events for output, exit, and reopen detection` | ⚠️ PARTIAL | Contract is fixed at route + sidecar transport layers, but there is still no browser/desktop E2E proving installed-app reopen end-to-end |

---

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| OpenCode Session Listing Has Bounded Reopen States | OpenCode sessions load successfully | `src/app/api/opencode/sessions/route.test.js > returns success envelope with normalized newest-first deduped sessions` | ✅ COMPLIANT |
| OpenCode Session Listing Has Bounded Reopen States | OpenCode listing times out or fails | `src/app/api/opencode/sessions/route.test.js > returns timeout error envelope when CLI list exceeds the bound` + `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx > shows deterministic error state with retry action` | ✅ COMPLIANT |
| OpenCode Resume Is the Required MVP Restore Path | User resumes an OpenCode session after reboot | `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx > reopens an OpenCode session in exactly one new panel and records the run` + `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx > restores persisted OpenCode session command after reboot-style reload` | ⚠️ PARTIAL |
| OpenCode Resume Is the Required MVP Restore Path | Listed session becomes invalid before reopen | `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx > shows deterministic failure instead of leaving a blank substitute panel when reopen exits immediately` | ✅ COMPLIANT |
| Reopen and History Show Only Verified Resumable Providers | OpenCode appears in resumable history | `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx > renders the same resumable sessions in topbar and Agent Room history` + `src/components/__tests__/AgentRoomSidebar.test.js > renders resumable history entries from shared catalog instead of hook inactive agents` | ✅ COMPLIANT |
| Reopen and History Show Only Verified Resumable Providers | No resumable providers are available | `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx > shows empty state when no durable sessions are available` + `src/components/__tests__/AgentRoomSidebar.test.js > shows explicit empty state when shared resumable history is empty` | ✅ COMPLIANT |
| Hermes Durable Restore Is Conditional and Deferred by Default | Hermes support is not verified | `src/lib/agentSessions/resumableSessionAdapters.test.js > returns only durable providers by default and keeps Hermes available as unsupported scaffolding` + `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx > does not advertise Hermes as reboot-safe resumable history when catalog has no durable sessions` | ✅ COMPLIANT |
| Hermes Durable Restore Is Conditional and Deferred by Default | Hermes support is verified later | (no passing runtime proof; extension point only) | ⚠️ PARTIAL |
| Acceptance Criteria | Reopen never spins forever | `src/app/api/opencode/sessions/route.test.js > returns timeout error envelope when CLI list exceeds the bound` + `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx > keeps topbar Reopen and Agent Room history in sync through timeout retry recovery` | ✅ COMPLIANT |
| Acceptance Criteria | OpenCode resume survives reboot semantics | `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx > restores persisted OpenCode session command after reboot-style reload` + `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx > reopens an OpenCode session in exactly one new panel and records the run` | ⚠️ PARTIAL |
| Acceptance Criteria | Hermes false resume is forbidden | `src/lib/agentSessions/resumableSessionAdapters.test.js > returns only durable providers by default and keeps Hermes available as unsupported scaffolding` + `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx > does not advertise Hermes as reboot-safe resumable history when catalog has no durable sessions` | ✅ COMPLIANT |

**Compliance summary**: 8/11 scenarios compliant

Notes on partial scenarios:
- The split-layout regression is now proven at integration level, but it is a regression safety-net, not a first-class spec scenario.
- The installed-app sidecar transport contract is repaired and tested, but end-to-end installed-app proof is still missing.
- The Playwright config blocker is gone, but runtime browser proof still does not exist.
- The current Playwright spec asserts persisted state, not the full reboot-style user flow of reopening a listed OpenCode session through the UI and verifying the launched command.
- “Hermes verified later” remains an explicit deferred extension point, not shipped MVP behavior.

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| OpenCode Session Listing Has Bounded Reopen States | ✅ Implemented | Route enforces `--max-count 20`, 10s timeout, deterministic envelope, cwd filtering, dedupe, and explicit UI loading/error/empty states |
| OpenCode Resume Is the Required MVP Restore Path | ⚠️ Partial | Product code launches one panel with `opencode --session <id>`, persists detected session IDs, and cleans invalid resumes; browser-level reboot/reopen proof is still incomplete |
| Reopen and History Show Only Verified Resumable Providers | ✅ Implemented | `TerminalWorkspacesManager` owns one shared resumable catalog and passes it into `AgentRoomSidebar` |
| Hermes Durable Restore Is Conditional and Deferred by Default | ✅ Implemented | Hermes adapter remains non-durable, excluded from the resumable catalog, and unsupported UX is covered |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Shared `ResumableSession` adapter contract | ✅ Yes | `src/lib/agentSessions/resumableSessionAdapters.js` remains the normalization/merge contract |
| Backend timeout + UI cancellation | ✅ Yes | Route times out at source; `useResumableSessionCatalog()` aborts stale refreshes |
| One source of truth for Reopen + History | ✅ Yes | `TerminalWorkspacesManager` feeds the same catalog state to the topbar and `AgentRoomSidebar` |
| Hermes conditional adapter only | ✅ Yes | Durable Hermes resume is still excluded by `supportsDurableResume() === false` |
| Preserve real workspace geometry/state continuity | ✅ Yes | Render path now follows persisted `columns/panels` geometry again instead of flattening panels |
| Production sidecar must speak client event contract | ✅ Yes | `/api/terminal/session` now returns `/tty` for production, and sidecar emits structured JSON messages consumed by `TerminalTTY` |
| E2E proof of reboot-style resume | ⚠️ Deviated | Playwright config is fixed, but the authored spec still stops short of validating the full reopen interaction |

---

## Issues Found

### CRITICAL (must fix before archive)

1. **Strict TDD repo gate is still red** — `npm test` fails at repo level (`12` failed suites / `33` failed tests).
2. **Task 3.3 is still incomplete** — browser execution is blocked by missing Chromium (`npx playwright install`), and the current Playwright spec does not yet prove the actual reboot-style Reopen user flow.
3. **Archive is still not justified** — strict verification still lacks executable browser proof for remaining acceptance coverage.

### WARNING (should fix)

1. **Installed-app reopen proof is still contract-level, not full-product-level** — route + sidecar transport are fixed, but there is no browser/desktop E2E showing the blank-terminal regression is gone end-to-end.
2. **E2E scenario depth is insufficient** — current Playwright assertions validate persisted localStorage state, not selecting a resumable OpenCode session and verifying the launched command in the UI.
3. **Core UI coverage remains weak** — `TerminalWorkspacesManager.jsx` and `AgentRoomSidebar.jsx` are still below strong strict-TDD expectations.
4. **Changed-file lint is not green** — ESLint still flags Jest/CommonJS globals and `require`/`process` environment issues in changed files.

### SUGGESTION (nice to have)

1. Extend the Playwright spec to drive the actual Reopen menu/history interaction once browsers are installed.
2. Add ESLint environment overrides for Jest/CommonJS test files so changed-file quality checks become actionable instead of noisy.
3. Add one end-to-end desktop or browser-level assertion for the installed-app `/tty` reopen success path after Chromium/environment debt is cleared.

---

## Verdict

**FAIL**

The important regressions are real fixes — split geometry is back, and production sidecar transport now matches the client’s structured JSON contract. But strict verification still FAILS because `npm test` is repo-red, task 3.3 remains open, Playwright cannot execute without Chromium, and the remaining E2E assertions are still too shallow to justify archive.
