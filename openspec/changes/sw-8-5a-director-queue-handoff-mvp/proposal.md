# Proposal: SW-8.5A Director Queue Handoff MVP

## Intent

SW-8.5A comes AFTER SW-8.3A’s checkpointed Director-first room (`72b4d5017348ed8c148299a696d5175ad589d9cc`). Repo truth already has durable queue tools and control-room projections, so this slice stays narrow: show durable queue order to Director and add a safe claim handoff for the next task, with strict one-task-at-a-time progression and local checkpoint expectation before moving on.

## Scope

### In Scope

- Project durable queue truth into the existing Control Room from `get_execution_queue`.
- Surface a bounded “next task” / queue summary for Director from durable MCP data only.
- Add a safe handoff action/path that claims work through the existing queue seam, preferring `get_next_task` because it already claims and returns leased work.
- Make task order and “checkpoint current task before next claim” explicit in UI/API copy and tests.

### Out of Scope

- New dispatch engine, queue scorer, lease model, or durable schema.
- SW-8.6A prompt composer, SW-8.7A live evidence UI, SW-8.8A approvals UI, SW-9.x queue hardening.
- Browser/GTK/VTE/runtime-terminal control or broader workflow redesign.

## Capabilities

### New Capabilities

- `director-queue-handoff`: expose durable task order and next-task claim handoff inside the Director control room.

### Modified Capabilities

- `swarm-observability`: Control Room projections SHALL carry durable queue summary/handoff state without becoming a second queue authority.

## Approach

Reuse the current control-room shell and health snapshot seam. Read ordered queue state from DevHub MCP `get_execution_queue`; claim the next unit of work through `get_next_task`/`claim_next_task`, with `get_next_task` as the preferred handoff seam because it can claim work directly. `agent_workspaces`, `agent_runs`, and `supervisor_snapshots` remain durable truth; Control Room stays a projection, never a dispatcher.

## Affected Areas

| Area                                                                       | Impact         | Description                                                  |
| -------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------ |
| `openspec/changes/sw-8-5a-director-queue-handoff-mvp/proposal.md`          | New            | Proposal for bounded queue-handoff slice                     |
| `src/app/api/agenthub/operations/health/route.js`                          | Modified       | Add durable queue projection and bounded handoff action seam |
| `src/lib/operations/swarmControl.js`                                       | Modified       | Normalize/select queue summary + handoff state               |
| `src/views/SwarmControl.jsx`                                               | Modified       | Render Director queue order and claim handoff affordance     |
| `src/components/control-room/ControlRoomHeader.jsx` / new queue panel seam | Maybe Modified | Show queue summary without replacing current room            |
| `tests/agenthub/api/operations-health.test.js`                             | Modified       | Lock projection/handoff contract                             |
| `src/views/__tests__/SwarmControl.test.jsx`                                | Modified       | Lock strict-order UI boundary                                |

## Acceptance Boundary

Accepted when Director can see the durable ordered queue, initiate next-task handoff through existing claim primitives, and the flow clearly requires finishing/checkpointing the current task before moving on. Rejected if the slice introduces new queue authority, backend orchestration engine, prompt/evidence/approval UI, or browser/GTK work.

## Risks

| Risk                                            | Likelihood | Mitigation                                                                           |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| Projection becomes a second queue truth         | High       | Read only from existing MCP queue tools and durable supervisor/workspace/run records |
| Scope drifts into dispatch engine work          | High       | Ban new scorer/dispatcher/schema in spec and tests                                   |
| Claim flow skips strict order/checkpoint intent | Med        | Make single-next-task handoff and checkpoint copy part of acceptance/tests           |

## Rollback Plan

Revert queue projection/handoff UI and route changes. Existing DevHub MCP queue primitives and durable tables remain untouched.

## Dependencies

- SW-8.3A is completed and checkpointed at `72b4d5017348ed8c148299a696d5175ad589d9cc`; that gives a stable, clean Control Room baseline for this next slice.
- `devhub-mcp/server.js` already exposes `get_execution_queue`, `get_next_task`, and `claim_next_task`; SW-8.5A consumes these instead of inventing dispatch logic.
- Durable execution truth already lives in `agent_workspaces`, `agent_runs`, and `supervisor_snapshots`; current control-room projections exist, so only projection + safe claim handoff is needed.

## Success Criteria

- [ ] Director sees durable queue order in the existing Control Room without new queue authority.
- [ ] Next-task handoff uses existing queue claim primitives, with `get_next_task` treated as valid claim path.
- [ ] Flow communicates strict one-task order and local checkpoint before advancing.
- [ ] Slice stays out of SW-8.6A, SW-8.7A, SW-8.8A, SW-9.x, and BROWSER/GTK.
