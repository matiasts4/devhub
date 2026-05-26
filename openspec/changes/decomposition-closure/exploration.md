# Exploration: decomposition-closure

## Current State

DB decomposition is already in place: `src/lib/db/localDb.js` is a barrel over domain modules, `src/lib/db/index.js` exists, and `ensureAllSchema` is exported. CLI decomposition gaps flagged in the checklist are mostly already closed in the working tree: `worktree clean`, inbox/operator inbox, auth env fallback, task `--json`, mission close evidence gating, and events fallback `since` all appear implemented. MCP decomposition is also structurally present: `devhub-mcp/server.js` imports split tool modules and conditionally registers Telegram tools.

One real runtime bug remains visible in current code: `src/lib/swarm/cleanup.js` calls `safeRemoveWorktree({ repoRoot, worktreePath: ws.worktreePath }, ...)` inside `cleanupMissionWorktrees()`, but the row field used everywhere else is `ws.worktree_path`. That makes mission cleanup pass `undefined` worktree paths.

## Affected Areas

- `src/lib/swarm/cleanup.js` — real cleanup bug in mission worktree removal (`worktreePath` typo)
- `devhub-cli/commands/worktree.js` — closure contract is implemented; verify only
- `devhub-cli/commands/inbox.js` — now matches `operator_inbox` / `queryOperatorInbox()`
- `devhub-cli/commands/auth.js`, `devhub-cli/lib/auth.js`, `devhub-cli/lib/httpClient.js` — env/file auth contract is now present
- `devhub-cli/commands/task.js` — `--json` contract is now real
- `devhub-cli/commands/mission.js` — close evidence gating is now aligned to backend
- `src/app/api/agenthub/events/route.js` — events backend exists; legacy fallback now has `since`
- `devhub-mcp/server.js` — no syntax blocker observed; Telegram remains conditional
- `docs/36_CLI_Implementation_Report.md`, `docs/37_Decomposition_Closure_Checklist.md`, `docs/38_MCP_Blocker_Fixes.md`, `docs/39_CLI_Gap_Fixes.md` — status docs still need final reality check

## Approaches

1. **Narrow code-only closure** — fix the cleanup typo and stop.
   - Pros: smallest safe slice, clearly under the review budget, easy to auto-verify.
   - Cons: leaves stale closure docs behind.
   - Effort: Low

2. **Code + doc reconciliation** — fix the cleanup typo and update closure docs to match current behavior.
   - Pros: closes the actual bug and removes the last misleading closure claims.
   - Cons: slightly larger diff, but still small.
   - Effort: Low

## Recommendation

Take approach 2. There is no remaining MCP/CLI decomposition blocker in the current tree that needs a broad refactor; the only concrete fix still worth doing is the `cleanupMissionWorktrees()` field typo, plus doc reconciliation so the closure record matches reality.

## Risks

- `cleanupMissionWorktrees()` is not covered by the same path as `worktree clean`, so the bug can hide unless mission cleanup is tested directly.
- `ensureAllSchema()` explicit bootstrap in MCP is still a judgment call, but it is not a current blocker.
- Docs 36–39 may still overclaim if they are not synchronized with the actual working tree.

## Ready for Proposal

Yes — but keep the change narrow: one runtime fix in `src/lib/swarm/cleanup.js` plus doc cleanup, not another decomposition pass.
