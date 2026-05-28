# Decomposition Closure Checklist

This document is the closure checklist for the three decomposition workstreams.

## Quick path

1. Fix the mission cleanup helper to use persisted `worktree_path` values.
2. Re-run focused verification for cleanup plus the schema-backed worktree CLI path.
3. Keep closure follow-up limited to doc reconciliation and verified runtime facts.

## Status snapshot

| Workstream        | Status                 | Close now? | Why                                                                                                                                   |
| ----------------- | ---------------------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| DB decomposition  | Pass with warnings     |        Yes | Thin barrel works, exports are valid, targeted DB tests are green                                                                     |
| CLI enhancement   | Pass for closure scope |        Yes | `inbox`, `events`, `mission`, `task --json`, and `worktree clean` are implemented in the working tree; focused Jest coverage is green |
| MCP decomposition | Pass for closure scope |        Yes | The syntax blocker in `devhub-mcp/server.js` is gone (`node --check` passes); no new MCP closure bug was verified in this pass        |

## Fix-now checklist

### Mission cleanup reliability

- [x] Use persisted `worktree_path` inside `cleanupMissionWorktrees()`
- [x] Report workspaces with missing `worktree_path` instead of skipping them silently
- [x] Add focused regression coverage for both paths

### Closure docs

- [x] Remove stale MCP blocker language from the closure checklist
- [x] Remove stale CLI blocker language from the closure checklist
- [x] Keep remaining follow-up constrained to verified cleanup/doc work only

### Verified but out of scope here

- `devhub-mcp/server.js` broader runtime smoke beyond syntax validation
- `devhub-cli/commands/auth.test.js` expectation drift (`readAuthFile()` now returns a `source` field)
- Additional DB cleanup warnings that did not block the closure scenarios

## Defer candidates

These are real warnings, but they do not currently block closure:

- Further slimming `devhub-mcp/server.js`
- Refactoring `src/lib/db/tasks.js` to remove `...supervisor` spread
- Updating stale tests that still assert pre-fix auth output shapes

## Verification commands

```bash
npm test -- --runInBand src/lib/swarm/__tests__/cleanup.test.js devhub-cli/commands/worktree.test.js
npm test -- --runInBand devhub-cli/commands/inbox.test.js devhub-cli/commands/events.test.js devhub-cli/commands/mission.test.js devhub-cli/commands/task.test.js
node --check "devhub-mcp/server.js"
```

## Next step

Use `docs/38_MCP_Blocker_Fixes.md` and `docs/39_CLI_Gap_Fixes.md` as historical closure notes, not as broad fix-now plans.
