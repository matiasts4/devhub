# Exploration: swarm-reliability-phase1

## Current State

### Gap 1: In-Memory SwarmQueue

`src/lib/swarm/queue.js` (`SwarmQueue`) is a pure in-memory queue. It stores pending agent launch requests in a JS `Array` with `resolve`/`reject` promise callbacks. On process restart, all queued items are lost. The queue polls every 500ms to check if a slot opened, but the queue state itself is ephemeral.

Existing pattern: `src/lib/db/writeQueue.js` (`DbWriteQueue`) serializes SQLite writes through an in-memory queue with timeout protection — but it doesn't persist queue state either. It uses `getDb()` from `localDb.js`.

The database already has a `swarm_processes` table that tracks running swarm agent processes (id, pid, port, status, cwd, timestamps), but there's no table for pending/queued launch requests.

### Gap 2: Missing Explicit `cd` in Agent Launch

The CWD chain works as follows:

1. **Build time** (`route.js` lines ~600-621): `runtime_requests` includes `workspacePath` (the git worktree path) and `isSwarmRole: true`.
2. **Frontend dispatch** (`TerminalWorkspacesManager.jsx` line 1629-1630): `devhub:run-agent` CustomEvent fires with the request detail, which includes `workspacePath`.
3. **Agent wrapper** (`agentLaunchWrapper.js`): `buildAgentLaunchWrapper()` sets env vars (`DEVHUB_WORKSPACE_PATH`) and includes an identity verification block that checks `pwd` matches `workspacePath` and exits if wrong — but does NOT include an explicit `cd "${workspacePath}"` command before the inner command.
4. **tmux wrapping** (`agentLaunchCommand.js`): `buildTmuxWrappedCommand()` does `tmux new-session -A -d -s "${tmuxSessionName}" '${innerCommand}'` — no `-c` flag for cwd.
5. **PTY spawn** (`ttyServer.js`): `buildSessionSpawnConfig()` adds `DEVHUB_PROJECT_DIR: cwd` to env, and for tmux sessions, uses `tmux new-session -A -s ${session} -c ${escapeShellArg(cwd)}` — but this is the terminal/websocket session CWD, not the swarm agent CWD.
6. **cwdGuard.js**: `validateSwarmCwd()` validates that swarm roles MUST be under `.devhub/worktrees`, but this validation only runs at PTY creation time for the terminal session.

The gap: `buildAgentLaunchWrapper()` in `agentLaunchWrapper.js` produces a shell script that sets env vars and verifies CWD but never actually `cd`s to the worktree. If the PTY starts in a different directory (e.g., home or project root), the identity check would fail and the agent would exit with error — or worse, if the check is bypassed, the agent operates in the wrong directory.

Additionally, `buildLaunchCommand()` in `route.js` line 122-137 builds the command but passes `workspacePath` to `buildAgentLaunchWrapper` which only uses it for env vars and identity check, not for `cd`.

### Gap 3: DB Module Duplication

Two nearly identical modules:

- **`src/lib/db/core.js`** (~1430 lines): `getDb()`, `ensureRuntimeSchema()`, `closeDb()`, query builders, table ops factory, constants, `LocalQuery` class, `resolveDbArgs`, `deleteProjectCascadeUnsafe`.
- **`src/lib/db/localDb.js`** (~3901 lines): Everything in `core.js` PLUS all domain-specific operations (workspaces, runs, artifacts, missions, presence, supervisor, telegram, swarm config, sessions, traces, etc.).

Both files:

- Define their own `_db` singleton variable
- Both call `resolveDbPath()` to get the same DB file path
- Both call `ensureRuntimeSchema()` with virtually identical CREATE TABLE statements (~910 lines each, near-identical)
- Both define identical constant arrays (`AGENT_WORKSPACE_TERMINAL_STATUSES`, `AGENT_WORKSPACE_BASE_COMMIT`, `AGENT_WORKSPACE_ACTIVE_LOCK_STATUSES`, all supervisor/telegram/swarm constants)
- Both have `getDb()`, `closeDb()`, `buildSelectQuery()`, `buildWhere()`, `makeTableOps()`, `resolveDbArgs()`

`localDb.js` adds: recovery logic (backup + WAL cleanup on startup), domain operations, and the `tables` registry.

The duplication means: any schema change must be applied in TWO places. Both `_db` singletons point to the same SQLite file, creating a potential double-initialization race.

