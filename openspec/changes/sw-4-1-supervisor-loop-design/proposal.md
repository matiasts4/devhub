# Proposal: SW-4.1 Supervisor Loop Design

## Intent

SW-4.1 starts now because SW-2.1 froze `agent_workspaces`, SW-3.1 froze durable `agent_runs`/`agent_artifacts`, and SW-2.2 froze `prepare_agent_workspace` intent plus evidence handoff. With those boundaries stable, DevHub can define one supervisor contract that coordinates them without inheriting git/worktree execution debt.

## Scope

### In Scope

- Define the Supervisor Loop ownership boundary over queue selection, lease supervision, workspace/run/artifact reads, and human escalation.
- Standardize loop inputs/outputs: queue snapshot, lease/workspace/run state, latest `evidence_ref`, normalized decision/outcome reasons, and approval requests.
- Make retries, blocked-task detection, orphan lease/workspace recovery, and risky-action approval explicit for downstream consumers.

### Out of Scope

- Implementing the loop, DB/API changes, or UI/runtime wiring.
- Moving git/worktree/merge/filesystem execution into DevHub.
- Making `devhub_agent_runs` durable or changing frozen SW-2.1/SW-3.1/SW-2.2 contracts.

## Capabilities

### New Capabilities

- `supervisor-loop-control`: durable control-plane contract for supervising task leases, workspace/run evidence, retry/block/recovery decisions, and human approval gates.

### Modified Capabilities

- None.

## Approach

Treat the Supervisor Loop as a coordinator, not an executor. It reads `get_execution_queue`, `claim_next_task`, `renew_task_lease`, `release_task`, workspace status, and run/artifact evidence, then emits normalized actions such as `dispatch`, `wait`, `retry`, `block`, `recover_orphan`, `request_approval`, or `close`. Risky or destructive outcomes stay pending until a human approves. Existing execute/QA git side effects remain downstream cleanup debt, not supervisor ownership.

## Affected Areas

| Area                                                         | Impact    | Description                                           |
| ------------------------------------------------------------ | --------- | ----------------------------------------------------- |
| `openspec/changes/sw-4-1-supervisor-loop-design/proposal.md` | New       | SW-4.1 proposal artifact                              |
| `devhub-mcp/server.js`                                       | Modified  | Future loop reads over queue/lease primitives         |
| `src/app/api/agent/execute/route.js`                         | Reference | Existing git side-effect debt behind supervisor gates |
| `src/app/api/agent/qa-result/route.js`                       | Reference | Existing merge/cleanup debt behind human approval     |

## Risks

| Risk                                       | Likelihood | Mitigation                                                           |
| ------------------------------------------ | ---------- | -------------------------------------------------------------------- |
| Supervisor duplicates scheduler logic      | Med        | Reuse existing queue/lease primitives; do not add parallel ownership |
| Implicit retries/orphans hide unsafe state | High       | Require explicit reason codes, counters, and recovery states         |
| Risky actions bypass humans                | High       | Freeze mandatory approval gate before destructive outcomes           |

## Rollback Plan

Discard this proposal and keep current behavior unchanged; proposal phase introduces no runtime changes.

## Dependencies

- `sdd/sw-4-1-supervisor-loop-design/explore`
- Frozen SW-2.1, SW-3.1, and SW-2.2 artifacts/checkpoints
- Docs boundary: control-plane only, GTK/VTE attach-only, human approval required for risky actions

## Success Criteria

- [ ] Proposal explains why SW-4.1 follows SW-2.1, SW-3.1, and SW-2.2
- [ ] Supervisor ownership boundary, inputs/outputs, and escalation gates are unambiguous
- [ ] Retry, blocked, orphan, and approval semantics are explicit enough for Control Room, Telegram, and MCP follow-up work
