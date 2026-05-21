## Implementation Progress

**Change**: sw-9-3a-desktop-qa-plan-for-multi-agent-runs
**Mode**: Strict TDD

### Completed Tasks

- [x] 1.1 Add Linux QA scenario fixtures/helpers in `tests/e2e/04_swarm_control.spec.ts` (or extracted helper) for approval->closure checkpoints keyed by `scenario_id` and `QA_RUN_ID`.
- [x] 1.2 Add recovery scenario gating in `tests/e2e/04_swarm_control.spec.ts` so SW-9.1A readiness can disable deterministic recovery assertions without changing runner semantics.
- [x] 1.3 Update `playwright.config.ts` to scope output/report paths by `QA_RUN_ID` under `test-results/desktop-qa/<qa_run_id>/browser` while preserving current reporters.
- [x] 2.1 Create `scripts/qa/run-multi-agent-desktop.cjs` to stamp `qa_run_id`/`scenario_id`, invoke Playwright/native/agenthub smoke on Linux, and collect exit/status metadata per surface.
- [x] 2.2 Update `scripts/native-vte-smoke.cjs` to accept optional QA flags and emit machine-readable summary JSON with status and artifact paths.
- [x] 2.3 Update `bin/agenthub-smoke.js` to emit `qa_run_id`, `scenario_id`, surface status, and durable evidence references for approvals/runs/workspaces/recovery without copying durable payloads.
- [x] 3.1 Implement manifest builder helpers for `test-results/desktop-qa/<qa_run_id>/manifest.json` covering browser/native/headless surfaces, `durable_refs`, and `incomplete` markers.
- [x] 3.2 Wire runner and smoke outputs so partial failures still produce a manifest with explicit incomplete entries and stable `evidence_ref` links.
- [x] 3.3 Keep reporting bounded to existing Control Room/health read models in `src/lib/operations/swarmControl.js` and `src/views/SwarmControl.jsx` only if selectors/assertions need normalization for deterministic checks.
- [x] 4.1 Write Jest tests for manifest assembly, path normalization, and incomplete-marker behavior around the new runner helpers.
- [x] 4.2 Add integration coverage for agenthub/health reporting to verify durable references stay link-only and are tagged with the shared `qa_run_id`.
- [x] 4.3 Add or update Playwright coverage for the seeded approval->closure flow and gated recovery coverage, asserting shared `scenario_id` checkpoints across local and CI runs.
- [x] 4.4 Document the verification checkpoint in runner/task notes: Linux command path, expected bundle layout, and failure triage rules before marking the change ready for `sdd-apply`/`sdd-verify`.

### Files Changed