## Affected Areas

- `src/lib/swarm/queue.js` — current in-memory queue (entire file replaced)
- `src/lib/db/writeQueue.js` — existing write queue pattern (reference for durability approach)
- `src/lib/db/core.js` — duplicated module #1 (removed or demoted to thin re-export)
- `src/lib/db/localDb.js` — duplicated module #2 (becomes the single source of truth)
- `src/lib/db/walCheckpoint.js` — WAL management (reference for durability context)
- `src/lib/db/compactReads.js` — uses `getDb()` from `core.js` (import path changes)
- `src/lib/agentLaunchWrapper.js` — needs `cd` command insertion
- `src/lib/agentLaunchCommand.js` — tmux session CWD flag (minor)
- `src/lib/terminal/ttyServer.js` — PTY spawn with CWD (reference, already correct)
- `src/lib/terminal/cwdGuard.js` — validation logic (reference, already correct)
- `src/app/api/agenthub/operations/health/route.js` — imports from both `core.js` and `localDb.js`
- All files importing from `@/lib/db/core.js` or `@/lib/db/localDb.js` — import path changes

## Approaches

### 1. Durable Queue

#### 1A: New SQLite Table for Queue Items + In-Memory Queue Hybrid

- **Description**: Add a `swarm_queue_items` table to the schema. On `enqueue()`, write the item to the table (status: `pending`). On dequeue, update status to `processing` then resolve. On startup, recover any `pending` items and re-enqueue them in memory.
- **Pros**: Durable across restarts; leverages existing SQLite infrastructure; easy to query queue status from the dashboard; consistent with the project's local-first architecture.
- **Cons**: Adds migration work; slight write overhead per enqueue (acceptable for launch events); need to handle orphan `processing` items on crash recovery.
- **Effort**: Medium

#### 1B: Extend writeQueue.js Pattern for Durable Buffering

- **Description**: Add a `swarm_enqueued_agents` table with status lifecycle (`pending` → `dispatched` → `completed`/`cancelled`). Wire SwarmQueue to use the DB as backing store, similar to how `writeQueue.js` serializes writes.
- **Pros**: Consistent with writeQueue pattern; reuses `withDbWriteQueue` for serialized writes.
- **Cons**: Semantically different (writeQueue is about write serialization, SwarmQueue is about concurrency limiting); coupling two different concerns.
- **Effort**: Medium

#### 1C: Persistent Event Log (Write-Ahead Queue)

- **Description**: Append-only log table `swarm_queue_log` with `enqueued_at` timestamp. Processor marks rows as consumed. On restart, replay unprocessed entries.
- **Pros**: Simple append-only model; no need for status transitions.
- **Cons**: Requires compaction/gc for old entries; doesn't naturally support cancel/remove operations which the current queue already has.
- **Effort**: Medium

**Recommendation**: **Approach 1A** — New `swarm_queue_items` table with hybrid in-memory + SQLite approach. This is the cleanest integration with the existing schema, supports queue status queries from the dashboard, and handles the cancel operation that the current queue already supports. Use `withDbWriteQueue` for serialized DB writes to avoid concurrent write issues.

### 2. Explicit CWD

#### 2A: Add `cd` Command to Agent Launch Wrapper

- **Description**: Insert `cd "${workspacePath}"` as the FIRST command in `buildAgentLaunchWrapper()` before the identity verification block. This ensures the shell process is in the correct directory before any checks run.
- **Pros**: Simplest fix; works regardless of how the PTY/tmux session starts; the identity verification block then validates what actually happened.
- **Cons**: If workspacePath doesn't exist yet (worktree creation race), the cd fails and the agent exits — but this is actually correct behavior (fail-fast).
- **Effort**: Low

#### 2B: Add `-c` Flag to tmux Session in buildTmuxWrappedCommand

- **Description**: Modify `buildTmuxWrappedCommand()` to accept a `cwd` parameter and pass it as `tmux new-session -A -d -s NAME -c DIR`.
- **Pros**: Also correct at tmux level; works for non-swarm sessions too.
- **Cons**: Doesn't help when tmux is not used (raw PTY spawn); the tmux `-c` flag only applies to the tmux session, not the inner command's working directory if the inner command does its own cd.
- **Effort**: Low

#### 2C: Both 2A + 2B (Defense in Depth)

