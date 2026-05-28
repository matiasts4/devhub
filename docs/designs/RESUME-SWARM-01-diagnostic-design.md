# RESUME-SWARM-01: Unified Runtime Diagnostic

## Architecture

The endpoint aggregates data from five independent sources into a single read-only snapshot:

```
GET /api/diagnostic/runtime
```

```
┌─────────────────────────────────────────────────────────┐
│                   GET /api/diagnostic/runtime            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. PTY Runtime (in-process)                            │
│     → getTTYSessionsSnapshot()                          │
│     → getActiveOpenCodeSessionIds()                     │
│                                                         │
│  2. OS Process Scan                                     │
│     → getOpenCodeProcesses()                            │
│                                                         │
│  3. SQLite DB (better-sqlite3, sync)                    │
│     → tables.agent_registry.select({limit: 200})        │
│     → tables.agent_runs.select({limit: 200})            │
│     → tables.swarm_missions.select({limit: 200})        │
│     → tables.supervisor_snapshots.select({limit: 200})  │
│     → tables.agent_workspaces.select({limit: 200})      │
│                                                         │
│  4. OpenCode CLI                                        │
│     → opencode session list --format json               │
│                                                         │
│  5. Filesystem (logs + crash dumps)                     │
│     → data/logs/terminal-debug.log (last 200 lines)     │
│     → data/logs/browser.log (last 200 lines)            │
│     → data/logs/opencode.log (last 200 lines)           │
│     → data/logs/crash-dumps/*.json (last 5, newest)     │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  Classification Engine (pure functions)                 │
│     → classifyTerminal()                                │
│     → classifyProcess()                                 │
│     → classifyRegistry()                                │
│     → classifyWorkspace()                               │
│     → detectQuotaSignals()                              │
│     → detectAnomalies()                                 │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  Response: JSON (no side effects, no mutations)         │
└─────────────────────────────────────────────────────────┘
```

### Key design decisions

1. **Reuse existing `createRuntimeDiagnosticsSnapshot()`** from `src/lib/swarm/runtimeStatus.js` as the core classification engine. The new endpoint wraps it with additional data sources (supervisor snapshots, workspaces, OpenCode CLI sessions).

2. **Read-only guarantee**: the handler performs zero writes. No DB mutations, no file writes, no process signals.

3. **Graceful degradation**: each data source is wrapped in try/catch. A single source failure does not break the entire snapshot — it returns `{ data: ..., error: "partial" }`.

4. **Performance budget**: all DB queries are `LIMIT 200`, log reads are `tail -200`, crash dumps capped at 5. Total response should complete in <500ms.

## Response Schema

