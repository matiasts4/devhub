# Proposal: Swarm Reliability Phase 1

## Intent

Fix 3 critical reliability gaps in DevHub Swarm: (1) SwarmQueue is in-memory only — all queued agent launches are lost on process restart; (2) `buildAgentLaunchWrapper()` sets env vars and validates CWD but never `cd`s to the worktree — agents can start in the wrong directory; (3) `core.js` and `localDb.js` duplicate ~95% of DB code with two `_db` singletons pointing to the same SQLite file — any schema change must be applied twice and a double-init race exists.

## Scope

### In Scope

- Durable SwarmQueue: add `swarm_queue_items` SQLite table, hybrid in-memory/DB queue with dequeue/ack/recover
- Explicit CWD: add `cd "${workspacePath}"` to `buildAgentLaunchWrapper()` + `-c` flag to `buildTmuxWrappedCommand()`
- DB module merge: convert `core.js` to thin re-export shim from `localDb.js`, eliminate duplication
- Unit tests for all changes (strict_tdd: true)

### Out of Scope

- Dashboard UI for queue state visibility
- WAL cleanup or backup logic changes
- Migration of external `@/lib/db/core` import paths (backward-compat shim preserves them)
- Queue priority ordering or scheduling policy changes

## Capabilities

### New Capabilities

- `swarm-durable-queue`: SQLite-backed queue persistence for SwarmQueue — enqueue persists to DB, dequeue marks processing, startup recovers pending items, orphan `processing` items older than staleness threshold are re-enqueued

### Modified Capabilities

- None — CWD and DB merge are implementation fixes/refactors that don't alter existing spec requirements

## Approach

**Durable Queue (1A)**: Add `swarm_queue_items` table to schema. SwarmQueue wraps in-memory Array with DB writes on enqueue/update. On startup, recover `pending` items and re-enqueue; `processing` items older than 5 min are reset to `pending`. Use `withDbWriteQueue` for serialized writes. Resolve/reject callbacks are in-memory only — recovery creates fresh Promises.

**Explicit CWD (2C)**: Insert `cd "${workspacePath}"` as the first command in `buildAgentLaunchWrapper()` before the identity check block. Pass `cwd` to `buildTmuxWrappedCommand()` for `tmux new-session -c`.

**DB Merge (3A)**: Strip all duplicated code from `core.js`. Replace with `module.exports = require('./localDb')`. All 25 internal `require('./core')` call sites continue working. Single `_db` singleton, single schema definition.

## Affected Areas

| Area                            | Impact                    | Description                                                                   |
| ------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| `src/lib/swarm/queue.js`        | Modified                  | Add DB-backed persistence layer around in-memory queue                        |
| `src/lib/db/localDb.js`         | Modified                  | Add `swarm_queue_items` table to schema, export dequeue/ack/recover functions |
| `src/lib/db/core.js`            | Modified → Re-export shim | Strip duplication, re-export from `localDb.js`                                |
| `src/lib/db/index.js`           | Modified                  | Already re-exports from `core.js` — no change needed (shim propagates)        |
| `src/lib/agentLaunchWrapper.js` | Modified                  | Add `cd` command before identity check                                        |
| `src/lib/agentLaunchCommand.js` | Modified                  | Accept `cwd` param, pass `-c` to tmux                                         |

## Risks

| Risk                                                          | Likelihood | Mitigation                                                                                        |
| ------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| Orphan `processing` items on hard crash                       | Med        | Recover items > 5 min stale on startup; Promise callbacks can't persist — recreate on recovery    |
| `core.js` re-export breaks callers expecting specific exports | Low        | Shim re-exports everything from `localDb.js` which is a superset — all existing exports preserved |
| Worktree path doesn't exist when `cd` runs                    | Low        | Agent exits with clear error — fail-fast is correct; cwdGuard already validates                   |
| Schema migration for `swarm_queue_items`                      | Low        | Use existing `ALTER TABLE` pattern in `ensureRuntimeSchema`                                       |

## Rollback Plan

Each change is independently revertible:

- **Queue**: Remove `swarm_queue_items` table from schema, revert `queue.js` to in-memory only
- **CWD**: Remove `cd` line from wrapper, remove `cwd` param from tmux builder
- **DB merge**: Restore `core.js` as full module (git revert)

## Dependencies

- `localDb.js` must remain canonical during merge — `core.js` removal must follow, not precede, re-export wiring
- Queue durability depends on `withDbWriteQueue` serialization pattern from `writeQueue.js`

## Success Criteria

- [ ] SwarmQueue survives a process restart — enqueued items are recovered
- [ ] Agents always start in the correct worktree directory
- [ ] `core.js` is < 20 lines (thin re-export shim)
- [ ] All existing tests pass after merge
- [ ] New unit tests cover: queue enqueue/dequeue/recovery, CWD enforcement, shim re-export correctness
