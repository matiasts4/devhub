# Proposal: Session Resume + Swarm Stability

## Intent

Implement a reconciled runtime truth layer so DevHub can explain and recover terminal/swarm state after reload, restart, or partial runtime failure.

## Scope

### In Scope (this first slice)

- Add a unified diagnostics endpoint for runtime state.
- Normalize canonical statuses used by terminal/process/registry surfaces.
- Include quota-blocked signal detection from logs.
- Preserve read-only behavior (no mutation side effects).

### Out of Scope (later slices)

- Full restore manifest and startup restore coordinator.
- Automatic OpenCode reattach/relaunch policy engine.
- Debug/Recovery UI center.
- Full E2E reboot harness for swarm + VTE.

## Capabilities

### New

- `runtime-diagnostics-reconciliation`: single snapshot endpoint with canonical state classes and anomaly hints.

### Modified

- `/api/swarm/processes` reuses shared process scan helper.

## Approach

Create a status normalization module (`runtimeStatus`) that maps runtime evidence into canonical states:
- `active`
- `reattachable`
- `orphaned-process`
- `orphaned-terminal`
- `stale-registry`
- `quota-blocked`
- `terminated`
- `unknown`

Expose this via `/api/swarm/runtime-diagnostics`, aggregating:
- terminal sessions
- opencode processes
- registry/runs/missions database reads
- recent crash dump metadata
- recent log quota signals

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| False-positive status classification | Medium | Keep rules explicit and test every status class in unit tests |
| Diagnostics endpoint becomes heavy | Medium | Bound data reads (limit rows, tail logs only) |
| Runtime scanners fail on some hosts | Low | Fallback to empty collections, never crash endpoint |

## Success Criteria

- [x] A single endpoint returns reconciled runtime snapshot without mutating state.
- [x] Canonical status labels are deterministic and test-covered.
- [x] `alive + socketCount=0` is flagged as reattachable.
- [x] Quota 429/GoUsageLimitError appears as `quota-blocked` in anomalies.
