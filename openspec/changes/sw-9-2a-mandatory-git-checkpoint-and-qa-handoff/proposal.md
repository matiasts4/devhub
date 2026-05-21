# Proposal: SW-9.2A mandatory git checkpoint and QA handoff

## Intent

Close the durable loophole that still lets tasks reach `completed` or `qa-ready` without verified git checkpoint evidence. Make the server reject those transitions unless the task has a valid checkpoint/handoff record, while keeping zero-change analysis flows explicitly allowed with `commit=none`.

## Scope

### In Scope

- Enforce checkpoint validation in the durable task transition path for `completed` and `qa-ready` style handoff outcomes.
- Require auditable `[git:checkpoint]` evidence with `commit=<sha|none>`, checks run, touched docs, and working tree status.
- Surface clear agent/operator messaging when the gate blocks handoff, including the `commit=none` zero-change rule.

### Out of Scope

- Lease, orphan, or queue recovery logic from SW-9.1A.
- Broad workflow rewrites, notification redesign, or prompt-only/client-only enforcement.

## Capabilities

### New Capabilities

- `git-checkpoint-handoff`: Durable server-side validation for task closure and QA handoff checkpoint evidence.

### Modified Capabilities

- `swarm-observability`: Snapshot and operator surfaces MUST expose checkpoint gate failures and accepted handoff evidence consistently.

## Approach

Extend the existing DevHub mutation path so task status changes to terminal or QA-handoff states verify checkpoint evidence before persisting. Reuse task comments as human-readable audit trail, but treat server validation as authority. Accept `commit=none` only when the task is analysis-only with zero file changes; otherwise block the transition and return explicit remediation text to the agent/operator.

## Affected Areas

| Area                                                                                | Impact   | Description                                                                 |
| ----------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `devhub-mcp/server.js`                                                              | Modified | Enforce checkpoint gate in task status transitions and evidence validation. |
| `src/app/api/agenthub/operations/health/route.js`                                   | Modified | Project blocked/accepted handoff evidence into durable snapshots.           |
| `src/views/SwarmControl.jsx` / `src/components/control-room/DirectorQueuePanel.jsx` | Modified | Show operator-facing gate status/remediation messaging only.                |
| `devhub-mcp/AGENT-FLOW.md`, `docs/24_Politica_Git_y_Versionado_Agentes.md`          | Modified | Align runtime rule text with enforced server behavior.                      |

## Risks

| Risk                                   | Likelihood | Mitigation                                                               |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| Analysis tasks get blocked incorrectly | Med        | Narrow `commit=none` to verified zero-change flows and cover with tests. |
| UI suggests authority it does not own  | Low        | Keep client as read-model/messaging layer; server stays source of truth. |

## Rollback Plan

Revert the checkpoint validation and snapshot/UI messaging changes together, restoring previous task transition behavior and related docs/tests in one patch.

## Dependencies

- Existing task comments, supervisor snapshot projection, and DevHub MCP task mutation surfaces.

## Success Criteria

- [ ] Tasks cannot reach `completed` or `qa-ready` without valid checkpoint evidence in the durable path.
- [ ] `commit=none` is accepted only for zero-change analysis and rejected for changed work.
- [ ] Agents and operators see clear remediation/status messaging when the gate blocks handoff.
