# Design: CLI Integration Tests

## Technical Approach

Build a Jest integration suite in `devhub-cli/tests/integration/` that spawns the real CLI subprocess against fresh temp SQLite databases. Each test gets its own isolated DB via `DEVHUB_DB_PATH` env var + unique UUID path. A shared seed factory creates deterministic fixtures (projects, tasks, agents, milestones, workspaces, dependencies). Tests assert exit codes, stdout/stderr content, and post-execution DB state via direct SQLite reads.

This follows the existing pattern from `commands/*.test.js` (spawnSync + direct DB seeding) but adds per-test DB isolation and multi-command workflow validation.

## Architecture Decisions

### Decision: Single file per scenario category, not one monolithic file

| Option | Tradeoff | Decision |
|--------|----------|----------|
| One file `integration.test.js` | Simpler to find, but grows to 1000+ lines, slow to run | Rejected |
| Split by category (5 files) | More files, but each focused, parallelizable, easier to debug | **Chosen** |

Five files match the 5 spec scenario categories:
- `claim-release-cycle.test.js` — happy path, paused, failed, abandoned outcomes
- `queue-ordering.test.js` — priority scores, blocked dependencies, include_blocked flag
- `agent-lifecycle.test.js` — register (DB insert) → heartbeat → claim → release → unregister (DB delete)
- `swarm-state-transitions.test.js` — workspace status transitions, agent status transitions
- `error-recovery.test.js` — expired lease, token mismatch, double-claim, unregistered claim

### Decision: Fresh temp DB per test file (beforeEach), not per individual test

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Per test (`beforeEach`) | Maximum isolation, but 70+ DB creates = slow | Rejected for simple reads |
| Per test file (`beforeAll` + `beforeEach` cleanup) | Good isolation, fewer DB creates, still safe | **Chosen** |

Each test file creates a unique temp DB in `beforeAll`. `beforeEach` wipes tables (DELETE FROM) to reset state. `afterAll` deletes the temp DB file and WAL/SHM companions. This keeps test runtime under 60s while maintaining isolation.

Exception: `error-recovery.test.js` uses per-test DB creation because lease expiration tests require controlled timestamps that conflict with other tests' seeds.

### Decision: Seed factory as shared module, not inline per file

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Inline seed functions per file | No shared module, but duplicated code | Rejected |
| Shared `tests/fixtures/seed-factory.js` | One module, all files import, schema drift caught in one place | **Chosen** |

The factory exports:
- `createTempDb()` → returns `{ dbPath, cleanup() }`
- `seedBaseline(dbPath)` → creates 2 projects, 1 milestone, 5 tasks, 2 agents
- `seedProject(dbPath, id, name)` → single project insert
- `seedTask(dbPath, id, projectId, title, status, priority, businessValue)` → single task
- `seedAgent(dbPath, agentId, projectId, status)` → single agent insert
- `seedWorkspace(dbPath, id, agentId, status, branchName)` → single workspace
- `seedDependency(dbPath, taskId, dependsOn)` → task dependency
- `readDb(dbPath, sql, params)` → direct query for assertions

Schema drift detection: factory reads `PRAGMA table_info(<table>)` before inserts. If required columns are missing, throws with descriptive error listing missing columns.

### Decision: Use `child_process.spawnSync` (not `exec`)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `exec` | Shell interpolation, simpler API | Rejected — shell adds overhead, quoting issues |
| `spawnSync` | Direct process spawn, explicit arg array, no shell | **Chosen** |

Matches existing pattern in `commands/*.test.js`. Explicit `node [CLI_BIN, ...args]` array. No shell injection risk. `encoding: 'utf8'` for stdout/stderr capture.

### Decision: Triple assertion strategy — exit code + stdout + DB state

| Layer | What | How |
|-------|------|-----|
| Exit code | Command succeeded/failed as expected | `expect(result.status).toBe(0)` or `.toBe(1)` or `.toBe(2)` |
| stdout/stderr | User-visible output matches expectation | `expect(result.stdout).toMatch(/pattern/i)` |
| DB state | Side effects persisted correctly | Direct SQLite read via `readDb(dbPath, 'SELECT ...')` |

Every integration test asserts at least exit code + one of stdout or DB state. Multi-command workflows (claim → release) assert DB state after each command.

## Data Flow