- **Description**: Add `cd` to the shell wrapper AND pass `-c` to tmux. Belt and suspenders.
- **Pros**: Maximum reliability; both levels ensure correct CWD.
- **Cons**: Minimal extra code.
- **Effort**: Low

**Recommendation**: **Approach 2C** — Both `cd` in the shell wrapper and `-c` in tmux. The cost is negligible and the reliability gain is significant. The `cd` in the wrapper is the primary defense (works in all paths), and the tmux `-c` flag is the secondary defense (sets the session's default directory for interactive shells).

### 3. DB Module Merge

#### 3A: Make localDb.js the Single Source of Truth, Re-export from core.js

- **Description**: Remove all duplicated code from `core.js`. Instead, have `core.js` re-export everything from `localDb.js`. This preserves all existing import paths (`require('./core')` and `require('./localDb')` both work).
- **Pros**: Zero import path changes; no risk of missing consumers; `core.js` becomes a thin re-export shim; immediate elimination of duplication.
- **Cons**: Two entry points for the same module forever (but this is just a naming convention issue).
- **Effort**: Low

#### 3B: Merge Everything into core.js, Update All Imports

- **Description**: Keep `core.js` as the canonical module (shorter path), move all domain operations from `localDb.js` into `core.js`, update all imports across the codebase.
- **Pros**: Single canonical module; one entry point.
- **Cons**: Many import path changes (~20+ files); high risk of missing a consumer; `core.js` becomes a 4000+ line module; the name "core" doesn't convey domain operations well.
- **Effort**: High

#### 3C: Rename/Rewire — localDb.js becomes db/index.js

- **Description**: Create `src/lib/db/index.js` that exports everything from `localDb.js`. Make `core.js` a thin re-export from `localDb.js`. Gradually migrate consumers to `@/lib/db`.
- **Pros**: Clean architecture; follows Node.js conventions.
- **Cons**: Three modules during migration; gradual path update needed.
- **Effort**: Medium

**Recommendation**: **Approach 3A** — Make `localDb.js` the single source of truth and convert `core.js` to a thin re-export shim. This is the safest, lowest-effort approach. It eliminates the duplication immediately without any import path changes. The re-export pattern is well-understood in Node.js and can be cleaned up later if desired.

## Recommendation

1. **Durable Queue**: Approach 1A — New `swarm_queue_items` table with hybrid in-memory/SQLite queue.
2. **Explicit CWD**: Approach 2C — `cd` in shell wrapper + `-c` for tmux.
3. **DB Merge**: Approach 3A — `localDb.js` as single source, `core.js` as re-export shim.

## Risks

- **Durable Queue**: Orphan `processing` items on hard crash. Mitigation: on startup, re-enqueue any `processing` items older than a staleness threshold (e.g., 5 minutes). Also, the queue currently uses Promise resolve/reject callbacks — these can't be persisted. The hybrid approach must: (a) persist item metadata to DB, (b) resolve/reject new Promises when the item is processed after recovery.
- **Explicit CWD**: Race condition if worktree path doesn't exist yet when `cd` executes. The identity verification block already handles this (exits with error), so fail-fast is the correct behavior.
- **DB Merge**: Two `_db` singletons pointing to the same file. During the merge, one must be removed. Since `localDb.js` has the recovery logic and is the larger module, it wins. The `core.js` `_db` must NOT be initialized separately — `core.js` must import `getDb` from `localDb.js`.
- **General**: The `ensureRuntimeSchema()` function is ~910 lines in each file and must be unified. ANY drift in the two copies is a silent corruption risk. The merged version must be the `localDb.js` copy since it has the recovery-friendly startup logic.
- **Schema migration**: Adding `swarm_queue_items` table requires updating both schema definitions (during merge, this becomes one). Use the existing `ALTER TABLE` pattern in `ensureRuntimeSchema()` for safety.

## Ready for Proposal

Yes — all three gaps are well-understood, the approaches are clear, and the recommendations are straightforward. The next phase (sdd-proposal) should define:

- The `swarm_queue_items` table schema and the SwarmQueue → durable backed queue migration.
- The exact `cd` insertion point in `buildAgentLaunchWrapper()` and the tmux `-c` flag addition in `buildTmuxWrappedCommand()`.
- The `core.js` → re-export shim conversion and the `localDb.js` consolidation.
