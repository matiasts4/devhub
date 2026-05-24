# RESUME-SWARM-01 — Evidence: Crear diagnóstico unificado de runtime

**Date:** 2026-05-23
**Agent:** swarm-feature-delivery (Coder)
**Task:** Implement unified runtime diagnostics endpoint

## Files Changed

| File | Change |
|------|--------|
| `src/lib/swarm/runtimeStatus.js` | Added `buildDiagnosis()` function + `agentWorkspaces`/`supervisorSnapshots` params to snapshot |
| `src/app/api/swarm/runtime-diagnostics/route.js` | Added `agent_workspaces` + `supervisor_snapshots` DB reads, passed to snapshot |
| `src/lib/swarm/runtimeStatus.test.js` | Added 9 new tests for diagnosis section (ALL_CLEAR, reattachable, quota, orphaned, stale, workspaces, supervisors, crash dumps, output fields) |
| `src/app/api/swarm/runtime-diagnostics/route.test.js` | Added 2 new tests: diagnosis section presence, agentWorkspaces/supervisorSnapshots in response |

## What was already implemented

The existing endpoint already covered 9/9 requirements from the plan:
1. `/api/terminal/sessions` data via `getTTYSessionsSnapshot()`
2. `/api/swarm/processes` data via `getOpenCodeProcesses()`
3. `agent_registry` entries via `tables.agent_registry`
4. `agent_runs` entries via `tables.agent_runs`
5. `swarm_missions` entries via `tables.swarm_missions`
6. Recent crash dumps via `readRecentCrashDumps()`
7. Recent errors from logs via `safeReadRecentFile` + `extractErrorLines`
8. Detection of `socketCount: 0 && alive: true` via `classifyTerminal` → REATTACHABLE
9. Detection of OpenCode 429/quota via `detectQuotaSignals`

## What was added

### 1. `buildDiagnosis()` function (runtimeStatus.js:104-244)

Generates a human-readable `diagnosis` section with `findings[]` and `actions[]` that directly answers "why can't I see the terminal":

- **QUOTA_BLOCKED** (critical) — 429/GoUsageLimitError detected in logs
- **TERMINALS_REATTACHABLE** (warning) — alive but no WebSocket sockets
- **ORPHANED_PROCESSES** (warning) — OpenCode processes without terminal
- **STALE_REGISTRY** (warning) — registry agents without active process
- **ORPHANED_TERMINALS** (info) — dead PTY but process still alive
- **BLOCKED_WORKSPACES** (warning) — agent_workspaces in conflicted/orphaned state
- **SUPERVISOR_BLOCKED** (info) — supervisor in blocked/awaiting_approval/recovering_orphan
- **CRASH_DUMPS** (info) — recent crash dump files found
- **LOG_ERRORS** (info) — error lines detected in log files
- **ALL_CLEAR** (ok) — no anomalies detected

Each finding includes `severity`, `code`, `message` (human-readable Spanish), and `detail` (structured data).

### 2. Agent workspaces + supervisor snapshots data sources

The endpoint now also reads:
- `tables.agent_workspaces` — to detect conflicted/orphaned workspaces
- `tables.supervisor_snapshots` — to detect blocked/approval-waiting tasks

These are included in both the raw snapshot output AND the diagnosis analysis.

### 3. Bug fix: `processAgents` → `registryAgentIds`

Fixed a bug in `classifyProcess` where `hasRegistryAgent` was checking against `processAgents` (the set of agents from swarmProcesses) instead of the actual registry. Now uses `registryAgentIds` built from `agentRegistry`.

## Test Results

```
PASS src/app/api/swarm/runtime-diagnostics/route.test.js
PASS src/lib/swarm/runtimeStatus.test.js

Test Suites: 2 passed, 2 total
Tests:       17 passed, 17 total
```

## Acceptance Criteria Verification

- [x] Single API call gives "why I can't see the terminal" — `diagnosis.findings` with severity-coded messages
- [x] Snapshot does NOT mutate state — read-only GET endpoint, no writes
- [x] All 9 data sources included in snapshot
- [x] Anomaly detection for socketCount:0 && alive:true — REATTACHABLE status + diagnosis finding
- [x] Anomaly detection for 429/quota — QUOTA_BLOCKED status + critical diagnosis finding

## Observations

1. The route already had a bug fix for opencode log discovery (finds most recent `opencode_*.log` instead of hardcoded `opencode.log`).
2. The `buildRuntimeEvidenceRefs` function was already improved to use dynamic opencode log name.
3. No blockers found. Implementation is backward-compatible — all new fields are additive.