| File                                                                              | Action   | What Was Done                                                                                                                                                    |
| --------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playwright.config.ts`                                                            | Modified | Scoped browser outputDir/reporters under `test-results/desktop-qa/<qa_run_id>/browser` when `QA_RUN_ID` is set.                                                  |
| `scripts/native-vte-smoke.cjs`                                                    | Modified | Added QA flag parsing plus machine-readable summary emission.                                                                                                    |
| `bin/agenthub-smoke.js`                                                           | Modified | Added QA metadata helpers and embedded bounded durable-ref reporting in smoke output.                                                                            |
| `scripts/qa/run-multi-agent-desktop.cjs`                                          | Created  | Added thin Linux desktop QA runner, manifest assembly, durable-ref collection, and checkpoint notes.                                                             |
| `package.json`                                                                    | Modified | Added `qa:multi-agent-desktop` script.                                                                                                                           |
| `tests/unit/playwright-config.test.js`                                            | Modified | Added RED/GREEN coverage for QA-scoped Playwright paths.                                                                                                         |
| `tests/unit/native-vte-smoke.test.js`                                             | Modified | Added RED/GREEN coverage for native smoke summary output.                                                                                                        |
| `tests/unit/agenthub-smoke.test.js`                                               | Created  | Added RED/GREEN coverage for headless QA metadata helper.                                                                                                        |
| `tests/unit/multi-agent-desktop-qa-runner.test.js`                                | Created  | Added RED/GREEN coverage for manifest assembly and durable-ref collection.                                                                                       |
| `tests/unit/package-scripts.test.js`                                              | Modified | Added script coverage for the Linux desktop QA runner command.                                                                                                   |
| `tests/agenthub/api/operations-health.test.js`                                    | Modified | Added integration coverage for workspace/recovery durable refs staying link-only.                                                                                |
| `tests/e2e/04_swarm_control.spec.ts`                                              | Modified | Added deterministic QA scenario stubs keyed by `QA_RUN_ID`/`SCENARIO_ID`, recovery gating, and assertions aligned to current bounded Control Room read-model UI. |
| `openspec/changes/sw-9-3a-desktop-qa-plan-for-multi-agent-runs/tasks.md`          | Modified | Marked all SW-9.3A tasks complete.                                                                                                                               |
| `openspec/changes/sw-9-3a-desktop-qa-plan-for-multi-agent-runs/apply-progress.md` | Created  | Persisted merged apply progress for filesystem artifact parity.                                                                                                  |

### TDD Cycle Evidence

| Task                  | Test File                                          | Layer       | Safety Net                                                                                                                                                                                                                | RED                                                        | GREEN                                                                                                                                                     | TRIANGULATE                                                                    | REFACTOR                                                          |
| --------------------- | -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1.1 / 1.2 / 4.3       | `tests/e2e/04_swarm_control.spec.ts`               | E2E         | ✅ `npm test -- tests/unit/playwright-config.test.js tests/unit/native-vte-smoke.test.js tests/unit/agenthub-smoke.test.js tests/unit/multi-agent-desktop-qa-runner.test.js tests/agenthub/api/operations-health.test.js` | ✅ Written in prior batch                                  | ✅ Passed (`npm run test:e2e -- tests/e2e/04_swarm_control.spec.ts`)                                                                                      | ✅ Approval path + gated recovery path                                         | ✅ Refined locators to current UI without expanding runtime scope |
| 1.3                   | `tests/unit/playwright-config.test.js`             | Unit        | ✅ 2/2                                                                                                                                                                                                                    | ✅ Written                                                 | ✅ Passed (`npm test -- tests/unit/playwright-config.test.js`)                                                                                            | ✅ 3 cases                                                                     | ✅ Clean                                                          |
| 2.1 / 3.1 / 3.2 / 4.1 | `tests/unit/multi-agent-desktop-qa-runner.test.js` | Unit        | N/A (new)                                                                                                                                                                                                                 | ✅ Written                                                 | ✅ Passed (`npm test -- tests/unit/multi-agent-desktop-qa-runner.test.js`)                                                                                | ✅ 3 cases                                                                     | ✅ Clean                                                          |
| 2.2                   | `tests/unit/native-vte-smoke.test.js`              | Unit        | ✅ 2/2                                                                                                                                                                                                                    | ✅ Written                                                 | ✅ Passed (`npm test -- tests/unit/native-vte-smoke.test.js`)                                                                                             | ✅ 3 cases                                                                     | ✅ Clean                                                          |
| 2.3                   | `tests/unit/agenthub-smoke.test.js`                | Unit        | N/A (new)                                                                                                                                                                                                                 | ✅ Written                                                 | ✅ Passed (`npm test -- tests/unit/agenthub-smoke.test.js`)                                                                                               | ✅ 2 cases via metadata/incomplete coverage                                    | ✅ Clean                                                          |
| 4.2                   | `tests/agenthub/api/operations-health.test.js`     | Integration | ✅ 1/1                                                                                                                                                                                                                    | ✅ Written                                                 | ✅ Passed (`npm test -- tests/agenthub/api/operations-health.test.js -t "projects workspace and recovery durable refs as link-only QA evidence classes"`) | ✅ Existing timeline case + new workspace/recovery case                        | ✅ Clean                                                          |
| 3.3                   | `tests/e2e/04_swarm_control.spec.ts`               | E2E         | ✅ Same bounded safety net as above                                                                                                                                                                                       | ✅ Existing assertions constrained to read-model text only | ✅ Passed with no `src/lib/operations/swarmControl.js` / `src/views/SwarmControl.jsx` normalization required                                              | ➖ Existing approval/workspace/run selectors already cover bounded read models | ➖ No production refactor needed                                  |

### Test Summary

- **Total tests written**: 10
- **Total tests passing**: 10 targeted SW-9.3A checks/files
- **Layers used**: Unit (4 files), Integration (1 file), E2E (1 Playwright spec)
- **Approval tests**: None — additive harness/reporting change
- **Pure functions created**: 8 helper functions across runner/native/headless seams

### Deviations from Design

- None — implementation matches design. `3.3` resolved as a no-op because current Control Room selectors/read models already supported deterministic bounded assertions.

### Issues Found

- Initial resume blocker was NOT a missing Playwright browser revision. Required Chromium/headless-shell revision `1217` was already installed.
- Real blocker was stale Playwright expectations that no longer matched the current bounded Control Room UI copy.

### Remaining Tasks

- None.

### Status

13/13 tasks complete. Ready for verify.
