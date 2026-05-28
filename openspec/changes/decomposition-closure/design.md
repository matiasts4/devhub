# Design: decomposition-closure

## Technical Approach

Follow the exploration recommendation: close one residual runtime defect, then reconcile closure docs to code truth. The code slice is limited to `cleanupMissionWorktrees()` in `src/lib/swarm/cleanup.js`, where DB rows expose `worktree_path` but the helper forwards `ws.worktreePath`. After that fix is proven with a focused test, update the decomposition closure docs so they stop claiming MCP/CLI blockers that are already resolved and instead describe the actual post-fix state.

## Architecture Decisions

| Decision           | Options considered                                                       | Tradeoff                                                               | Choice                                                                  | Rationale                                                                               |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Fix scope          | Docs-only; code-only; code + docs                                        | Docs-only leaves latent bug. Code-only leaves stale closure narrative. | Code + docs                                                             | Smallest slice that removes the real defect and restores trustworthy closure artifacts. |
| Path resolution    | Rename DB field; add adapter layer; use canonical row field at call site | Schema/API changes are unnecessary for one bad property read.          | Pass `ws.worktree_path` (optionally with `?? ws.worktreePath` fallback) | Matches current schema and existing CLI/runtime usage without widening blast radius.    |
| Verification style | Manual spot-check only; direct helper test                               | Manual checks can miss helper-only regressions.                        | Add direct cleanup test plus targeted doc review                        | The bug lives outside `worktree clean`; it needs a dedicated test.                      |

## Data Flow

Runtime path:

    agent_workspaces row (worktree_path)
            │
            ▼
    cleanupMissionWorktrees({ repoRoot, launchId })
            │
            ▼
    safeRemoveWorktree({ repoRoot, worktreePath })
            │
            ▼
    git worktree remove / DB status update

Documentation path:

    Current repo state + targeted verification
            │
            ▼
    docs/37 + docs/38 + docs/39 reality check
            │
            ▼
    closure docs reflect implemented state

## File Changes

| File                                         | Action | Description                                                                                                     |
| -------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `src/lib/swarm/cleanup.js`                   | Modify | Correct mission cleanup to forward the schema-backed worktree path used everywhere else.                        |
| `src/lib/swarm/__tests__/cleanup.test.js`    | Create | Add a focused regression test for `cleanupMissionWorktrees()` using temp rows/directories and `dryRun + force`. |
| `docs/37_Decomposition_Closure_Checklist.md` | Modify | Replace stale “MCP fail / CLI partial” checklist items with the actual narrow closure status.                   |
| `docs/38_MCP_Blocker_Fixes.md`               | Modify | Recast prior MCP blockers as resolved/verified items unless current verification finds drift.                   |
| `docs/39_CLI_Gap_Fixes.md`                   | Modify | Recast prior CLI blockers as resolved/verified items and keep only real remaining caveats.                      |
| `docs/36_CLI_Implementation_Report.md`       | Modify | Touch only if targeted verification finds a claim that still overstates reality.                                |

## Interfaces / Contracts

No new public contract. Existing helper call stays the same; only the row-to-argument mapping is corrected.

```js
safeRemoveWorktree({ repoRoot, worktreePath: ws.worktree_path }, options);
```

Documentation contract after this change: closure docs MUST describe verified runtime state, not historical blocker lists.

## Testing Strategy

| Layer       | What to Test                                                                                   | Approach                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Unit        | `cleanupMissionWorktrees()` uses the persisted worktree path and does not throw on a valid row | New focused test with temp DB row, temp directory, and `{ dryRun: true, force: true }`                                         |
| Integration | Existing cleanup behavior remains compatible with current CLI/workspace contract               | Re-run targeted existing suite around `devhub-cli/commands/worktree.test.js` if implementation touches shared cleanup behavior |
| E2E         | None                                                                                           | Not needed for this narrow helper/doc closure                                                                                  |

## Migration / Rollout

No migration required. Ship as one local work unit on the current branch. Rollback is a direct revert of the helper fix and doc edits.

## Open Questions

- [ ] Should `docs/36_CLI_Implementation_Report.md` change, or is `docs/37-39` enough once verification is rerun?
- [ ] Is `cleanupMissionWorktrees()` currently invoked by an operator path, or is this fix closing a latent helper defect only?
