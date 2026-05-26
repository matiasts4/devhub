# Apply Progress: Swarm Binding CLI Alignment

Artifact repair only. No implementation scope expansion. No commits.

## Quick path

1. Re-read change artifacts and specs.
2. Reconstruct completed strict-TDD apply evidence from the finished implementation run.
3. Persist the missing durable `apply-progress` artifact for OpenSpec + Engram.

## Status

- Apply state: complete
- Repair scope: strict-TDD evidence artifact only
- Code scope: unchanged from prior apply batch
- Verify note: prior `verify-report.md` failure was caused by missing durable TDD evidence, not failing code/tests

## Completed Tasks

- [x] 1.1 Add failing reconciliation tests in `src/lib/db/workspaces.test.js` for verified write, missing stays missing, and mismatched workspace/run/session refusal.
- [x] 1.2 Add failing binding classification cases in `src/lib/db/swarmMissions.test.js` for `binding_stale` and `binding_orphaned` after durable lookup.
- [x] 1.3 Add failing route flow coverage in `tests/agenthub/api/operations-health.test.js` and new `src/app/api/agenthub/sessions/[sessionId]/binding/route.test.js` for canonical session reconciliation.
- [x] 2.1 Implement `reconcileAgentRuntimeSessionBinding` in `src/lib/db/workspaces.js`; export via `src/lib/db/localDb.js`; keep `src/lib/db/observability.js` as low-level writer only.
- [x] 2.2 Update `src/app/api/agenthub/operations/health/route.js` to stop seeding guessed `opencode_session_id` and create `src/app/api/agenthub/sessions/[sessionId]/binding/route.js` for verified writes.
- [x] 2.3 Update `src/components/TerminalWorkspacesManager.jsx` to keep `workspaceId/runId/sessionId` per launched panel and POST detected OpenCode ids once binding is verified.
- [x] 2.4 Tighten `src/lib/db/swarmMissions.js` so bound/stale/orphaned mission delivery reads come only from reconciled durable state.
- [x] 3.1 Add failing reader/command tests in `src/lib/db/compactReads.test.js` and `devhub-cli/commands/mission.test.js` for canonical participant diagnosis and unknown-mission not-found output.
- [x] 3.2 Add mission diagnostic read helper in `src/lib/db/compactReads.js`, re-export from `devhub-cli/lib/db.js`, and switch `devhub-cli/commands/mission.js` status read path; keep `mission close` unchanged.
- [x] 4.1 Add failing reader/command tests in `src/lib/db/compactReads.test.js` and `devhub-cli/commands/worktree.test.js` for durable evidence summary, orphaned status, and JSON list/status output.
- [x] 4.2 Add workspace diagnostic readers in `src/lib/db/compactReads.js` and switch `devhub-cli/commands/worktree.js` list/status paths; keep `worktree clean` untouched.
- [x] 5.1 Run focused Jest suites for DB binding, binding route/health integration, `TerminalWorkspacesManager`, and CLI mission/worktree commands; confirm RED→GREEN progression.
- [x] 5.2 Check `git diff --stat`, update `tasks.md`, and keep the batch inside the narrow reconciliation/read-alignment scope.

## Focused Files Changed

