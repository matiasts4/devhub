# Design: CLI Claim and Release Commands

## Technical Approach

Add two lifecycle-mutating commands to the DevHub CLI: `claim` (takes next pending task, sets lease) and `release` (validates token, clears lease, updates status). Both follow the established CLI-7 pattern: direct SQLite via `getDb()`, exit codes 0/1/2, TTY-aware output via `lib/format.js`.

The claim command resolves the agent's project from `agent_registry`, then reuses `readExecutionQueueSummary()` to get the prioritized queue and picks the first non-blocked task. Release validates the token via direct SQL comparison in the WHERE clause for atomicity.

## Architecture Decisions

### Decision: Queue Query Strategy

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Reuse `readExecutionQueueSummary()` | Heavy (resolves deps, scores, hydrates supervisor) but consistent with proposal and existing patterns | **Chosen** — resolves agent project, calls with `limit=1`, picks first non-blocked |
| Direct SQL with priority formula | Faster, single query, but duplicates scoring logic from `compactReads.js` | Rejected — DRY violation, scoring already tested in compactReads |

Claim flow:
1. `agent_registry` lookup → get `project_id` for the given `agent-id`
2. `readExecutionQueueSummary(db, { projectId, limit: 20, includeBlocked: true })`
3. Iterate queue, skip blocked entries, claim first non-blocked pending task
4. If no non-blocked task found → exit 1

### Decision: Claim Token Generation

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `crypto.randomBytes(16).toString('hex')` | 256-bit entropy, 32-char hex, spec-mandated | **Chosen** — per spec requirement |
| UUID v4 | Standard but only 122 bits randomness | Rejected — spec requires 256-bit |
| Timestamp + random | Predictable component weakens security | Rejected |

### Decision: Token Validation Strategy

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Direct SQL comparison in WHERE | Single atomic UPDATE, no race window, simple | **Chosen** — `WHERE id = ? AND claim_token = ?` |
| Read-then-compare in JS | Two queries, race window between SELECT and UPDATE | Rejected — unsafe for concurrent agents |
| Hash comparison (bcrypt) | Overkill for CLI-local SQLite, no concurrent threat model | Rejected — unnecessary complexity |

Release uses a single UPDATE: `UPDATE tasks SET status = ?, claim_token = NULL, lease_expires_at = NULL WHERE id = ? AND claim_token = ?`. If `changes === 0`, either task not found or token mismatch — distinguish by first checking if task exists.

### Decision: Lease Duration

**5 minutes (300 seconds)** — per spec. Set as `new Date(Date.now() + 300_000).toISOString()`.

No configurable TTL — keep it simple. If a different duration is needed later, it becomes a swarm_config entry.

### Decision: Outcome → Status Mapping

| Outcome | Task Status | Rationale |
|---------|-------------|-----------|
| `completed` | `completed` | Direct mapping — work finished |
| `paused` | `paused` | Direct mapping — agent paused, task returns to queue |
| `failed` | `failed` | Direct mapping — agent failed, task terminal |
| `abandoned` | `blocked` | Per spec — agent abandoned, task needs review before retry |

## Data Flow

```
CLAIM:
  CLI (agent-id)
    → agent_registry SELECT (resolve project_id)
    → readExecutionQueueSummary (get prioritized queue)
    → first non-blocked task
    → UPDATE tasks SET status='in_progress', claim_token=?, lease_expires_at=?
       WHERE id=? AND status='pending'
    → stdout: task details (TTY or JSON)

RELEASE:
  CLI (task-id, token, --outcome)
    → SELECT * FROM tasks WHERE id=? (check exists)
    → if claim_token IS NULL → "not claimed" error
    → UPDATE tasks SET status=?, claim_token=NULL, lease_expires_at=NULL
       WHERE id=? AND claim_token=?
    → if changes===0 → "invalid token" error
    → stdout: confirmation
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `devhub-cli/commands/claim.js` | Create | Claim handler: arg validation, agent lookup, queue query, atomic lease write, TTY/JSON output |
| `devhub-cli/commands/release.js` | Create | Release handler: arg validation, outcome parsing, token validation, atomic status update |
| `devhub-cli/commands/claim.test.js` | New | Unit tests: missing args, no tasks, successful claim, piped JSON output, double-claim prevention |
| `devhub-cli/commands/release.test.js` | New | Unit tests: missing args, invalid outcome, token mismatch, task not found, each outcome value, expired lease warning |
| `devhub-cli/cli.js` | Modify | Register `claim` and `release` commands, remove from `STUB_COMMANDS` if present |

## Interfaces / Contracts

### Claim Command

```
devhub claim <agent-id>

Exit codes:
  0 — success, task claimed
  1 — no pending tasks or agent not found
  2 — missing agent-id argument

TTY output:
  Task: task-uuid
  Title: Some task title
  Project: project-name
  Token: abc123... (32-char hex)
  Lease: 2026-05-23T12:35:00Z

Piped output (JSON):
  {"id":"task-uuid","title":"...","project":"...","claim_token":"...","lease_expires_at":"..."}
```

### Release Command

```
devhub release <task-id> <claim-token> [--outcome completed|paused|failed|abandoned]

Exit codes:
  0 — success, lease cleared
  1 — task not found, not claimed, or token mismatch
  2 — missing args or invalid outcome

Default outcome: completed
```

### Database Contract

```sql
-- Claim (atomic — prevents double-claim via status='pending' guard)
UPDATE tasks
SET status = 'in_progress',
    claim_token = ?,
    lease_expires_at = ?,
    claimed_at = datetime('now'),
    updated_at = datetime('now')
WHERE id = ? AND status = 'pending';

-- Release (atomic — validates token in WHERE)
UPDATE tasks
SET status = ?,
    claim_token = NULL,
    lease_expires_at = NULL,
    updated_at = datetime('now')
WHERE id = ? AND claim_token = ?;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — claim | Missing agent-id → exit 2 | Mock process.exit, verify stderr |
| Unit — claim | Agent not in registry → exit 1 | Empty agent_registry |
| Unit — claim | No pending tasks → exit 1 | All tasks completed/blocked |
| Unit — claim | Successful claim → exit 0, DB updated | Verify claim_token is 32-char hex, lease is now+300s |
| Unit — claim | Piped output → valid JSON | Spawn with isTTY=false, parse stdout |
| Unit — claim | Double-claim prevention | Claim same task twice, second fails |
| Unit — release | Missing args → exit 2 | Various arg combinations |
| Unit — release | Invalid outcome → exit 2 | `--outcome invalid` |
| Unit — release | Task not found → exit 1 | Non-existent task-id |
| Unit — release | Token mismatch → exit 1 | Wrong token provided |
| Unit — release | Not claimed (NULL token) → exit 1 | Task never claimed |
| Unit — release | Each outcome value → correct status | completed/paused/failed/abandoned |
| Unit — release | Expired lease → warning + success | Set lease_expires_at to past |
| Unit — release | Lease fields cleared after release | Verify NULL in DB |

## Migration / Rollout

No migration required — `claim_token`, `lease_expires_at`, and `claimed_at` columns already exist from prior schema changes. Indexes `idx_tasks_lease_expires` and `idx_tasks_claim_token` already created in `core.js`.

Rollback: remove the four new files, revert `cli.js` registration. Any tasks mid-lease revert to `pending` on next queue cycle (lease expiry is advisory, not enforced by the queue query).

## Open Questions

- None
