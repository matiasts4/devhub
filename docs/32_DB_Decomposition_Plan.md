# 32 — DB Module Decomposition Plan

## Problem

`src/lib/db/localDb.js` is 4,367 lines with 142+ exported symbols mixing all domains. `ensureRuntimeSchema()` and `devhub-mcp/server.js`'s `ensureLocalMcpTables()` duplicate schema definitions. `src/lib/db/core.js` is already a thin 11-line re-export shim.

## Current State

- `localDb.js`: 4,367 lines, 142+ symbols
- `core.js`: 11-line shim (already cleaned in Phase 1)
- `writeQueue.js`, `walCheckpoint.js`: Separate, OK
- `compactReads.js`: Separate, OK
- Schema defined in TWO places: `localDb.js` `ensureRuntimeSchema()` + `devhub-mcp/server.js` `ensureLocalMcpTables()`

## Schema Duplication Problem

`ensureRuntimeSchema()` creates all tables for the Next.js API routes.
`ensureLocalMcpTables()` creates MCP-specific tables (tasks, milestones, projects, comments, dependencies) that overlap with some tables in `ensureRuntimeSchema`.

Both paths MUST create the same tables with the same columns. Currently they drift — a risk.

## Target Architecture

```
src/lib/db/
  localDb.js              ← Thin barrel re-export (~80 lines)
  schema.js               ← Single source of truth: ensureAllSchema(db) (~500L)
  projects.js             ← Project + milestone CRUD (~400L)
  tasks.js                ← Task CRUD + history + queue + claims (~500L)
  workspaces.js           ← Workspace lifecycle + runs + artifacts + evidence + PTY + auth (~600L)
  swarm.js                ← Missions + participants + messages + deliveries + presence + events (~500L)
  inbox.js                ← Operator inbox + task history (~200L)
  core.js                 ← Existing shim (unchanged)
  writeQueue.js           ← Existing (unchanged)
  walCheckpoint.js        ← Existing (unchanged)
  compactReads.js         ← Existing (unchanged)
```

## Module Contract

```js
// src/lib/db/projects.js
export function createProject(db, data) { ... }
export function listProjects(db, opts) { ... }
export function getProject(db, id) { ... }
// etc.
```

`localDb.js` becomes:

```js
export { ensureAllSchema } from './schema.js';
export { createProject, listProjects, getProject, updateProject, deleteProject, ... } from './projects.js';
export { createTask, listTasks, updateTask, bulkCreateTasks, ... } from './tasks.js';
export { prepareAgentWorkspaceLease, createWorkspace, ... } from './workspaces.js';
export { createSwarmMission, ... } from './swarm.js';
export { recordInboxItem, queryOperatorInbox, ... } from './inbox.js';
// Re-export from unchanged modules
export { getDb } from './core.js';
export { withDbWriteQueue } from './writeQueue.js';
```

## Schema Unification

```js
// src/lib/db/schema.js
export function ensureAllSchema(db) {
  ensureRuntimeSchema(db); // All swarm + workspace + event tables

  // MCP tables (safe to call idempotently with IF NOT EXISTS)
  ensureMcpTables(db);
}
```

`devhub-mcp/server.js` calls `ensureAllSchema(db)` instead of its own `ensureLocalMcpTables()`. One source of truth.

## Execution Order

1. **Create `schema.js`** — extract `ensureRuntimeSchema()` + `ensureMcpTables()` into one function
2. **Create `projects.js`** — move project/milestone domain ops
3. **Create `tasks.js`** — move task/history/queue domain ops
4. **Create `workspaces.js`** — move workspace/run/artifact/evidence/PTY/auth ops
5. **Create `swarm.js`** — move mission/participant/message/delivery/presence/event ops
6. **Create `inbox.js`** — move inbox + task history ops
7. **Convert `localDb.js`** to thin barrel re-export
8. **Update `devhub-mcp/server.js`** to import from new domain modules + call `ensureAllSchema()`
9. **Update all imports** across the codebase (API routes, tests, swarm modules)
10. **Run full test suite**

## Import Migration Strategy

Two approaches:

### A. Keep `localDb.js` as barrel (RECOMMENDED)

- All existing imports `from '@/lib/db/localDb.js'` continue to work
- `localDb.js` re-exports everything from domain modules
- Zero import changes needed in consumer code
- Clean migration, no breakage risk

### B. Direct imports (future optimization)

- Change imports to `from '@/lib/db/projects.js'` etc.
- More explicit dependency graph
- Higher migration cost, more risk
- Can be done later as a separate optimization

**Go with A** for this refactor. B can be a future cleanup.

## Estimated Reduction

- Current: 4,367 lines in localDb.js
- Target: ~80 lines barrel + ~2,200 lines across 6 modules
- Each module: ~200-600 lines (reviewable, testable)
