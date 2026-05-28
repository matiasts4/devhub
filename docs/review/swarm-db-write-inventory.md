# Swarm DB Write Inventory

> **Date:** 2026-05-24
> **Purpose:** Identify all SQLite write operations during swarm launch/operation.
> **Classification:** Which writes can be async/queued vs. must be synchronous.

## Write Categories

### 1. Launch Metadata (synchronous — must complete before agent starts)

| Location | Operation | Table | Can Queue? |
|----------|-----------|-------|------------|
| `launchSwarmLocal` | INSERT mission | `swarm_missions` | No |
| `launchSwarmLocal` | INSERT participant | `mission_participants` | No |
| `launchSwarmLocal` | INSERT workspace lease | `agent_workspaces` | No |
| `launchSwarmLocal` | INSERT session | `agent_hub_sessions` | No |
| `launchSwarmLocal` | UPDATE workspace (activate) | `agent_workspaces` | No |
| `launchSwarmLocal` | INSERT agent run | `agent_runs` | No |

### 2. Presence (can be queued — eventual consistency acceptable)

| Location | Operation | Table | Can Queue? |
|----------|-----------|-------|------------|
| `launchSwarmLocal` | INSERT/UPDATE presence | `agent_presence` | **Yes** |
| Heartbeat endpoint | UPDATE presence | `agent_presence` | **Yes** |
| Reconciliation | UPDATE presence | `agent_presence` | **Yes** |

### 3. Events (can be queued — append-only, no urgency)

| Location | Operation | Table | Can Queue? |
|----------|-----------|-------|------------|
| Events endpoint | INSERT message | `mission_messages` | **Yes** |
| Events endpoint | INSERT trace | `agent_traces` | **Yes** |

### 4. Registry (synchronous — must be consistent)

| Location | Operation | Table | Can Queue? |
|----------|-----------|-------|------------|
| Agent registration | INSERT agent | `registered_agents` | No |
| Profile binding | INSERT binding | `profile_capability_bindings` | No |

### 5. Sessions (can be queued — UI can tolerate slight delay)

| Location | Operation | Table | Can Queue? |
|----------|-----------|-------|------------|
| Session creation | INSERT session | `agent_hub_sessions` | **Yes** |
| Session update | UPDATE session | `agent_hub_sessions` | **Yes** |

### 6. Runs (synchronous — provenance must be accurate)

| Location | Operation | Table | Can Queue? |
|----------|-----------|-------|------------|
| Run creation | INSERT run | `agent_runs` | No |
| Run update | UPDATE run status | `agent_runs` | **Yes** |

## Queue Recommendations

### Must be synchronous (no queue):
- Mission creation
- Workspace lease/activation
- Agent run creation (provenance)
- Agent registration

### Can be queued:
- Presence heartbeats (TTL-based, eventual consistency OK)
- Events (append-only, no readers depend on immediate availability)
- Session updates (UI polling, slight delay acceptable)
- Run status updates (can be batched)

### Implementation:
- Use `withDbWriteQueue()` from `src/lib/db/writeQueue.js`
- Default timeout: 10s
- All queued writes should have retry logic
- Critical writes (mission, workspace, run creation) bypass queue

## WAL Considerations

- WAL mode already active (`journal_mode = WAL`)
- busy_timeout = 5000ms
- Checkpoint policy: auto-checkpoint when WAL > 50MB
- See `src/lib/db/walCheckpoint.js`