```ts
type RuntimeStatus =
  | 'active'
  | 'reattachable'
  | 'orphaned-process'
  | 'orphaned-terminal'
  | 'stale-registry'
  | 'quota-blocked'
  | 'terminated'
  | 'unknown';

type WorkspaceStatus =
  | 'active'
  | 'orphaned'
  | 'stale'
  | 'completed'
  | 'failed';

interface DiagnosticTerminal {
  terminalId: string | null;
  opencodeSessionId: string | null;
  hermesSessionId: string | null;
  status: RuntimeStatus;
  alive: boolean;
  socketCount: number;
  mode: 'shell' | 'tui';
  cwd: string | null;
  restored: boolean;
  reasons: string[];
}

interface DiagnosticProcess {
  pid: number | null;
  sessionId: string | null;
  agent: string | null;
  role: string | null;
  launchId: string | null;
  status: RuntimeStatus;
  cpu: number;
  rss: number;
  reasons: string[];
}

interface DiagnosticRegistryAgent {
  agentId: string | null;
  status: RuntimeStatus;
  registryStatus: string | null;
  currentTaskId: string | null;
  projectId: string | null;
  reasons: string[];
}

interface DiagnosticWorkspace {
  workspaceId: string;
  agentId: string;
  currentTaskId: string | null;
  runId: string | null;
  status: WorkspaceStatus;
  branchName: string | null;
  observedHead: string | null;
  observedDirty: 'clean' | 'dirty' | 'dirty-excluded' | null;
  lastError: string | null;
  lastErrorClass: string | null;
  recoveryReason: string | null;
}

interface DiagnosticSupervisorSnapshot {
  taskId: string;
  supervisorState: string | null;
  outcome: string | null;
  reasonClass: string | null;
  taskRetryCount: number;
  unchangedFailureCount: number;
  approvalRequestCount: number;
  orphanRecoveryCount: number;
}

interface DiagnosticOpenCodeSession {
  id: string;
  title: string;
  directory: string | null;
  updated: string | null;
  isActive: boolean;
  activePanelId: string | null;
}

interface DiagnosticCrashDump {
  file: string;
  reason: string | null;
  ts: string | null;
  pid: number | null;
  terminalId: string | null;
}

interface QuotaSignals {
  quotaBlocked: boolean;
  quotaMatches: string[];
}

interface AnomalyReport {
  // Terminal anomalies
  reattachableTerminals: string[];       // terminalIds where alive=true && socketCount=0
  orphanedTerminals: string[];           // terminalIds with no matching process
  terminalsWithoutSockets: string[];     // terminalIds with socketCount=0 (regardless of alive)

  // Process anomalies
  orphanedProcesses: number[];           // PIDs with no matching terminal
  processesWithoutRegistry: number[];    // PIDs whose agent not in agent_registry
  duplicateLaunchIds: { launchId: string; count: number }[];

  // Registry anomalies
  staleRegistryAgents: string[];         // agentIds marked idle but process alive or run active
  agentsWithoutProcess: string[];        // agentIds in registry with no matching OS process
  agentsWithStaleHeartbeat: string[];    // agentIds whose last heartbeat is > TTL

  // Workspace anomalies
  orphanedWorkspaces: string[];          // workspaceIds with status active but no run/process
  staleWorkspaces: string[];             // workspaceIds with completed/failed run but workspace still active

  // Supervisor anomalies
  blockedTasks: string[];                // taskIds with supervisor_state=blocked
  awaitingApproval: string[];            // taskIds with supervisor_state=awaiting_approval
  orphanedRuns: string[];                // runIds with no matching workspace or process

  // Quota / error signals
  quotaBlocked: boolean;
  quotaMatches: string[];
  recentCrashDumps: DiagnosticCrashDump[];

  // Summary counts
  totalAnomalyCount: number;
  severity: 'ok' | 'degraded' | 'critical';
}

interface DiagnosticResponse {
  generatedAt: string;                   // ISO timestamp
  version: 1;

  // Raw data sources (classified)
  terminals: DiagnosticTerminal[];
  processes: DiagnosticProcess[];
  registry: DiagnosticRegistryAgent[];
  workspaces: DiagnosticWorkspace[];
  supervisorSnapshots: DiagnosticSupervisorSnapshot[];
  agentRuns: object[];                   // raw rows, unclassified
  swarmMissions: object[];               // raw rows, unclassified
  opencodeSessions: DiagnosticOpenCodeSession[];

  // Evidence
  crashDumps: DiagnosticCrashDump[];
  logSignals: QuotaSignals;
  evidenceRefs: string[];                // log:// and crashdump:// URIs

  // Anomaly detection
  anomalies: AnomalyReport;

  // Summary
  summary: {
    totalTerminals: number;
    totalProcesses: number;
    totalRegistryAgents: number;
    totalWorkspaces: number;
    totalActiveRuns: number;
    totalMissions: number;
    terminalStatusCounts: Record<string, number>;
    processStatusCounts: Record<string, number>;
    registryStatusCounts: Record<string, number>;
    workspaceStatusCounts: Record<string, number>;
  };

  // Error indicator (partial if any source failed)
  dataSourceErrors: string[];
}
```

## Detection Rules

