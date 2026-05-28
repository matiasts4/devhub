# Design: CLI `status` Command — Compact Swarm Dashboard

## Technical Approach

Implement `devhub status` as a direct SQLite read command that queries 4 dashboard sections (projects, tasks, milestones, swarm) and formats output via `lib/format.js`. The command bypasses compactReads (which is queue/evidence-focused) and uses raw `getDb()` SQL for aggregate counts and top-N queries. Output is capped at 40 lines in TTY mode with hard LIMIT clauses.

Maps to proposal scope: new `commands/status.js`, extend `lib/db.js` barrel, register in `cli.js`, add `lib/format.js` helpers, unit tests via Jest.

## Architecture Decisions

### Decision: Query Strategy — Direct SQL, Not compactReads

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Direct `getDb()` SQL | Full control over aggregates, no intermediate layer | **Chosen** |
| Reuse compactReads barrel | Already exported, but designed for queue/evidence contracts, not dashboard summaries | Rejected |

**Rationale**: compactReads returns structured contracts (`presentExecutionQueue`, `createDirectorQueueContract`) with supervisor hydration and priority scoring — overkill for a dashboard. Direct SQL with `COUNT(*)` and `LIMIT 5` is simpler and faster.

### Decision: DB Access — Extend Barrel to Re-export `getDb`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Extend `lib/db.js` to also re-export `getDb` from `core.js` | Single import point for CLI, consistent with existing barrel pattern | **Chosen** |
| Import `../../src/lib/db/core.js` directly in status.js | Works but breaks the barrel abstraction | Rejected |

**Rationale**: The barrel (`lib/db.js`) already exists as the CLI's gateway to shared DB code. Adding `getDb` keeps the pattern: CLI imports from `./lib/db`, not from `../../src/...`.

### Decision: Output Format — 4 Sections, Hard 40-Line Cap

| Section | Lines | Content |
|---------|-------|---------|
| Projects | ≤10 | Header + count + up to 5 rows (name, progress%) |
| Tasks | ≤6 | Header + 4 status counts (pending/in_progress/completed/blocked) |
| Milestones | ≤12 | Header + up to 5 rows (title, due_date, status) |
| Swarm | ≤6 | Header + active agents + claimed tasks |
| Spacing | ≤6 | Dividers between sections |
| **Total** | **≤40** | |

**Rationale**: Hard `LIMIT 5` on projects and milestones, fixed 4 task counts, and fixed 2 swarm metrics guarantee the cap. No pagination needed for a status dashboard.

### Decision: TTY Detection — Module-Load Time in format.js

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Detect `process.stdout.isTTY` at module load (existing pattern) | Simple, consistent with current `format.js` | **Chosen** |
| Pass TTY flag through function args | More testable but breaks existing API | Rejected |

**Rationale**: `format.js` already uses module-load-time detection. Tests already mock `process.stdout.isTTY` with `jest.resetModules()`. Keep the pattern.

### Decision: Empty DB — Graceful Message, Exit 0

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Show "No projects found — run `devhub init`" and exit 0 | User-friendly, not an error condition | **Chosen** |
| Exit 1 with error message | Technically correct but noisy for first-run | Rejected |

**Rationale**: An empty database is a valid state (fresh install), not an error. Exit 0 with a helpful message.

### Decision: Path Resolution — Delegate to `resolveDbPath()`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Use `resolveDbPath()` from `pathResolver.js` (via `core.js` → `getDb()`) | Already handles env vars, legacy migration, test mode | **Chosen** |
| Hardcode `__dirname`-relative path from CLI | Fragile across worktrees and installs | Rejected |

**Rationale**: `getDb()` already calls `resolveDbPath()` internally, which handles `DEVHUB_DB_PATH`, `NODE_ENV=test`, canonical `~/.devhub/data/`, and legacy migration. No need to reinvent path resolution in the CLI.

## Data Flow

