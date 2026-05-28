# Design: Swarm Director Durable Feed

Make the director feed a first-class durable timeline, not a chat side-effect. Extend the existing mission snapshot path (`getSwarmMissionDirectorSnapshot`) with a `director_feed` projection built from durable events/messages/state, then make health, SSE, and CLI consume that same contract. In the same slice, shrink the public MCP surface to the supported 24 tools by removing runtime lifecycle mutations, including `team_tell`.

## Technical Approach

`/api/agenthub/events` already dual-writes durable rows; this change makes `task_completed` and `handoff_ready` canonical, projection-ready inputs by validating required payload and writing linked mission metadata (`related_task_id`, `related_workspace_id`, `related_run_id`, `related_artifact_id`, `related_approval_checkpoint_key`). `src/lib/db/swarmMissions.js` will add a read-time projector that merges `agent_events`, `mission_messages`, `message_deliveries`, supervisor snapshots/checkpoints, and linked task/workspace/run rows into a Plyrium-like `director_feed` timeline with watermark and next-action hints. `src/lib/db/compactReads.js` will publish the stable presenter used by `/api/agenthub/operations/health`, `devhub mission status`, and `/api/agenthub/sessions/stream`. `agent_traces` and frontend chat remain supplementary only.

## Architecture Decisions

### Decision: Feed source of truth

| Option                                  | Tradeoff                                | Decision      |
| --------------------------------------- | --------------------------------------- | ------------- |
| Session/chat traces                     | Immediate, but not durable              | Reject        |
| `mission_messages` only                 | Backward-compatible, but weak semantics | Fallback only |
| Durable events + messages + state joins | More projection logic                   | Chosen        |

Rationale: current code already stores mission snapshots, deliveries, supervisor state, and event rows durably; director visibility must survive missing bindings and absent chat transport.

### Decision: Feed implementation shape

| Option                                                   | Tradeoff                        | Decision |
| -------------------------------------------------------- | ------------------------------- | -------- |
| New persisted feed table                                 | Extra writer path, drift risk   | Reject   |
| Frontend-only synthesis                                  | Fast UI change, wrong authority | Reject   |
| Read-time projection in `swarmMissions` + `compactReads` | Slightly richer reads           | Chosen   |

Rationale: narrow branch-safe change. It reuses `getSwarmMissionDirectorSnapshot()` and `compactReads` patterns already used by health/CLI.

### Decision: MCP boundary correction

| Option                                               | Tradeoff                  | Decision |
| ---------------------------------------------------- | ------------------------- | -------- |
| Keep all current registrations                       | Contract stays misleading | Reject   |
| Split modules again                                  | Unneeded churn            | Reject   |
| Keep files; change public registration/contract only | Smallest scope            | Chosen   |

Rationale: decomposition already exists. `devhub-mcp/server.js`, README, and catalog tests should define the public boundary. Removed public tools: `claim_next_task`, `renew_task_lease`, `release_task`, `request_supervisor_approval`, `prepare/create/update/report_agent_workspace`, `create/complete_agent_run`, `append_agent_artifact`, and `team_tell`.

## Data Flow

```text
Worker / adapter
  -> POST /api/agenthub/events
  -> agent_events + mission_messages
  -> listMissionDirectorFeedItems()
  -> readDirectorFeedSummary()
  -> operations/health + mission CLI + sessions/stream

message_deliveries = metadata
chat/session traces = supplemental only
director_feed = durable authority
```

## File Changes

| File                                              | Action | Description                                                                                                          |
| ------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `src/lib/db/schema.js`                            | Modify | Expand `agent_events` enum for `task_completed` and `handoff_ready`; rebuild table safely for SQLite `CHECK` change. |
| `src/lib/swarm/agentEvents.js`                    | Modify | Accept new event types and require projection-ready payload fields.                                                  |
| `src/app/api/agenthub/events/route.js`            | Modify | Normalize completion/handoff payload into durable linked rows; keep legacy mission message compatibility.            |
| `src/lib/db/swarmMissions.js`                     | Modify | Add `listMissionDirectorFeedItems` and include `director_feed` + watermark on mission snapshots.                     |
| `src/lib/db/compactReads.js`                      | Modify | Export `readDirectorFeedSummary` / presenter for shared adapter consumption.                                         |
| `src/app/api/agenthub/operations/health/route.js` | Modify | Return `director_feed` in `control_room_snapshot_input` from durable projection.                                     |
| `src/app/api/agenthub/sessions/stream/route.js`   | Modify | Emit `director-feed` events when the durable watermark changes.                                                      |
| `devhub-cli/commands/mission.js`                  | Modify | Show the same `director_feed` in mission status JSON/text.                                                           |
| `devhub-mcp/server.js`                            | Modify | Register only the 24 supported public tools; `team_tell` leaves the MCP boundary here.                               |
| `devhub-mcp/tests/integration/tools-list.test.js` | Modify | Lock the 24-tool catalog and assert excluded lifecycle tools stay absent.                                            |
| `devhub-mcp/README.md`                            | Modify | Document the corrected public contract and runtime/CLI ownership.                                                    |

## Interfaces / Contracts

```js
{
  authority: 'durable',
  watermark: 'sha1',
  items: [{
    feed_id, kind: 'task_completed' | 'handoff_ready', occurred_at,
    mission_id, agent_id, task_id, workspace_id, run_id, artifact_id,
    summary, next_action, evidence_ref,
    source: 'agent_event' | 'mission_message' | 'supervisor',
    delivery_status: 'pending' | 'sent' | 'failed' | 'binding_missing' | null,
  }],
}
```

## Testing Strategy

| Layer        | What to Test                                                                               | Approach                                                         |
| ------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Unit         | Event validation, feed ordering, watermark monotonicity, next-action derivation            | Extend `agentEvents`, `swarmMissions`, and `compactReads` tests. |
| Integration  | `/events`, `/operations/health`, `/sessions/stream` all expose the same durable feed truth | Add route tests with `binding_missing` and later durable events. |
| CLI/Contract | `mission status` and MCP catalog stay aligned with backend truth and 24-tool boundary      | Update CLI tests, README contract test, and tools-list snapshot. |

## Migration / Rollout

One SQLite migration rebuilds `agent_events` to allow the new event types. No feed table, no backfill: projector can read legacy `mission_messages` while new writes land in canonical `agent_events`. Roll out backend projection first, then adapter readers and MCP contract pruning in the same branch.

## Open Questions

- [ ] None.