### 1. Reattachable Terminal (`alive-without-sockets`)
- **Condition**: `terminal.alive === true && terminal.socketCount === 0`
- **Meaning**: PTY process is alive but no WebSocket clients connected. UI reload can reattach.
- **Action**: UI should offer "reattach" button.

### 2. Orphaned Process (`process-without-terminal`)
- **Condition**: Process exists in OS (`getOpenCodeProcesses`) but no terminal session has matching `opencodeSessionId === process.sessionId`
- **Meaning**: OpenCode process running without a terminal UI. Could be zombie or background run.
- **Action**: Offer "kill" or "reattach" depending on process age.

### 3. Orphaned Terminal (`terminal-without-process`)
- **Condition**: Terminal session `alive === true` but no matching OS process found by sessionId
- **Meaning**: Terminal thinks it's alive but the PTY may have exited. Stale state.
- **Action**: Mark as terminated, clean up session.

### 4. Stale Registry (`registry-out-of-sync`)
- **Condition**: Agent in `agent_registry` with `status === 'idle'` but has active run (`agent_runs` status in `['running','working','active','thinking']`) OR has matching OS process
- **Meaning**: Registry says idle but reality says active. Heartbeat stopped updating.
- **Action**: Trigger heartbeat refresh or mark stale.

### 5. Quota Blocked (`quota-blocked`)
- **Condition**: Any of the last 200 lines from `terminal-debug.log`, `browser.log`, or `opencode.log` match: `429`, `GoUsageLimitError`, `quota`, `too many requests`
- **Meaning**: OpenCode API quota exhausted. Processes may be alive but blocked.
- **Action**: Show quota warning, disable launch.

### 6. Orphaned Workspace
- **Condition**: `agent_workspaces.status` in `['active','ready']` but no matching `agent_runs` with status `running` and no matching OS process
- **Meaning**: Workspace reserved but no agent actually working on it.
- **Action**: Mark for cleanup after TTL.

### 7. Stale Workspace
- **Condition**: `agent_workspaces.status` in `['active','ready']` but latest `agent_runs` status is `completed` or `failed`
- **Meaning**: Run finished but workspace not transitioned to terminal state.
- **Action**: Auto-transition workspace status.

### 8. Blocked Supervisor
- **Condition**: `supervisor_snapshots.supervisor_state === 'blocked'`
- **Meaning**: Supervisor loop blocked on a task. Needs intervention.
- **Action**: Show in diagnostic, offer unblock.

### 9. Awaiting Approval
- **Condition**: `supervisor_snapshots.supervisor_state === 'awaiting_approval'`
- **Meaning**: Task waiting for human approval. Normal state but should be visible.
- **Action**: Show in diagnostic with approval link.

### 10. Orphaned Run
- **Condition**: `agent_runs.status === 'running'` but workspace status is `completed/failed/orphaned` or no matching OS process
- **Meaning**: Run marked running but underlying work is gone.
- **Action**: Mark run as failed with reason `orphaned`.

### 11. Duplicate Launch IDs
- **Condition**: Multiple processes (count > 5) share the same `launchId` extracted from command line
- **Meaning**: Possible duplicate swarm launch. Resource waste.
- **Action**: Warning in diagnostic, offer cleanup.

### 12. Agent Without Process
- **Condition**: Agent in `agent_registry` with active status but no matching OS process from `getOpenCodeProcesses`
- **Meaning**: Registry says agent is running but process is gone.
- **Action**: Mark as stale, offer cleanup.

### Severity Calculation
- `ok`: `totalAnomalyCount === 0`
- `degraded`: `totalAnomalyCount > 0 && !quotaBlocked && orphanedProcesses.length < 3`
- `critical`: `quotaBlocked === true || orphanedProcesses.length >= 3 || staleRegistryAgents.length >= 3`

## File Changes

### New files

