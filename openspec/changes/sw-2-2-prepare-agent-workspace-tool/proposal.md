# Proposal: SW-2.2 Prepare Agent Workspace Tool

## Intent

Freeze the missing bridge between SW-2.1 workspace reservations and SW-3.1 audit artifacts. SW-2.2 exists now because both upstream contracts are frozen, but `prepare_agent_workspace` still lacks a narrow control-plane contract that lets executors provision workspaces and return auditable evidence without exposing git/worktree verbs through DevHub MCP.

## Scope

### In Scope

- Define `prepare_agent_workspace` request/ack contract: `workspace_id` or `{task_id, agent_id}`, optional base-ref override, reservation/correlation identity.
- Define executor adapter result contract: requested base ref, observed `branch/head/dirty/path`, lifecycle status, drift/error class, timestamps, and opaque `evidence_ref`.
- Freeze idempotency, retry, collision, and `dirty-excluded` handling against baseline `f814998dd05cb491caf8637bf570dbd74b539090`, SW-2.1 checkpoint `02d82361449a09e93e5880a08e35e3043617002d`, and SW-3.1 checkpoint `4b1e344dcd202c911498af17236fcb86a2a2cb1e`.

### Out of Scope

- Implementing MCP handlers, schema, adapters, or route refactors.
- Adding git/branch/worktree/merge filesystem verbs to DevHub MCP.
- Expanding GTK/VTE beyond attach-surface use, or defining Supervisor Loop, Control Room, or Telegram workflows.

## Capabilities

### New Capabilities

- `agent-workspace-preparation`: control-plane contract for executor-driven workspace preparation and auditable evidence handoff.

### Modified Capabilities

- None.

## Approach

Keep DevHub control-plane only. `prepare_agent_workspace` records intent and returns an acknowledgement; executor adapters perform provisioning and emit opaque `evidence_ref` that resolves in the audit layer, not in MCP. Durable truth remains `agent_workspaces` plus SW-3.1 run/artifact records; `devhub_agent_runs` stays runtime-local only. Existing direct git/merge side effects in `src/app/api/agent/execute/route.js` and `src/app/api/agent/qa-result/route.js` are boundary debt this contract must constrain, not re-legitimize.

## Affected Areas

| Area                                                                  | Impact    | Description                                    |
| --------------------------------------------------------------------- | --------- | ---------------------------------------------- |
| `openspec/changes/sw-2-2-prepare-agent-workspace-tool/proposal.md`    | New       | SW-2.2 proposal artifact                       |
| `openspec/changes/sw-2-2-prepare-agent-workspace-tool/exploration.md` | Reference | Upstream analysis and checkpoints              |
| `openspec/specs/agent-workspace-preparation/spec.md`                  | New       | Future spec for request/ack/evidence contract  |
| `src/app/api/agent/execute/route.js`                                  | Reference | Existing git side effects to fence off later   |
| `src/app/api/agent/qa-result/route.js`                                | Reference | Existing merge side effects to fence off later |

## Risks

| Risk                                           | Likelihood | Mitigation                                                                   |
| ---------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| `evidence_ref` too vague for audit joins       | High       | Freeze minimum shape: kind, locator, integrity/version hint, correlation ids |
| Retry overwrites prior evidence                | Med        | Require append-only evidence and fresh refs per retry                        |
| Collision recovery normalizes `dirty-excluded` | Med        | Force `conflicted/orphaned` reporting instead of silent cleanup              |

## Rollback Plan

Discard this proposal/spec line and keep current behavior unchanged; proposal phase introduces no runtime changes.

## Dependencies

- `sdd/sw-2-2-prepare-agent-workspace-tool/explore`
- SW-2.1 frozen workspace contract and SW-3.1 frozen audit contract
- Future consumers (Supervisor Loop, Control Room, Telegram) depend on this contract but stay out of scope

## Success Criteria

- [ ] Proposal explains why SW-2.2 starts after SW-2.1 and SW-3.1 freeze
- [ ] Scope and non-goals keep DevHub out of git/worktree ownership
- [ ] Minimum adapter output and opaque `evidence_ref` are explicit and auditable
- [ ] Idempotency, retry, collision, and future-consumer dependency edge are documented
