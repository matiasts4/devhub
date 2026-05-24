# Tasks: Session Resume + Swarm Stability

## Phase 1 — Observability Foundation

- [x] 1.1 RED: Create unit tests for canonical runtime status classification and quota signal detection in `src/lib/swarm/runtimeStatus.test.js`.
- [x] 1.2 GREEN: Implement `src/lib/swarm/runtimeStatus.js` with canonical statuses, anomaly detection, and snapshot summary.
- [x] 1.3 RED: Create route test for unified diagnostics endpoint in `src/app/api/swarm/runtime-diagnostics/route.test.js`.
- [x] 1.4 GREEN: Implement `src/app/api/swarm/runtime-diagnostics/route.js` as read-only reconciled snapshot endpoint.
- [x] 1.5 REFACTOR: Extract shared OpenCode process scanner to `src/lib/swarm/openCodeProcesses.js` and reuse from `/api/swarm/processes`.
- [x] 1.6 VERIFY: Run targeted jest suites for runtime status + runtime diagnostics route.

## Phase 2 — Next Slice (pending)

- [x] 2.1 Add runtime-status mapping consumption to topology/control room surfaces.
- [x] 2.2 Add resilient evidence links (logs/crash dumps) in diagnostics UI surface.
- [x] 2.3 Add integration test proving stale registry + orphan process + quota blocked scenarios across APIs.

## Phase 3 — Restore Contract (pending)

- [x] 3.1 Design versioned Restore Manifest contract.
- [x] 3.2 Implement startup restore coordinator with idempotent reattach policy.
- [x] 3.3 Build E2E harness for reboot/reload swarm recovery matrix.