| File | Purpose |
|------|---------|
| `src/app/api/diagnostic/runtime/route.js` | Main GET endpoint |
| `src/lib/diagnostic/runtimeDiagnostic.js` | Pure aggregation + classification logic |
| `src/lib/diagnostic/runtimeDiagnostic.test.js` | Unit tests for classification rules |
| `docs/designs/RESUME-SWARM-01-diagnostic-design.md` | This design document |

### Modified files

| File | Change |
|------|--------|
| `src/lib/swarm/runtimeStatus.js` | Add `classifyWorkspace()` and `detectSupervisorAnomalies()` functions (extend existing classification engine) |

### No changes needed

- `src/app/api/swarm/runtime-diagnostics/route.js` — existing endpoint stays as-is for backward compatibility. The new `/api/diagnostic/runtime` supersedes it but does not replace it.
- `src/lib/terminal/ttyServer.js` — `getTTYSessionsSnapshot()` and `getActiveOpenCodeSessionIds()` already provide the needed data.
- `src/lib/swarm/openCodeProcesses.js` — `getOpenCodeProcesses()` already provides process scan.
- `src/lib/db/localDb.js` — `tables.*` already provides DB access.
- `src/app/api/opencode/sessions/route.js` — OpenCode session listing already exists; the new diagnostic imports its logic.

## Dependencies

### Existing utilities (import, no changes)

| Module | Used exports |
|--------|-------------|
| `@/lib/terminal/ttyServer` | `ensureTTYServer`, `getTTYSessionsSnapshot`, `getActiveOpenCodeSessionIds` |
| `@/lib/swarm/openCodeProcesses` | `getOpenCodeProcesses` |
| `@/lib/swarm/runtimeStatus` | `RUNTIME_STATUS`, `detectQuotaSignals`, `createRuntimeDiagnosticsSnapshot`, `classifyTerminal`, `classifyProcess`, `classifyRegistry` |
| `@/lib/db/localDb` | `tables` (agent_registry, agent_runs, swarm_missions, supervisor_snapshots, agent_workspaces) |
| `@/lib/opencode/cli` | Session listing helper (or inline `execFile` call as in existing route) |

### External dependencies

| Package | Usage |
|---------|-------|
| `fs` (Node.js built-in) | Read log files and crash dump directory |
| `path` (Node.js built-in) | Resolve file paths |
| `child_process` (Node.js built-in) | `execFile` for `opencode session list` |
| `next/server` | `NextResponse.json()` |

### No new npm dependencies required

All functionality uses existing packages and Node.js built-ins.

## Implementation Notes for Coder

1. **Extract reusable logic**: The existing `src/app/api/swarm/runtime-diagnostics/route.js` has inline helpers (`safeReadRecentFile`, `readRecentCrashDumps`, `readDatabaseRows`, `buildRuntimeEvidenceRefs`). Move these to `src/lib/diagnostic/runtimeDiagnostic.js` so both the old and new endpoints can import them.

2. **New classification functions**: Add to `src/lib/swarm/runtimeStatus.js`:
   - `classifyWorkspace({ workspace, hasActiveRun, hasProcess })` → `WorkspaceStatus`
   - `detectSupervisorAnomalies({ supervisorSnapshots, agentRuns })` → `{ blockedTasks, awaitingApproval, orphanedRuns }`

3. **OpenCode session listing**: Import the session normalization logic from `src/app/api/opencode/sessions/route.js` or extract it to a shared utility. The diagnostic needs session IDs to cross-reference with terminals and processes.

4. **Response shape**: The new endpoint returns the full `DiagnosticResponse` interface above. The existing `/api/swarm/runtime-diagnostics` returns a subset — keep both working.

5. **Error handling**: Each data source should be independently wrapped. If `opencode session list` fails, return `{ opencodeSessions: [], dataSourceErrors: ['opencode-session-listing-failed'] }` rather than a 500.

6. **Caching**: No caching. This is a diagnostic endpoint — always fresh data. `dynamic = 'force-dynamic'` is sufficient.
