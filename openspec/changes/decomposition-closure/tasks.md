# Tasks: Decomposition Closure

## Review Workload Forecast

| Field                   | Value                        |
| ----------------------- | ---------------------------- |
| Estimated changed lines | 140-260                      |
| 400-line budget risk    | Low                          |
| Chained PRs recommended | No                           |
| Suggested split         | single PR / one local commit |
| Delivery strategy       | single-pr                    |
| Chain strategy          | pending                      |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal                                                                    | Likely PR    | Notes                                             |
| ---- | ----------------------------------------------------------------------- | ------------ | ------------------------------------------------- |
| 1    | Ship cleanup fix, focused test, and closure-doc reconciliation together | Local commit | Stay on current branch; keep tests/docs with code |

## Phase 1: Red Test + Helper Fix

- [x] 1.1 Create `src/lib/swarm/__tests__/cleanup.test.js` with RED cases for persisted `worktree_path` removal and missing-path reporting in `cleanupMissionWorktrees()`.
- [x] 1.2 Update `src/lib/swarm/cleanup.js` to pass `ws.worktree_path` to `safeRemoveWorktree()` and return per-workspace skip/not-found results required by the spec.
- [x] 1.3 Re-run `src/lib/swarm/__tests__/cleanup.test.js`; refactor fixtures/output only if needed after GREEN.

## Phase 2: Closure Docs Reconcile

- [x] 2.1 Update `docs/37_Decomposition_Closure_Checklist.md` quick path, status snapshot, and fix-now section to the verified narrow closure scope.
- [x] 2.2 Update `docs/38_MCP_Blocker_Fixes.md` and `docs/39_CLI_Gap_Fixes.md` so fixed MCP/CLI blockers read as closed or historical, not active closure work.
- [x] 2.3 Update `docs/36_CLI_Implementation_Report.md` only if targeted verification still finds an overstated CLI claim.

## Phase 3: Focused Verification

- [x] 3.1 Run targeted Jest for `src/lib/swarm/__tests__/cleanup.test.js` and `devhub-cli/commands/worktree.test.js` to confirm cleanup/worktree behavior stays aligned.
- [x] 3.2 Re-check docs `36`-`39` against current code/test evidence for boot, inbox, events, auth, task JSON, mission evidence, and worktree behavior.
- [x] 3.3 Confirm closure docs now keep follow-up limited to mission cleanup reliability plus doc reconciliation, with no broader decomposition reopen.
