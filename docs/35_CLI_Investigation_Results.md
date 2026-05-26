# CLI Investigation Results

## Executive Summary

Investigation of DevHub CLI capabilities and gaps to guide implementation of missing commands. Compared against available backend operations, domain functions, and Plyrium feature parity.

## Current CLI Map

| Command         | Description                 | Backend Source                         | LOC (excl tests) | Status      | Gaps                   |
| --------------- | --------------------------- | -------------------------------------- | ---------------- | ----------- | ---------------------- |
| `status`        | Compact swarm dashboard     | DB queries (compactReads)              | ~50              | ✅ Complete | None                   |
| `queue`         | Prioritized execution queue | compactReads.readExecutionQueueSummary | ~70              | ✅ Complete | None                   |
| `agents`        | Registered swarm agents     | agent_workspaces table                 | ~40              | ✅ Complete | None                   |
| `swarm`         | Composite overview          | Multiple DB queries                    | ~150             | ✅ Complete | None                   |
| `task`          | Task detail by ID           | readTaskById                           | ~60              | ⚠️ Partial  | Missing `task history` |
| `ws`            | Workspace detail            | agent_workspaces table                 | ~60              | ✅ Complete | None                   |
| `heartbeat`     | Record agent heartbeat      | POST /presence/heartbeat               | ~20              | ✅ Complete | Not authenticated      |
| `update-status` | Update agent status         | agent_workspaces table                 | ~30              | ✅ Complete | None                   |
| `claim`         | Claim next pending task     | claimNextTask()                        | ~50              | ✅ Complete | None                   |
| `release`       | Release claimed task        | releaseTask()                          | ~40              | ✅ Complete | None                   |
| `tell`          | Send mission message        | createMissionMessage()                 | ~50              | ✅ Complete | None                   |
| `swarm-launch`  | Launch swarm from project   | POST /operations/health                | ~80              | ✅ Complete | No auth                |

**Total LOC (excluding tests)**: ~700

## Backend Capabilities Not Exposed by CLI

### High Priority (Core Operations)

| Capability             | Source                                                   | Proposed Command                      | Why High Priority                       |
| ---------------------- | -------------------------------------------------------- | ------------------------------------- | --------------------------------------- |
| Agent authentication   | src/lib/swarm/auth.js (generateAgentSecret, signRequest) | `auth login/status/verify`            | Required for secure CLI operations      |
| Agent events stream    | GET /api/agenthub/events                                 | `events list/stream`                  | Essential for monitoring agent activity |
| Task history           | localDb.getTaskHistory()                                 | `task history <id>`                   | Critical for debugging task failures    |
| Supervisor diagnostics | runtimeStatus.createRuntimeDiagnosticsSnapshot()         | `supervisor status`                   | Required for health monitoring          |
| Checkpoint approval    | supervisor.upsertSupervisorApprovalCheckpoint()          | `supervisor approve/reject <id>`      | Human-in-loop approval workflow         |
| Mission closure        | missionClose.closeMission()                              | `mission close <id>`                  | Complete mission lifecycle              |
| Mission listing        | swarm_missions table                                     | `mission list/status <id>`            | Mission visibility                      |
| Agent run history      | agentRuns.listAgentRuns()                                | `run list/status <id>`                | Track execution history                 |
| Agent artifacts        | agentRunArtifacts.listAgentArtifacts()                   | `run status <id>` (include artifacts) | Evidence and output tracking            |
| Presence listing       | GET /api/agenthub/presence/heartbeat                     | `presence list`                       | Real-time agent status                  |

### Medium Priority (Operational Utilities)

| Capability          | Source                                        | Proposed Command             | Why Medium Priority                  |
| ------------------- | --------------------------------------------- | ---------------------------- | ------------------------------------ |
| Worktree management | integrationWorktree.js (implied)              | `worktree list/status/clean` | Cleanup operations                   |
| Inbox operations    | localDb (markInboxItemRead, dismissInboxItem) | `inbox list/read/dismiss`    | Human notification workflow          |
| WAL checkpoint      | walCheckpoint.js                              | `supervisor wal-checkpoint`  | DB maintenance (automated in daemon) |

### Low Priority (Advanced/Rare Operations)

| Capability         | Source               | Proposed Command      | Why Low Priority       |
| ------------------ | -------------------- | --------------------- | ---------------------- |
| Trace persistence  | agent_traces table   | `traces list/export`  | Already handled by MCP |
| Session management | agent_sessions table | `sessions list/abort` | Primarily API-driven   |