| File                                                                 | Action   | What Was Done                                                                                                               |
| -------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/db/workspaces.js`                                           | Modified | Added canonical runtime/session reconciliation helper that validates workspace → latest run → session before durable write. |
| `src/lib/db/localDb.js`                                              | Modified | Re-exported reconciliation helper for route/tests.                                                                          |
| `src/lib/db/swarmMissions.js`                                        | Modified | Added durable mission diagnostic summary and kept canonical `bound` / `stale` / `orphaned` classification behavior.         |
| `src/lib/db/compactReads.js`                                         | Modified | Added shared mission/worktree diagnostic readers consumed by CLI reads.                                                     |
| `src/app/api/agenthub/operations/health/route.js`                    | Modified | Launch now creates canonical session rows with `opencode_session_id = null`.                                                |
| `src/app/api/agenthub/sessions/[sessionId]/binding/route.js`         | Created  | Added verified binding POST route that delegates to the shared reconciliation helper.                                       |
| `src/components/TerminalWorkspacesManager.jsx`                       | Modified | Persisted `workspaceId/runId/sessionId` per swarm-launched panel and POSTed verified OpenCode ids after detection.          |
| `devhub-cli/lib/db.js`                                               | Modified | Re-exported shared compact readers for CLI usage.                                                                           |
| `devhub-cli/commands/mission.js`                                     | Modified | Switched mission status/list diagnosis reads to shared durable readers; left close path unchanged.                          |
| `devhub-cli/commands/worktree.js`                                    | Modified | Switched worktree list/status diagnosis reads to shared durable readers; left clean path unchanged.                         |
| `src/lib/db/workspaces.test.js`                                      | Modified | Added RED→GREEN reconciliation coverage.                                                                                    |
| `src/lib/db/swarmMissions.test.js`                                   | Modified | Added stale/orphaned canonical binding coverage.                                                                            |
| `src/lib/db/compactReads.test.js`                                    | Modified | Added shared mission/worktree reader coverage.                                                                              |
| `devhub-cli/commands/mission.test.js`                                | Modified | Added canonical mission diagnosis JSON/not-found coverage.                                                                  |
| `devhub-cli/commands/worktree.test.js`                               | Modified | Added canonical workspace diagnosis JSON coverage.                                                                          |
| `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx` | Modified | Added verified binding POST-on-detection coverage.                                                                          |
| `src/app/api/agenthub/sessions/[sessionId]/binding/route.test.js`    | Created  | Added route contract coverage for verified binding writes.                                                                  |
| `tests/agenthub/api/operations-health.test.js`                       | Modified | Asserted launch no longer seeds guessed canonical OpenCode session ids.                                                     |
| `openspec/changes/swarm-binding-cli-alignment/tasks.md`              | Modified | Marked all assigned tasks complete.                                                                                         |
| `openspec/changes/swarm-binding-cli-alignment/apply-progress.md`     | Created  | Durable strict-TDD evidence artifact repair for verify.                                                                     |

## Focused Test Commands And Results

### Safety Net Baseline

```bash
npm test -- --runTestsByPath "src/lib/db/workspaces.test.js" "src/lib/db/swarmMissions.test.js" "src/lib/db/compactReads.test.js" "devhub-cli/commands/mission.test.js" "devhub-cli/commands/worktree.test.js" "tests/agenthub/api/operations-health.test.js" "src/app/api/agenthub/operations/health/__tests__/launchSwarmWorktree.test.js"
```

**Result**: Passed before new RED additions. Known warning only: `jest-haste-map` naming collision noise from `.worktrees/swarm/...` package manifests.

### RED Confirmation

```bash
npm test -- --runTestsByPath "src/lib/db/workspaces.test.js" "src/lib/db/swarmMissions.test.js" "src/lib/db/compactReads.test.js" "devhub-cli/commands/mission.test.js" "devhub-cli/commands/worktree.test.js" "src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx" "src/app/api/agenthub/sessions/[sessionId]/binding/route.test.js" "tests/agenthub/api/operations-health.test.js"
```

**Result**: RED confirmed expected missing implementation gaps.

- 8 suites failed
- 15 tests failed
- 75 tests passed
- 90 total
- Failure reasons matched missing helper/reader/route/launch-metadata behavior

### Targeted GREEN Check During Repair

```bash
npm test -- --runTestsByPath "src/lib/db/workspaces.test.js" "src/lib/db/compactReads.test.js" "devhub-cli/commands/worktree.test.js"
```

**Result**: PASS

- 3 suites passed
- 19 tests passed

### Final Focused GREEN Verification

```bash
npm test -- --runTestsByPath "src/lib/db/workspaces.test.js" "src/lib/db/swarmMissions.test.js" "src/lib/db/compactReads.test.js" "devhub-cli/commands/mission.test.js" "devhub-cli/commands/worktree.test.js" "src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx" "src/app/api/agenthub/sessions/[sessionId]/binding/route.test.js" "tests/agenthub/api/operations-health.test.js"
```

**Result**: PASS

- 8 suites passed
- 90 tests passed
- 90 total
- Known warnings remained: React test-harness prop warnings and runtime `ps aux` scan noise in operations health tests

## Strict TDD Cycle Evidence

| Task | Test File                                                                                                         | Layer              | Safety Net                                                       | RED                                                                                            | GREEN                                                          | REFACTOR                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1.1  | `src/lib/db/workspaces.test.js`                                                                                   | Unit               | ✅ Baseline command passed before new RED additions              | ✅ Added failing tests for verified write, missing stays missing, mismatched chain refusal     | ✅ Passed in final focused suite                               | ✅ Helper kept narrow in `workspaces.js`; no extra behavior added            |
| 1.2  | `src/lib/db/swarmMissions.test.js`                                                                                | Unit               | ✅ Baseline command passed                                       | ✅ Added failing `binding_stale` and `binding_orphaned` cases                                  | ✅ Passed in final focused suite                               | ✅ Classification remained on canonical durable state only                   |
| 1.3  | `src/app/api/agenthub/sessions/[sessionId]/binding/route.test.js`, `tests/agenthub/api/operations-health.test.js` | Integration        | ✅ Baseline health coverage passed before new RED                | ✅ Added failing route + launch-flow expectations                                              | ✅ Passed in final focused suite                               | ✅ Route stayed as a thin adapter to shared DB helper                        |
| 2.1  | `src/lib/db/workspaces.test.js`                                                                                   | Unit               | ✅ Same baseline as 1.1                                          | ✅ Existing RED from 1.1 drove implementation                                                  | ✅ Passed after helper implementation                          | ✅ Kept `observability.updateSessionOpenCodeId` as low-level writer only     |
| 2.2  | `src/app/api/agenthub/sessions/[sessionId]/binding/route.test.js`, `tests/agenthub/api/operations-health.test.js` | Integration        | ✅ Same baseline as 1.3                                          | ✅ RED expected null launch-time canonical id + verified write route                           | ✅ Passed after route/launch changes                           | ✅ No schema or broader runtime redesign                                     |
| 2.3  | `src/components/__tests__/TerminalWorkspacesManager.reopen.test.jsx`                                              | Integration        | ✅ Baseline focused suite already green before new RED additions | ✅ Added failing expectation for POSTing canonical reconciliation on detected verified session | ✅ Passed after persisting panel launch metadata + POST wiring | ✅ UI change stayed limited to swarm-launch metadata + verified binding POST |
| 2.4  | `src/lib/db/swarmMissions.test.js`, `src/lib/db/compactReads.test.js`                                             | Unit               | ✅ Baseline command passed                                       | ✅ RED required durable stale/orphaned semantics to surface from canonical state               | ✅ Passed in final focused suite                               | ✅ No bypass of `getVerifiedMissionRecipientBinding()`                       |
| 3.1  | `src/lib/db/compactReads.test.js`, `devhub-cli/commands/mission.test.js`                                          | Unit + Integration | ✅ Baseline mission/worktree suites passed before RED additions  | ✅ Added failing mission diagnostic/shared-reader and not-found JSON tests                     | ✅ Passed in final focused suite                               | ✅ Mission write path intentionally untouched                                |
| 3.2  | `src/lib/db/compactReads.test.js`, `devhub-cli/commands/mission.test.js`                                          | Unit + Integration | ✅ Same baseline as 3.1                                          | ✅ RED from 3.1 drove shared mission diagnostic helper                                         | ✅ Passed after CLI reader swap                                | ✅ Left `mission close` on existing path                                     |
| 4.1  | `src/lib/db/compactReads.test.js`, `devhub-cli/commands/worktree.test.js`                                         | Unit + Integration | ✅ Baseline mission/worktree suites passed before RED additions  | ✅ Added failing worktree evidence/orphaned/stale JSON tests                                   | ✅ Passed in targeted and final suites                         | ✅ Reader shape stayed diagnostic-only                                       |
| 4.2  | `src/lib/db/compactReads.test.js`, `devhub-cli/commands/worktree.test.js`                                         | Unit + Integration | ✅ Same baseline as 4.1                                          | ✅ RED from 4.1 drove workspace diagnostic readers                                             | ✅ Passed after CLI reader swap                                | ✅ Left `worktree clean` on existing cleanup path                            |
| 5.1  | Focused Jest commands above                                                                                       | Verification       | N/A                                                              | ✅ Verification batch defined from scoped test files                                           | ✅ Final focused suite passed 90/90                            | ➖ No refactor; verification task                                            |
| 5.2  | `git diff --stat`, `openspec/changes/swarm-binding-cli-alignment/tasks.md`                                        | Artifact / process | N/A                                                              | ✅ Diff/tasks review requirement identified                                                    | ✅ Tasks marked complete; scope remained narrow                | ➖ Artifact consistency only                                                 |

## Test Summary

- **Total passing tests in final focused suite**: 90/90
- **Focused suites passing**: 8/8
- **Layers used**: Unit + Integration
- **Approval tests**: None
- **Strict-TDD verdict**: Satisfied for the implemented scope; this artifact repair makes the evidence durable

## Deviations from Design

- None. Implementation stayed within the approved narrow scope.

## Issues Found

- `git status --short` / `git diff --stat` show many unrelated repo changes outside this change. Review evidence for this apply batch must stay scoped to the files listed above.
- Focused Jest still prints known warning noise:
  - React test-harness prop warnings in `TerminalWorkspacesManager` tests
  - runtime `ps aux` scan warnings in operations health tests
  - these warnings did not fail the scoped suites

## Remaining Tasks

- None for apply scope.
- Next expected phase is verify rerun, now that durable strict-TDD evidence exists.

## Workload / PR Boundary

- Mode: single PR current-branch flow
- Current work unit: canonical binding + mission/worktree diagnostic read alignment
- Boundary: no commits, no PR slicing, no new behavior beyond truthful artifact repair
- Review note: repo-wide working tree is noisy; this artifact documents only the scoped files and commands for `swarm-binding-cli-alignment`

## Status

13/13 assigned tasks complete. Apply artifact repaired. Ready for verify rerun.
