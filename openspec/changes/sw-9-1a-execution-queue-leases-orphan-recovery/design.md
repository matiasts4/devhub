# Design: SW-9.1A execution queue leases and orphan recovery

## Technical Approach

Harden the existing durable path only. `devhub-mcp/server.js` remains the lease write seam for claim/renew/release/expiry cleanup, `src/lib/swarm/supervisorLoop.js` remains the recovery authority for stale/orphan/blocked states, and Control Room keeps reading through `src/app/api/agenthub/operations/health/route.js` plus `src/lib/operations/swarmControl.js`. No new queue subsystem, no duplicate lease store, no product-surface mutations in this change.

## Architecture Decisions

| Decision           | Choice                                                                                                                                             | Alternatives considered                              | Rationale                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Lease authority    | Keep `tasks.claim_token`, `claimed_at`, `lease_expires_at`, `assigned_to` plus existing `cleanupExpiredLeases()`/claim helpers as sole write truth | New lease table; separate recovery coordinator       | Avoids split authority and preserves current MCP contract.                                     |
| Recovery authority | Derive stale/orphan outcomes only through `evaluateSupervisorSnapshot()` using durable task/workspace/run/checkpoint facts                         | Queue-only flags; UI-side inference                  | Recovery already has durable counters/reason classes; reusing it prevents divergent semantics. |
| Read seam          | Control Room queue/recovery state MUST come from `get_execution_queue(includeBlocked: true)` and health snapshot projection only                   | Direct UI reads from DB; secondary selector pipeline | Keeps one read model and prevents snapshot drift.                                              |
| Verification gate  | Strict TDD at contract/integration layer before implementation                                                                                     | Manual validation first; UI-first tests              | Change is infrastructure-heavy; failing contract tests must define behavior before code moves. |

## Data Flow

### Lease + queue path

`claim_next_task / get_next_task` → `cleanupExpiredLeases()` → `buildQueue()` → lease write on `tasks` → `attachSupervisorToTask()`

### Recovery + projection path

`get_execution_queue(includeBlocked)` → `cleanupExpiredLeases()` marks stale tasks reusable → `attachSupervisorToTask(staleLeaseObserved)` → `evaluateSupervisorSnapshot()` → `supervisor_snapshots` / checkpoint linkage → health route `director_queue` + `supervisor` slices → `composeControlRoomSnapshot()`

### Sequence diagrams

`expired lease -> cleanupExpiredLeases -> task reset to pending -> attachSupervisorToTask(staleLeaseObserved) -> evaluateSupervisorSnapshot(stale_lease) -> supervisor snapshot persisted -> Control Room shows recovering_orphan from same queue read`

`blocked dependency -> buildQueue marks blocked -> attachSupervisorToTask keeps supervisor reason -> health route projects director_queue -> swarmControl normalizes blocked_reason + supervisor payload`

## File Changes

| File                                                   | Action | Description                                                                                                               |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `devhub-mcp/server.js`                                 | Modify | Tighten cleanup/claim/renew/release sequencing and ensure queue items always hydrate supervisor state from durable facts. |
| `src/lib/db/localDb.js`                                | Modify | Reuse existing workspace/run/snapshot/checkpoint helpers to fetch latest linkage without introducing new tables.          |
| `src/lib/swarm/supervisorLoop.js`                      | Modify | Make stale lease, orphaned workspace, orphaned run, and blocked dependency semantics deterministic and idempotent.        |
| `src/app/api/agenthub/operations/health/route.js`      | Modify | Keep `director_queue` projection sourced from `get_execution_queue(includeBlocked: true)` without claim side effects.     |
| `src/lib/operations/swarmControl.js`                   | Modify | Normalize recovery-rich queue/supervisor fields for Control Room consumers without inventing UI-local state.              |
| `tests/agenthub/mcp/task-leases.test.js`               | Modify | Cover deterministic claim/renew/release/expiry behavior and blocked queue visibility.                                     |
| `devhub-mcp/tests/integration/supervisor-loop.test.js` | Modify | Cover stale lease/orphan recovery counters, checkpoint linkage, and repeated reads.                                       |
| `tests/agenthub/api/operations-health.test.js`         | Modify | Prove Control Room projection stays read-only, authoritative, and recovery-aware.                                         |
| `src/lib/operations/__tests__/swarmControl.test.js`    | Modify | Lock selector normalization for blocked/recovery queue entries.                                                           |

## Interfaces / Contracts

```js
// Existing contracts stay; payload fidelity changes.
get_execution_queue -> {
  queue: [{
    id, blocked, blocking_dependencies,
    supervisor: {
      supervisor_state, outcome, reason_class,
      workspace_id, run_id, evidence_ref,
      approval_checkpoint_key, orphan_recovery_count
    }
  }]
}
```

`claim_next_task`, `renew_task_lease`, and `release_task` MUST remain token-guarded and single-owner. Control Room MUST treat `director_queue.supervisor` as projection data, never as a write input.

## Testing Strategy

| Layer       | What to Test                                                                                        | Approach                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit        | `evaluateSupervisorSnapshot()` stale/orphan/dependency branches; `swarmControl` queue normalization | Add RED tests for reason-class precedence, idempotent counters, and projection shape.                                                                              |
| Integration | MCP claim/renew/release expiry flow; supervisor snapshot persistence; health route queue projection | Extend existing Jest integration suites before code changes; assert repeated reads stay stable.                                                                    |
| E2E         | None new by default                                                                                 | Keep scope narrow: no product/UI behavior changes beyond projection contracts, so browser coverage is unnecessary unless later apply work changes rendered states. |

Strict TDD order: (1) lease contract RED, (2) supervisor recovery RED, (3) health/selector RED, (4) minimal GREEN, (5) refactor with snapshot parity checks.

## Migration / Rollout

No migration required. Reuse current durable tables, counters, and checkpoint keys.

## Open Questions

- [ ] No blocking design question. Delta spec artifact is absent today, so implementation must treat this design plus proposal as the bounded source for SW-9.1A.
