# Proposal: SW-9.1A execution queue leases and orphan recovery

## Intent

Harden the existing execution queue lifecycle so task claims, leases, stale detection, orphan recovery, dependency blocking, and Control Room state stay consistent under concurrency and worker loss.

## Scope

### In Scope

- Tighten secure claim, renew, release, and stale-lease semantics on current task fields/helpers.
- Reconcile task lease state with durable workspace/run recovery and supervisor snapshot outcomes.
- Add concurrency/integration coverage for lease expiry, orphan recovery, blocked dependencies, and snapshot projection freshness.

### Out of Scope

- New queue subsystem, duplicate state store, or parallel lease authority.
- Approval, notification, or unrelated supervisor workflow rewrites.

## Capabilities

### New Capabilities

- `execution-queue-leases`: Durable claim token, lease heartbeat, stale recovery, dependency blocking, and orphan reconciliation for queued work.

### Modified Capabilities

- `swarm-observability`: Control Room snapshot MUST expose queue/lease/recovery state from the same durable projection path.

## Approach

Extend current primitives in `devhub-mcp/server.js`, `localDb`, supervisor evaluation, and Control Room projections. Keep one durable truth: task lease fields + workspace/run/snapshot tables. Harden edge conditions instead of introducing new orchestration layers.

## Affected Areas

| Area                                                                     | Impact   | Description                                                            |
| ------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------- |
| `devhub-mcp/server.js`                                                   | Modified | Claim/renew/release rules, stale cleanup, supervisor projection inputs |
| `src/lib/db/localDb.js`                                                  | Modified | Durable helpers for lease/recovery reads and writes                    |
| `src/lib/swarm/supervisorLoop.js`                                        | Modified | Canonical stale/orphan/dependency evaluation alignment                 |
| `src/lib/operations/swarmControl.js`                                     | Modified | Control Room snapshot normalization from durable state                 |
| `tests/agenthub/mcp/*.test.js`, `devhub-mcp/tests/integration/*.test.js` | Modified | Concurrency and recovery coverage                                      |

## Risks

| Risk                                             | Likelihood | Mitigation                                               |
| ------------------------------------------------ | ---------- | -------------------------------------------------------- |
| Split authority between queue and recovery paths | Med        | Reuse existing tables/helpers only                       |
| False orphan/stale transitions                   | Med        | Assert latest workspace/run linkage in tests             |
| Snapshot drift in UI                             | Low        | Project all states through existing health/snapshot path |

## Rollback Plan

Revert lease/recovery changes in MCP/server, localDb, supervisor loop, and Control Room projection together; restore prior tests and snapshot expectations as one patch.

## Dependencies

- Existing `tasks`, `agent_workspaces`, `agent_runs`, `supervisor_snapshots`, and checkpoint durability model

## Success Criteria

- [ ] Claims, renewals, expirations, and releases remain single-owner and deterministic under concurrent access.
- [ ] Stale leases and orphaned workspace/run states surface through supervisor snapshots without duplicate truth.
- [ ] Blocked dependencies and recovery status appear consistently in Control Room and automated tests.
