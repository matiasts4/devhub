# Tasks: Terminal Session Restore Post Reboot

> **Branch:** `feature/terminal-decompose`  
> **Apply:** Phases 4–6 implemented 2026-07-05 — see `verify-report.md`. Phase 7 e2e pending Chromium.

## Review Workload Forecast

| Field                                | Value                                     |
| ------------------------------------ | ----------------------------------------- |
| Estimated changed lines (Phases 4–6) | ~600–900                                  |
| Delivery                             | Committed on `feature/terminal-decompose` |

---

## Phase 1: Infrastructure (complete)

- [x] 1.1–1.6 OpenCode sessions route + adapters + catalog hook

## Phase 2: Reopen / History (complete)

- [x] 2.1–2.5 TWM + AgentRoom shared catalog

## Phase 3: Integration baseline

- [x] 3.1–3.2 Fixtures + integration
- [ ] 3.3–3.5 Folded into Phase 7 (e2e)

---

## Phase 4: Startup inject orchestration (TSIO) — **APPLIED**

- [x] 4.1 RED: `startupInjectOrchestrator.test.js`
- [x] 4.2 GREEN: `startupInjectOrchestrator.js`
- [x] 4.3 RED: `startupRestoreRunner.test.js` skip when dispatched
- [x] 4.4 GREEN: `startupRestoreRunner.js` intent integration
- [x] 4.5 RED: policy gating kimi not shell-ephemeral
- [x] 4.6 GREEN: `startupRestoreCoordinator.js` + `restorePolicyResolver.js`
- [x] 4.7 RED: `WorkspaceRestoreCoordinator.test.js` grok suspended
- [x] 4.8 GREEN: coordinator + `useTerminalInitialCommandLifecycle.js` reattach event
- [x] 4.9 Existing `TerminalWorkspacesManager.startupRestore.test.jsx` still passes
- [x] 4.10 VERIFY: targeted Jest suites green

## Phase 5: Terminal restore gear (TRG) — **APPLIED**

- [x] 5.1 RED/GREEN: `TerminalSettingsSection.restore.test.jsx`
- [x] 5.2 GREEN: `includeRestorePolicies` prop
- [x] 5.3 GREEN: modal copy + `includeRestorePolicies={false}` on Terminal tab
- [x] 5.4 RED: grok generic manual suspended seed test
- [x] 5.5 GREEN: `seedSuspendedPanelsByPolicy`
- [x] 5.6 VERIFY: modal + section tests

## Phase 6: Provider adapters (Phase B placeholders) — **APPLIED**

- [x] 6.1 `provider-notes-grok.md`
- [x] 6.2 `provider-notes-kimi.md`
- [x] 6.3–6.4 Placeholder adapters in `resumableSessionAdapters.js`
- [ ] 6.5 When CLI verified — future work

## Phase 7: E2E + verify (remaining)

- [ ] 7.1 GREEN: sharpen Playwright spec (single inject)
- [ ] 7.2 VERIFY: `npx playwright test tests/e2e/terminal-session-restore-post-reboot.spec.ts`
- [x] 7.3 `verify-report.md` updated
