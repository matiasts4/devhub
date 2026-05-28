# Design: Swarm Reliability Phase 1

## Technical Approach

Three independent reliability fixes applied in sequence: (1) add SQLite backing to SwarmQueue for crash durability, (2) enforce CWD in agent launch wrapper with defense-in-depth, (3) merge duplicated DB modules by converting `core.js` to a thin re-export shim. Each change is independently revertible and independently testable.

---

## Architecture Decisions

### Decision: Durable Queue Strategy

| Option                                   | Tradeoff                                        | Decision   |
| ---------------------------------------- | ----------------------------------------------- | ---------- |
| Pure in-memory (current)                 | Fast, zero durability                           | Rejected   |
| Pure SQLite                              | Durable, slower per op                          | Rejected   |
| Hybrid: in-memory cache + SQLite backing | Fast reads, durable writes, recovery on startup | **Chosen** |

**Rationale**: SwarmQueue resolves/reject callbacks can't be persisted (Promises are not serializable). The hybrid approach keeps the hot path in-memory for sub-ms dequeue, persists enqueue/ack to SQLite for crash recovery, and recreates fresh Promises on recovery. The existing `DbWriteQueue` pattern serializes SQLite writes — we reuse `withDbWriteQueue` for the durable path.

### Decision: CWD Enforcement Method

| Option                      | Tradeoff                                 | Decision   |
| --------------------------- | ---------------------------------------- | ---------- |
| `cd` only in wrapper        | Single point of failure                  | Rejected   |
| tmux `-c` only              | tmux may ignore on some versions         | Rejected   |
| `cd` in wrapper + tmux `-c` | Defense in depth, two independent layers | **Chosen** |

**Rationale**: The exploration confirmed `ttyServer.js` already handles CWD correctly via PTY spawn `cwd` option. The gap is ONLY in `buildAgentLaunchWrapper` — it sets `DEVHUB_WORKSPACE_PATH` env and checks `pwd` but never `cd`s. Adding `cd` before the agent starts AND passing `-c 'cd ...'` to tmux provides two independent guarantees.

### Decision: DB Module Merge Strategy

| Option                                    | Tradeoff                               | Decision   |
| ----------------------------------------- | -------------------------------------- | ---------- |
| Delete core.js, update all imports        | 25+ files to touch, high risk          | Rejected   |
| core.js → thin re-export shim (<20 lines) | Zero import breakage, instant rollback | **Chosen** |

**Rationale**: 25 internal files import from `./core`, 1 external file imports from `@/lib/db/core`, and `index.js` spreads `require('./core')`. A thin shim that re-exports from `localDb.js` preserves all paths with zero risk. `localDb.js` has recovery logic (backup detection, WAL cleanup) that `core.js` lacks — it must be canonical.

---

## Data Flow

### Durable Queue: Enqueue → Process → Ack

```
HTTP/API ──→ SwarmQueue.enqueue(item)
                   │
                   ├─── In-memory: push to this.queue[]
                   │     with fresh Promise (resolve/reject)
                   │
                   └─── SQLite: INSERT swarm_queue_items
                         via withDbWriteQueue()

Poll loop (500ms) ──→ _poll()
                   │
                   ├─── Check: activeCount < maxConcurrent?
                   │     NO → skip
                   │     YES → shift from this.queue[]
                   │
                   └─── Resolve Promise → caller proceeds
                         SQLite: UPDATE status='dequeued'

Crash Recovery ──→ recoverFromDb()
                   │
                   └─── SELECT * WHERE status='queued' AND enqueued_at > (now - 5min)
                         Re-populate in-memory queue with fresh Promises
```

### Agent Launch: Explicit CWD

```
buildLaunchCommand(programId, prompt, roleKey, modelId, launchId, workspacePath)
  │
  ├─── buildAgentLaunchCommand(programId, prompt, {..., tmuxSessionName})
  │     │
  │     └─── buildTmuxWrappedCommand(innerCommand, tmuxSessionName)
  │           │  BEFORE: tmux new-session ... '{innerCommand}'
  │           │  AFTER:  tmux new-session ... 'cd {workspacePath}; {innerCommand}'
  │
  └─── buildAgentLaunchWrapper({...workspacePath, innerCommand})
        │  BEFORE: # env exports, pwd check, innerCommand
        │  AFTER:  # env exports, cd {workspacePath}, pwd check, innerCommand
        │
        └─── Result: agent starts in correct directory
              (two layers: cd in wrapper, cd in tmux -c)
```

---

## File Changes

