# Design: CLI Swarm Command

## Technical Approach

Compose a single `devhub swarm` handler that aggregates four sections — Projects, Queue, Agents, Milestones — using existing durable read functions and direct SQLite queries. Reuses `lib/format.js` helpers for TTY-aware rendering. `--compact` collapses each section to one summary line. Non-TTY mode emits `key=value` pairs with no ANSI codes.

## Architecture Decisions

| Decision | Option | Tradeoff | Decision |
|----------|--------|----------|----------|
| Project data source | Direct query (like `status.js`) vs new `readProjectSummary()` | New function adds abstraction layer for one caller | **Direct query** — `status.js` already does this; no duplication worth extracting yet |
| Queue summary | Cross-project merge (like `queue.js`) vs aggregate counts | Full merge is expensive for overview; counts are sufficient | **Aggregate counts** — show pending/in_progress/blocked totals + top 5 by score |
| Compact mode implementation | Single function with flag vs separate renderers | Separate renderers duplicate logic; flag adds branching | **Single function with `--compact` flag** — branch at render time, share data fetch |
| Non-TTY format | `key=value` pairs vs pipe-delimited table | Pipe-delimited matches `table()` non-TTY but loses section structure | **`key=value` per section** — machines parse sections + pairs more reliably |
| Empty state | Per-section "No data" vs global message | Global message hides which sections have data | **Per-section "No swarm data available"** — matches spec requirement |

## Data Flow

```
  cli.js (register) ──→ commands/swarm.js
                            │
                            ├── getDb() ──→ SQLite
                            │     ├── SELECT COUNT(*) FROM projects
                            │     ├── SELECT name, progress FROM projects ORDER BY progress DESC LIMIT 5
                            │     ├── SELECT status, COUNT(*) FROM tasks GROUP BY status
                            │     └── SELECT title, due_date, status FROM milestones ... LIMIT 5
                            │
                            └── readAgentRegistrySummary(db) ──→ agent_registry + agent_workspaces
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `devhub-cli/commands/swarm.js` | Create | Composite swarm handler with 4 sections, `--compact` flag, TTY/non-TTY modes |
| `devhub-cli/commands/swarm.test.js` | Create | Jest tests: full output, compact mode, TTY detection, empty states, non-TTY format |
| `devhub-cli/cli.js` | Modify | Add `swarm` to implemented commands, remove from `STUB_COMMANDS` array |

## Interfaces / Contracts

### Command signature

```js
// commands/swarm.js
function swarmCommand(opts = {}) {
  // opts.compact: boolean — collapsed one-line summaries
  // Returns: writes to stdout, exits 0
}
module.exports = swarmCommand;
```

### Section data shapes (internal)

```js
// Projects section
{ total: number, top: [{ name: string, progress: number }] }

// Queue section (aggregate counts, not full entries)
{ pending: number, inProgress: number, blocked: number, top5: [{ title: string, priority_score: number, project_name: string }] }

// Agents section (reuse readAgentRegistrySummary output)
{ rows: Array<{ agent_id, status, current_task_id, branch_name, modelo_llm, heartbeat_label }>, total: number }

// Milestones section
{ items: [{ title, due_date, status }] }
```

### Non-TTY output format

```
--- Projects ---
total=3
project=devhub-cli|progress=45
project=web-app|progress=20

--- Queue ---
pending=12
in_progress=3
blocked=1

--- Agents ---
total=2
agent=worker-1|status=working|task=task-abc
agent=worker-2|status=idle|task=

--- Milestones ---
total=5
milestone=Alpha Release|due=2026-06-01|status=in_progress
```

### Compact mode output (TTY)

```
═══ Swarm Overview ═══
Projects: 3 total | Queue: 12 pending, 3 in progress, 1 blocked | Agents: 2 registered (1 active) | Milestones: 5 upcoming
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — full output | All 4 sections render with data | Seed DB, spawn CLI, assert section headers and content |
| Unit — compact mode | `--compact` produces single-line summary under 30 lines | Seed DB with many items, run `--compact`, count lines |
| Unit — TTY detection | `FORCE_TTY=1` produces ANSI codes, default produces none | Spawn with/without `FORCE_TTY`, check for `\x1b[` |
| Unit — non-TTY format | Output contains `key=value` pairs, no ANSI | Spawn without TTY, assert format |
| Unit — empty state | Empty DB shows "No swarm data available" per section, exit 0 | Clear DB, run command, assert messages |
| Unit — partial data | Some sections have data, others empty | Seed only projects, assert Agents shows empty message |
| Unit — command registration | `devhub swarm` invokes handler, not stub | Run command, assert exit 0 (not exit 1 stub error) |
| Unit — help | `devhub --help` includes `swarm` | Run `--help`, assert output contains "swarm" |

## Migration / Rollout

No migration required. Zero database schema changes. Remove `swarm` from `STUB_COMMANDS` in `cli.js` and add the implemented command registration.

## Open Questions

- [ ] Queue section: spec says "Queue summary" but `readExecutionQueueSummary()` requires a projectId. Design uses aggregate counts + top 5 cross-project. Confirm this matches operator expectations or if a specific project filter is needed.
- [ ] `readProjectSummary()` mentioned in proposal does not exist in `lib/db.js`. Using direct queries like `status.js` — acceptable or should a shared function be extracted first?
