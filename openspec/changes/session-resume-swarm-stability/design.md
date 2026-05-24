# Design: Runtime Diagnostics Reconciliation (Slice 1)

## Architecture

### Modules

1. `src/lib/swarm/openCodeProcesses.js`
- Shared process scanner for OpenCode runtime processes.
- Reused by both process API and diagnostics API.

2. `src/lib/swarm/runtimeStatus.js`
- Canonical status enum.
- Quota signal detector.
- Snapshot builder that classifies terminals/process/registry rows and emits anomalies/summary.

3. `src/app/api/swarm/runtime-diagnostics/route.js`
- Thin GET endpoint.
- Aggregates bounded runtime sources.
- Produces normalized snapshot through `createRuntimeDiagnosticsSnapshot`.

### Data Flow

1. Read terminal sessions (`ttyServer`).
2. Read active OpenCode processes.
3. Read DB rows (`agent_registry`, `agent_runs`, `swarm_missions`).
4. Tail logs and detect quota signals.
5. Read recent crash dump metadata.
6. Normalize + classify.
7. Return JSON snapshot.

## Non-Goals

- No restore orchestration actions.
- No kill/reattach side effects.
- No UI changes in this slice.

## Testing Strategy (Strict TDD)

- Unit tests for status classifier and quota detection.
- Route test with mocked dependencies proving endpoint shape and anomaly detection.
- Keep tests deterministic (no live process dependency).
