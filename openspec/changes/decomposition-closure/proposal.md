# Proposal: Decomposition Closure

## Intent

Close the last verified decomposition follow-up without reopening broad redesign. Current evidence shows one live runtime bug in mission cleanup (`ws.worktreePath` vs `ws.worktree_path`) plus stale closure docs that still report CLI/MCP blockers already fixed in the working tree.

## Scope

### In Scope

- Fix `cleanupMissionWorktrees()` to pass `ws.worktree_path` to `safeRemoveWorktree()`.
- Add or adjust focused verification for the mission cleanup path.
- Reconcile closure docs/reports/checklists (`docs/36`-`39`) to match verified repo reality.

### Out of Scope

- New DB decomposition work or schema redesign.
- MCP bootstrap, Telegram lazy-loading, or CLI surface redesign unless verification proves a blocker.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None.

## Approach

Patch the cleanup typo first, then verify the already-landed CLI/MCP fixes still hold, and finally update closure docs so they describe actual runtime status instead of outdated planned blockers.

## Affected Areas

| Area                                         | Impact   | Description                                                      |
| -------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `src/lib/swarm/cleanup.js`                   | Modified | Fix mission cleanup to use the persisted `worktree_path` field   |
| `src/lib/swarm/__tests__/`                   | Modified | Add regression coverage or focused verification for cleanup path |
| `docs/36_CLI_Implementation_Report.md`       | Modified | Align closure report with verified CLI state                     |
| `docs/37_Decomposition_Closure_Checklist.md` | Modified | Remove stale blocker claims and update close-now status          |
| `docs/38_MCP_Blocker_Fixes.md`               | Modified | Downgrade fixed MCP blocker items to reality-based notes         |
| `docs/39_CLI_Gap_Fixes.md`                   | Modified | Downgrade fixed CLI blocker items to remaining true gaps only    |

## Risks

| Risk                                      | Likelihood | Mitigation                                               |
| ----------------------------------------- | ---------- | -------------------------------------------------------- |
| Docs over-close unresolved work           | Med        | Tie every doc change to verified code or targeted checks |
| Mission cleanup bug lacks direct coverage | Med        | Add focused regression verification before closing       |

## Rollback Plan

Revert the cleanup fix and doc reconciliation commit together. If verification exposes a broader defect, keep docs truthful and spin a separate change instead of expanding this one.

## Dependencies

- Current working-tree CLI/MCP fixes remain intact during reconciliation.

## Success Criteria

- [ ] Mission cleanup no longer passes an undefined worktree path to `safeRemoveWorktree()`.
- [ ] Focused verification covers the mission cleanup regression.
- [ ] Docs `36`-`39` match verified repo reality and stop claiming stale MCP/CLI blockers.
- [ ] No new DB/CLI/MCP redesign scope is introduced without fresh evidence.
