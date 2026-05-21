# Exploration: SW-9.1A execution queue leases, stale recovery, and visibility

### Current State

- Task leasing already exists: `claim_next_task`, `get_next_task`, `renew_task_lease`, and `release_task` all operate on `tasks.claim_token`, `claimed_at`, `lease_expires_at`, and `assigned_to`.
- Stale lease cleanup already exists in `devhub-mcp/server.js` via `cleanupExpiredLeases()`, and it runs before queue reads and claims.
- Dependency blocking already exists in queue scoring: `task_dependencies` are read, `buildQueue()` marks `blocked` items, and `get_execution_queue` can include blocked tasks for visibility.
- Durable workspace/run truth already exists: `agent_workspaces`, `agent_runs`, `agent_artifacts`, `get_workspace_evidence`, `list_agent_runs`, and `complete_agent_run`.
- Supervisor recovery already exists: `evaluateSupervisorSnapshot()` derives `stale_lease`, `orphaned_workspace`, `orphaned_run`, `blocked_dependency`, `approval_required`, and `recoverable_failure` states, then persists them into `supervisor_snapshots` and `supervisor_approval_checkpoints`.
- Control Room visibility already has a read model seam in `src/lib/operations/swarmControl.js` and the health/snapshot pipeline; it already normalizes queue, approvals, workspace, and run evidence.

### Affected Areas

- `devhub-mcp/server.js` — queue APIs, lease cleanup, workspace/run tools, supervisor evaluation, and snapshot projection.
- `src/lib/db/localDb.js` — durable helpers for tasks, workspaces, runs, checkpoints, and snapshots.
- `src/lib/swarm/supervisorLoop.js` — canonical supervisor state machine for stale/orphan/approval outcomes.
- `src/lib/operations/swarmControl.js` — Control Room normalization and visibility layer.
- `src/lib/operations/health.js` — health sources and freshness model for the snapshot.
- `tests/agenthub/mcp/task-leases.test.js` — current lease contract coverage.
- `devhub-mcp/tests/integration/supervisor-loop.test.js` — current stale/orphan/recovery behavior coverage.
- `devhub-mcp/tests/integration/agent-workspaces-lifecycle.test.js` — workspace lifecycle and orphan metadata coverage.
- `devhub-mcp/tests/integration/agent-runs-artifacts.test.js` — run/artifact durability coverage.

### Approaches

1. **Hardening-only change on existing primitives** — tighten claim/renew/release semantics, keep cleanup and recovery on the current tables/helpers, and improve visibility by reusing the health/snapshot path.
   - Pros: smallest surface, no duplicate authority, aligns with current durable-first architecture.
   - Cons: requires careful test coverage because behavior spans several modules.
   - Effort: Medium.

2. **Introduce a new lease/recovery subsystem** — centralize queue/lease/orphan logic in a new module and have APIs delegate to it.
   - Pros: cleaner abstraction boundary.
   - Cons: unnecessary duplication risk; would fork truth away from the current MCP/server helpers.
   - Effort: High.

### Recommendation

Use **Approach 1**. The system already has the right durable primitives; SW-9.1A should focus on making claim/renew/release, stale detection, orphan recovery, dependency blocking, and Control Room visibility consistent and hardened — not on inventing a second source of truth.

### Risks

- Duplicate authority if task lease logic is split away from `devhub-mcp/server.js` and `localDb`.
- False recovery if stale lease/orphan detection is implemented without respecting existing `approval_checkpoint_key` and latest run/workspace linkage.
- Snapshot drift if the Control Room reads queue state from one path and recovery state from another.
- Overlap with SW-9.2A/SW-9.3A if this change starts mutating approval or notification semantics instead of just queue/lease/recovery truth.

### Ready for Proposal

Yes — but the proposal should stay narrow: harden the existing execution queue lease lifecycle, stale/orphan recovery, dependency blocking, and snapshot visibility without introducing new durable tables or a parallel queue model.