```
  devhub status
       │
       ▼
  commands/status.js
       │
       ├── require('../lib/db')     → getDb() (singleton, resolves path)
       │
       ├── require('../lib/format') → section(), row(), divider(), colorize(), isTTY
       │
       ▼
  SQL Queries (direct, no MCP):
    1. SELECT COUNT(*) FROM projects
    2. SELECT name, progress FROM projects ORDER BY progress DESC LIMIT 5
    3. SELECT status, COUNT(*) FROM tasks GROUP BY status
    4. SELECT title, due_date, status FROM milestones
       WHERE status != 'completed' ORDER BY due_date ASC LIMIT 5
    5. SELECT COUNT(*) FROM agent_workspaces WHERE status IN ('active','running')
    6. SELECT COUNT(*) FROM agent_workspaces WHERE current_task_id IS NOT NULL
       │
       ▼
  Format output via lib/format.js helpers
       │
       ├── TTY: ANSI colors, dividers, compact layout
       └── Piped: plain text, key=value pairs, no escapes
       │
       ▼
  process.stdout.write(output) → exit 0
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `devhub-cli/commands/status.js` | Create | Command handler: queries DB, formats 4 sections, writes output |
| `devhub-cli/cli.js` | Modify | Remove `'status'` from `STUB_COMMANDS`, add `program.command('status')` import + registration |
| `devhub-cli/lib/db.js` | Modify | Re-export `getDb` and `closeDb` from `core.js` alongside compactReads barrel |
| `devhub-cli/lib/format.js` | Modify | Add `section(title)`, `row(label, value)`, `divider()` helpers using existing `colorize()` and `isTTY` |
| `devhub-cli/commands/status.test.js` | Create | Jest tests: exit code, sections present, TTY/non-TTY, empty DB |

## Interfaces / Contracts

### New format.js helpers

```js
// Returns a section header string (colored if TTY)
function section(title) {
  return isTTY ? colorize(`\n═══ ${title} ═══`, 36) : `\n--- ${title} ---`;
}

// Returns a single data row: "  label: value"
function row(label, value) {
  return `  ${label}: ${value}`;
}

// Returns a horizontal divider
function divider() {
  return isTTY ? colorize('─'.repeat(40), 90) : '-'.repeat(40);
}
```

### SQL queries (status.js)

```js
const db = getDb();

// Projects
const projectCount = db.prepare('SELECT COUNT(*) as cnt FROM projects').get().cnt;
const topProjects = db.prepare(
  'SELECT name, progress FROM projects ORDER BY progress DESC LIMIT 5'
).all();

// Tasks
const taskCounts = db.prepare(
  "SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status"
).all();

// Milestones
const upcomingMilestones = db.prepare(
  "SELECT title, due_date, status FROM milestones WHERE status != 'completed' ORDER BY due_date ASC LIMIT 5"
).all();

// Swarm
const activeAgents = db.prepare(
  "SELECT COUNT(*) as cnt FROM agent_workspaces WHERE status IN ('active', 'running')"
).get().cnt;
const claimedTasks = db.prepare(
  'SELECT COUNT(*) as cnt FROM agent_workspaces WHERE current_task_id IS NOT NULL'
).get().cnt;
```

### db.js barrel extension

```js
'use strict';

const compactReads = require('../../src/lib/db/compactReads.js');
const { getDb, closeDb } = require('../../src/lib/db/core.js');

module.exports = { ...compactReads, getDb, closeDb };
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Exit code 0 | `spawnSync` → `expect(result.status).toBe(0)` |
| Unit | All 4 sections present | Regex match output for "Projects", "Tasks", "Milestones", "Swarm" |
| Unit | TTY mode includes ANSI | Mock `process.stdout.isTTY = true`, `jest.resetModules()`, check `\x1b[` |
| Unit | Non-TTY mode strips ANSI | Mock `process.stdout.isTTY = false`, check no `\x1b[` |
| Unit | Empty DB shows friendly message | Use test DB with no projects, check "No projects" text |
| Unit | db.js barrel exports getDb | `expect(require('./lib/db').getDb).toBeInstanceOf(Function)` |
| Unit | format.js helpers exist | `expect(require('./lib/format').section).toBeInstanceOf(Function)` |

## Migration / Rollout

No migration required. No schema changes. The command is purely additive — reads existing tables.

**Rollback**: Remove `status` from `cli.js` command registration, delete `commands/status.js` and test. Revert `lib/db.js` to compactReads-only barrel.

## Open Questions

- [ ] Should piped mode use `key=value` pairs (e.g., `projects.count=8`) or remain human-readable plain text? Current spec says "machine-readable key=value" but doesn't define the exact format.
- [ ] Should the command accept a `--project <id>` flag to scope the dashboard to a single project? Out of scope for v1 but worth noting.