| File                                 | Action | Description                                                                                                                              |
| ------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/swarm/queue.js`             | Modify | Add `enqueueToDb()`, `ackDequeue()`, `recoverFromDb()`, `removeFromDb()` methods; update `enqueue()` and `_poll()` to use SQLite backing |
| `src/lib/db/localDb.js`              | Modify | Add `swarm_queue_items` table to `ensureRuntimeSchema()`                                                                                 |
| `src/lib/db/core.js`                 | Modify | Replace entire file with thin re-export shim that delegates to `localDb.js`                                                              |
| `src/lib/agentLaunchWrapper.js`      | Modify | Add `cd {workspacePath}` before identity verification block                                                                              |
| `src/lib/agentLaunchCommand.js`      | Modify | Add `cd {workspacePath};` prefix to `innerCommand` in `buildTmuxWrappedCommand`                                                          |
| `src/lib/swarm/queue.test.js`        | Create | Unit tests for durable queue operations                                                                                                  |
| `src/lib/agentLaunchWrapper.test.js` | Create | Unit tests for CWD enforcement in wrapper and tmux                                                                                       |
| `src/lib/db/core.test.js`            | Modify | Update to import from localDb via shim, verify re-exports work                                                                           |

---

## Interfaces / Contracts

### swarm_queue_items Table

```sql
CREATE TABLE IF NOT EXISTS swarm_queue_items (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,            -- JSON-serialized launch request
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued', 'dequeued', 'acknowledged', 'cancelled')),
  enqueued_at TEXT NOT NULL DEFAULT (datetime('now')),
  dequeued_at TEXT,
  acknowledged_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_swarm_queue_status
  ON swarm_queue_items(status, enqueued_at ASC);
CREATE INDEX IF NOT EXISTS idx_swarm_queue_enqueued
  ON swarm_queue_items(enqueued_at DESC);
```

### SwarmQueue Public API Additions

```js
class SwarmQueue {
  // Existing (unchanged signatures)
  enqueue(item)           // Returns Promise — now also persists to SQLite
  getQueueLength()        // In-memory count
  getPosition(itemId)     // In-memory position
  getStatus()             // Queue status
  remove(itemId)          // Cancel — now also marks cancelled in SQLite
  start()                 // Start poll loop
  stop()                  // Stop poll loop

  // New
  recoverFromDb()         // Recover stale items from SQLite on startup
}
```

### buildAgentLaunchWrapper Addition

```js
// New parameter: workspacePath (already present, just now used for cd)
// Added line in generated script:
//   cd "${workspacePath}"
// Before the identity verification block
```

### buildTmuxWrappedCommand Change

```js
// BEFORE:
tmux new-session -A -d -s "${name}" '${innerCommand}'

// AFTER:
tmux new-session -A -d -s "${name}" 'cd ${workspacePath}; ${innerCommand}'
// workspacePath is a new parameter
```

### core.js Re-export Shim

```js
// src/lib/db/core.js — thin re-export shim
'use strict';
module.exports = require('./localDb');
```

---

## Testing Strategy

| Layer           | What                                               | Approach                                                                                                                        |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**        | SwarmQueue enqueue/dequeue/ack with SQLite backing | Fresh in-memory DB; enqueue item, verify DB row; dequeue, verify status; crash simulation: stop queue, recover, verify re-queue |
| **Unit**        | SwarmQueue recovery: 5-min staleness filter        | Insert old item (>5min) + recent item; recover; verify only recent item recovered                                               |
| **Unit**        | SwarmQueue cancel with DB removal                  | Enqueue, cancel by ID; verify DB row status='cancelled'                                                                         |
| **Unit**        | buildAgentLaunchWrapper with cd                    | Snapshot test: verify `cd "${workspacePath}"` line appears before identity check                                                |
| **Unit**        | buildTmuxWrappedCommand with -c                    | Verify generated command includes `cd /path;` prefix                                                                            |
| **Unit**        | core.js re-export shim                             | `require('./core')` returns same objects as `require('./localDb')` — key spot checks: `getDb`, `ensureRuntimeSchema`, `tables`  |
| **Integration** | Full launch flow with CWD                          | Run `buildLaunchCommand`, extract shell output, verify cd appears twice (wrapper + tmux)                                        |
| **Integration** | Queue round-trip with real SQLite                  | Enqueue via API, simulate concurrency limit, verify dequeue on slot available                                                   |

---

## Migration / Rollout

### Step 1: swarm_queue_items Table (localDb.js)

Add `CREATE TABLE IF NOT EXISTS swarm_queue_items (...)` to `ensureRuntimeSchema()` in `localDb.js`. Idempotent — `IF NOT EXISTS` makes it safe for existing databases. No data migration needed.

### Step 2: SwarmQueue Durability

Modify `queue.js` to use `withDbWriteQueue` for all SQLite operations. On module load, call `recoverFromDb()` to restore any stale queued items. No data migration — in-memory-only queue state is ephemeral by design.

### Step 3: CWD Enforcement

Add `cd` to `buildAgentLaunchWrapper` and `-c` to `buildTmuxWrappedCommand`. These are additive changes — no data migration, no breaking API changes. The `workspacePath` parameter already exists in both functions.

### Step 4: core.js → Shim

Replace `core.js` content with `module.exports = require('./localDb')`. All 25+ import paths continue to work unchanged. `index.js` spreads `require('./core')` which now spreads `require('./localDb')`. The 1 external import (`swarm/processes/route.js`) imports `getDb` — now resolves to `localDb.js`'s `getDb`.

**Rollback**: Revert commit restores old `core.js` content. Zero data migration.

---

## Open Questions

- None. All three changes have clear, independent implementation paths with no ambiguity.