## Comparison with Plyrium

### High Alignment (Equivalent Features)

| DevHub CLI        | Plyrium Equivalent | Notes                                               |
| ----------------- | ------------------ | --------------------------------------------------- |
| `status`          | Project dashboard  | DevHub is swarm-focused; Plyrium is project-focused |
| `queue`           | Execution queue    | DevHub includes launch_id and swarm context         |
| `claim`/`release` | Task claim/release | Same pattern                                        |
| `swarm-launch`    | Launch automation  | DevHub uses POST API; Plyrium may differ            |

### Medium Alignment (Similar Intent, Different Approach)

| DevHub CLI | Plyrium Equivalent | Gap                                                                  |
| ---------- | ------------------ | -------------------------------------------------------------------- |
| `agents`   | Agent registry     | Plyrium tracks per-project agents; DevHub tracks across all projects |
| `tell`     | Mission messages   | Plyrium uses different message schema                                |
| `task`     | Task detail        | DevHub lacks Plyrium's inline history view                           |

### Low Alignment (Not in Plyrium or Not Applicable)

| Feature                               | Status                                       |
| ------------------------------------- | -------------------------------------------- |
| Auth foundation (`auth login/verify`) | ❌ Not in Plyrium (uses different auth)      |
| Events streaming (`events stream`)    | ❌ Not in Plyrium                            |
| Supervisor approval checkpoints       | ❌ Not in Plyrium                            |
| Worktree utilities                    | ❌ Not in Plyrium (different worktree model) |

## HMAC Auth Analysis

### How It Works

1. **Secret Generation**: `generateAgentSecret()` produces 64-char hex string (32 random bytes)
2. **Storage**: Secret stored in `~/.devhub/auth.json` with `0600` permissions
3. **Signature**:
   - Timestamp: ISO 8601 (`new Date().toISOString()`)
   - Body hash: SHA-256 of request body (JSON stringified)
   - Message: `${timestamp}.${body_hash}`
   - Signature: HMAC-SHA256 of message using secret
4. **Headers**:
   ```
   X-Agent-ID: <agent-id>
   X-Timestamp: <ISO-8601-timestamp>
   X-Signature: <hmac-sha256-hex>
   ```
5. **Verification**: `withAuth` middleware checks signature + 30s timestamp window

### Current CLI Auth State

| Command        | Protected Endpoint?  | Sends Auth? | Notes                                                |
| -------------- | -------------------- | ----------- | ---------------------------------------------------- |
| `swarm-launch` | ❌ (health endpoint) | ❌          | No auth required                                     |
| `heartbeat`    | ⚠️ (POST only)       | ❌          | GET unprotected, POST protected but CLI doesn't auth |

**Gap**: CLI has NO auth implementation. All commands are unauthenticated.

### Auth Foundation Requirements

1. **`auth login`**:
   - Generate secret via `generateAgentSecret()`
   - Provision in DB via `provisionAuthToken(db, { agentId, tokenHash: hashToken(secret), rawSecret: secret })`
   - Save to `~/.devhub/auth.json`: `{ agent_id, secret, workspace_id, created_at }`
   - Perms: `chmod 0600 ~/.devhub/auth.json`
2. **`auth status`**:
   - Read `~/.devhub/auth.json`
   - Display: agent_id, workspace_id, created_at, secret hash (first 8 chars)
3. **`auth verify`**:
   - Read auth file
   - Make signed request to POST /api/agenthub/presence/heartbeat with minimal body
   - If 200 → valid; if 401 → invalid; if connection error → server down

## Implementation Priority

1. **Phase 1 (Core Auth & Monitoring)**: `auth`, `events`, `presence`
2. **Phase 2 (Task & Mission Ops)**: `task history`, `mission`, `run`
3. **Phase 3 (Supervisor & Cleanup)**: `supervisor`, `worktree`, `inbox`

## Known Limitations

- **No inbox table**: `inbox` commands will be implemented with schema stubs but may fail at runtime if table doesn't exist.
- **No worktree list function**: `worktree list` will query agent_workspaces instead of dedicated worktree registry.
- **Supervisor approval**: No direct HTTP endpoint; will use domain ops from `src/lib/db/supervisor.js`.
- **Mission close**: Uses domain op `closeMission()` from `src/lib/swarm/missionClose.js`.

---

**Investigation Date**: 2026-05-25  
**Investigator**: AI  
**Status**: Ready for implementation