```
  Test File
     │
     ├── beforeAll: createTempDb() ──→ os.tmpdir() + UUID + ".db"
     │                                      │
     │                                      └── set DEVHUB_DB_PATH env
     │
     ├── beforeEach: seedBaseline(dbPath) ──→ projects, tasks, agents, milestone
     │
     ├── spawnSync(node, [CLI, command, args], { env: { DEVHUB_DB_PATH } })
     │                                      │
     │                                      └── CLI reads DB, executes, writes stdout
     │
     ├── assert: exit code, stdout/stderr
     │
     ├── readDb(dbPath, query) ──→ assert DB state
     │
     └── afterAll: cleanup() ──→ rm .db, .db-wal, .db-shm
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `devhub-cli/tests/integration/claim-release-cycle.test.js` | Create | Claim → release workflows with all outcomes |
| `devhub-cli/tests/integration/queue-ordering.test.js` | Create | Priority ordering, blocked dependency filtering |
| `devhub-cli/tests/integration/agent-lifecycle.test.js` | Create | Register → heartbeat → claim → release → unregister |
| `devhub-cli/tests/integration/swarm-state-transitions.test.js` | Create | Workspace and agent status transitions |
| `devhub-cli/tests/integration/error-recovery.test.js` | Create | Expired lease, token mismatch, double-claim, unregistered |
| `devhub-cli/tests/fixtures/seed-factory.js` | Create | Shared seed factory + temp DB lifecycle |
| `devhub-cli/jest.config.js` | Modify | Add `testMatch` for integration pattern or separate config |
| `devhub-cli/package.json` | Modify | Add `test:integration` script |

## Interfaces / Contracts

### Seed Factory API

```js
// tests/fixtures/seed-factory.js
const { createTempDb, seedBaseline, seedProject, seedTask, seedAgent, seedWorkspace, seedDependency, readDb, cleanupDb } = require('./seed-factory');

// Usage in test file:
const { dbPath, cleanup } = createTempDb();
try {
  seedBaseline(dbPath);
  seedTask(dbPath, 'task-1', 'proj-1', 'My task', 'pending', 'high', 8);
  
  const result = spawnSync('node', [CLI, 'claim', 'agent-1'], {
    encoding: 'utf8',
    env: { ...process.env, DEVHUB_DB_PATH: dbPath },
  });
  
  const task = readDb(dbPath, 'SELECT * FROM tasks WHERE id = ?', ['task-1']);
  expect(task.status).toBe('in_progress');
} finally {
  cleanup(dbPath);
}
```

### Fixed IDs for assertions

All seeded records use deterministic IDs so tests can assert by known values:
- Projects: `proj-alpha`, `proj-beta`
- Agents: `agent-1`, `agent-2`
- Tasks: `task-1` through `task-5`
- Milestone: `milestone-1`
- Workspaces: `ws-1`, `ws-2`

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Integration | Full CLI → DB → stdout cycle | spawnSync CLI subprocess, assert exit code + output + DB state |
| DB isolation | Each test file gets unique temp DB | `os.tmpdir()` + `crypto.randomUUID()` + `.db` |
| Schema drift | Seed factory fails on missing columns | `PRAGMA table_info` validation before inserts |
| Cleanup | No leftover DB files | `afterAll` removes `.db`, `-wal`, `-shm` |

### Test matrix per file

**claim-release-cycle.test.js** (6 tests):
- Happy path: claim → release completed → task status = completed
- Release paused → task status = paused → re-claim succeeds
- Release failed → task status = failed
- Release abandoned → task status = blocked
- Release with invalid token → rejected, task unchanged
- Release unclaimed task → rejected

**queue-ordering.test.js** (5 tests):
- 3 tasks, different priorities → returned in score order
- Blocked task excluded with `include_blocked=false`
- Blocked task included with `include_blocked=true` + blocking reason
- Empty queue → no tasks returned
- Single project filter → only that project's tasks

**agent-lifecycle.test.js** (4 tests):
- Full lifecycle: insert agent → heartbeat → claim → release → delete agent
- Heartbeat updates timestamp within window
- Agent appears in `devhub agents` output after insert
- Agent removed from output after delete

**swarm-state-transitions.test.js** (4 tests):
- Workspace: planned → ready → active → completed (via status update commands)
- Agent status: idle → working (via claim) → idle (via release)
- Agent status: working → error (via update-status command)
- Workspace with no transitions stays in planned

**error-recovery.test.js** (5 tests):
- Expired lease: claim, set lease to past, attempt renew → rejected
- Token mismatch: agent A claims, agent B tries release → rejected
- Double-claim: agent A claims, agent B claims same → rejected
- Unregistered agent claim: delete agent, attempt claim → rejected
- Release after unregister: unregister agent holding claim → task freed

## Migration / Rollout

No migration required. New test files only. Add `test:integration` script to `devhub-cli/package.json`:

```json
"test:integration": "jest tests/integration/*.test.js --runInBand"
```

Update `devhub-cli/jest.config.js` to include integration pattern if not already covered by `**/*.test.js`.

## Open Questions

- [ ] Should lease TTL for integration tests use a shorter value (e.g., 5s) to avoid `setTimeout` waits for expired lease tests? Current code uses 300s. Could override via env var or manipulate `lease_expires_at` directly in DB.
- [ ] The spec mentions "register → unregister" lifecycle but no CLI commands exist for these — they're MCP operations. Tests will simulate via direct DB INSERT/DELETE into `agent_registry`. Confirm this matches intent.
- [ ] Should integration tests run in CI? If so, need to ensure `better-sqlite3` native bindings are available in CI environment.
