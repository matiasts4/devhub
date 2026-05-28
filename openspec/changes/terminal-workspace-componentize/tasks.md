# Tasks: terminal-workspace-componentize

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,800–2,400 (3,676-line file split into 13 new/modified files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (UTIL + ESLint) → PR 2 (HOOK-1 + COMP-1 + COMP-2) → PR 3 (HOOK-2 + SMOKE-1 + HOOK-3 + COMP-3 + ORCH-1) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | ESLint rule + 4 util files + barrel stub | PR 1 | Base: main; pure JS, no React deps; zero behavior change |
| 2 | HOOK-1 + COMP-1 + COMP-2 extractions | PR 2 | Base: PR 1; right dock + tab bar + terminal surface; `npm test` gate each step |
| 3 | HOOK-2 + SMOKE-1 + HOOK-3 + COMP-3 + ORCH-1 | PR 3 | Base: PR 2; swarm extraction is high-risk; SMOKE-1 gate mandatory before HOOK-3 |

---

## Phase 1: Foundation — ESLint + Directory Scaffold

- [x] 1.1 Create directories: `src/components/terminal/utils/`, `hooks/`, `components/` — already existed from prior session
- [ ] 1.2 Add `import/no-restricted-paths` zones to `.eslintrc` (or `eslint.config.js`) — utils→hooks→components→orchestrator; verify `npm run lint` passes
- [x] 1.3 Create empty `src/components/terminal/index.js` barrel (exports TBD — filled in later steps) — already existed with full exports

## Phase 2: UTIL-1 — Utility Extraction

- [x] 2.1 **RED** Write unit tests for `swarmRoleMeta.js` exports — tests written in `tests/unit/swarm-role-meta.test.js` (19 tests, all passing)
- [x] 2.2 **GREEN** Create `src/components/terminal/utils/swarmRoleMeta.js` — already existed from prior session; orchestrator updated to import from new path
- [x] 2.3 **RED** Write unit tests for `panelHelpers.js` exports — tests written in `tests/unit/panel-helpers.test.js` (20 tests, all passing)
- [x] 2.4 **GREEN** Create `src/components/terminal/utils/panelHelpers.js` — already existed from prior session; orchestrator updated to import from new path
- [x] 2.5 **RED** Write unit tests for `semanticMetadata.js` exports — tests written in `tests/unit/semantic-metadata.test.js` (33 tests, all passing)
- [x] 2.6 **GREEN** Create `src/components/terminal/utils/semanticMetadata.js` — already existed from prior session; orchestrator updated to import from new path
- [x] 2.7 Decide open question: `renderWorkspacePanel` → `components/` (already extracted to `components/renderWorkspacePanel.jsx` in prior session)
- [x] 2.8 Create `src/components/terminal/components/renderWorkspacePanel.jsx` — already existed from prior session; orchestrator no longer uses it directly (uses `WorkspaceTerminalSurface` instead)
- [x] 2.9 Export `swarmRoleMeta` and `panelHelpers` from barrel `index.js` — already exported

## Phase 3: HOOK-1 — useRightDockController Extraction

- [ ] 3.1 **RED** Write `renderHook` tests for `useRightDockController` — verify return shape
- [x] 3.2 **GREEN** Create `src/components/terminal/hooks/useRightDockController.js` — already existed from prior session; orchestrator calls the hook
- [x] 3.3 Export `useRightDockController` from `index.js` — already exported

## Phase 4: COMP-1 — WorkspaceWindowTabBar Extraction

- [ ] 4.1 **RED** Write snapshot + prop-forwarding tests for `WorkspaceWindowTabBar`
- [x] 4.2 **GREEN** Create `src/components/terminal/components/WorkspaceWindowTabBar.jsx` — already existed from prior session; orchestrator imports from new path
- [x] 4.3 Export `WorkspaceWindowTabBar` from `index.js` — already exported

## Phase 5: COMP-2 — WorkspaceTerminalSurface Extraction

- [ ] 5.1 **RED** Write snapshot + prop-forwarding tests for `WorkspaceTerminalSurface`
- [x] 5.2 **GREEN** Create `src/components/terminal/components/WorkspaceTerminalSurface.jsx` — already existed from prior session; orchestrator imports from new path
- [x] 5.3 Export `WorkspaceTerminalSurface` from `index.js` — already exported

## Phase 6: HOOK-2 — useWorkspaceWindowsController Extraction

- [x] 6.1 Audit: `browserWindowStates` owned by orchestrator, passed as arg to hook (per design.md)
- [ ] 6.2 **RED** Write `renderHook` tests for `useWorkspaceWindowsController` — verify return shape
- [x] 6.3 **GREEN** Create `src/components/terminal/hooks/useWorkspaceWindowsController.js` — already existed from prior session; orchestrator calls the hook
- [x] 6.4 Export `useWorkspaceWindowsController` from `index.js` — already exported

## Phase 7: SMOKE-1 Gate

- [ ] 7.1 Run app locally; execute all 5 manual checks (SMOKE-1a–SMOKE-1e) per design.md
- [ ] 7.2 Create `openspec/changes/terminal-workspace-componentize/smoke-test-log.md` — record pass/fail + date for each check
- [ ] 7.3 **BLOCK**: Do NOT start Phase 8 until smoke-test-log.md shows all 5 checks passing

## Phase 8: HOOK-3 + COMP-3 — Swarm Extraction (High Risk)

- [ ] 8.1 **RED** Write `renderHook` tests for `useSwarmLaunchController` — verify return shape
- [x] 8.2 **GREEN** Create `src/components/terminal/hooks/useSwarmLaunchController.js` — already existed from prior session; orchestrator calls the hook
- [ ] 8.3 **RED** Write tests for `SwarmLaunchEntryPoint` — modal renders when `open=true`, `onClose` fires on dismiss
- [x] 8.4 **GREEN** Create `src/components/terminal/components/SwarmLaunchEntryPoint.jsx` — already existed from prior session; orchestrator imports from new path
- [x] 8.5 Export `useSwarmLaunchController` + `SwarmLaunchEntryPoint` from `index.js` — already exported

## Phase 9: ORCH-1 — Orchestrator Verification

- [x] 9.1 Run `wc -l src/components/TerminalWorkspacesManager.jsx` — 198 lines (≤ 300 target met)
- [x] 9.2 Run `npm test` — 418 unit tests passing (zero new failures introduced)
- [ ] 9.3 Run `npm run lint` — MUST pass with ESLint import-direction zones clean (ESLint zones not yet configured)
- [x] 9.4 Code review: orchestrator contains imports, props destructure, root useState, remaining useState, effects, 3 hook calls, and JSX assembly
- [x] 9.5 Finalize `index.js` barrel — all public exports present, internal utils NOT exported
