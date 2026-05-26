# CLI Gap Fixes

This file records the CLI closure blockers that were investigated during decomposition follow-up.

## Outcome

The previously reported CLI blockers are no longer active closure work. The command surface now matches the verified runtime behavior closely enough for this narrow closure pass.

## Quick path

1. Treat the old `events`, `inbox`, `worktree clean`, auth, and `task --json` gaps as closed unless current verification disproves them.
2. Keep verification focused on real command behavior, not historical plan drift.
3. Capture only the residual follow-up that still has fresh evidence.

## Historical blocker status

| Item                                      | Status                     | Evidence                                                                                                                  |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `events` backend route                    | Closed                     | `devhub-cli/commands/events.test.js` passes and `src/app/api/agenthub/events/route.js` has the repaired handler structure |
| `inbox` DB contract                       | Closed                     | `devhub-cli/commands/inbox.test.js` passes and `devhub-cli/commands/inbox.js` uses `queryOperatorInbox()`                 |
| `worktree clean` support                  | Closed                     | `devhub-cli/commands/worktree.test.js` passes and `devhub-cli/commands/worktree.js` calls `safeRemoveWorktree()`          |
| `DEVHUB_AGENT_TOKEN` auth support         | Closed in runtime contract | `devhub-cli/lib/auth.js` reads env credentials; one stale test still expects the pre-`source` shape                       |
| `task --json` detail output               | Closed                     | `devhub-cli/commands/task.test.js` passes and `devhub-cli/commands/task.js` emits `{ task }`                              |
| `mission close` evidence/default behavior | Closed                     | `devhub-cli/commands/mission.test.js` passes against the current backend contract                                         |

## What this closure pass verified

- [x] `events`, `inbox`, `mission`, `task`, and `worktree` targeted suites are green in the current tree
- [x] Old CLI blocker language is no longer presented as fix-now closure work
- [x] Remaining auth follow-up is test-expectation drift, not a verified runtime blocker

## Suggested verification

```bash
npm test -- --runInBand devhub-cli/commands/inbox.test.js devhub-cli/commands/events.test.js devhub-cli/commands/mission.test.js devhub-cli/commands/task.test.js devhub-cli/commands/worktree.test.js
```
