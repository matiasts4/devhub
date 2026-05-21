# Proposal: SW-2.1 Agent Workspaces Strategy

## Intent

Define the control-plane contract for agent workspaces so DevHub can track ownership, lifecycle, recovery, and evidence without executing git/worktree commands. Baseline is commit `f814998dd05cb491caf8637bf570dbd74b539090`; current dirty tree is `dirty-excluded`.

## Scope

### In Scope

- Specify durable `agent_workspaces` metadata, lifecycle states, and observed-state fields.
- Define executor boundary: DevHub stores desired/observed state; executors own branch/worktree commands.
- Define dependency handoff to SW-3.1 for auditable run/artifact evidence.

### Out of Scope

- Implementing schema, APIs, executor adapters, or cleanup jobs.
- Reusing `devhub_agent_runs`, `agent_registry`, or `agent_hub_sessions` as git ownership sources.
- SW-2.2 execution work before this contract is approved/frozen.

## Capabilities

### New Capabilities

- `agent-workspace-lifecycle`: control-plane contract for workspace identity, lifecycle, observed git state, recovery, and evidence references.

### Modified Capabilities

- None.

## Approach

Adopt a dedicated `agent_workspaces` control-plane model anchored to the safe baseline commit and explicit base branch metadata. Store deterministic workspace identity, status transitions, `observed_head/branch/dirty`, and `evidence_ref`; require executors to report results back after git/worktree actions. Treat `dirty-excluded` as non-contract state until a clean provisioning flow exists.

## Affected Areas

| Area                                                               | Impact    | Description                             |
| ------------------------------------------------------------------ | --------- | --------------------------------------- |
| `openspec/changes/sw-2-1-agent-workspaces-strategy/proposal.md`    | New       | SW-2.1 proposal contract                |
| `openspec/changes/sw-2-1-agent-workspaces-strategy/exploration.md` | Reference | Source analysis and recommendation      |
| `openspec/specs/`                                                  | New       | Future `agent-workspace-lifecycle` spec |

## Risks

| Risk                                          | Likelihood | Mitigation                                         |
| --------------------------------------------- | ---------- | -------------------------------------------------- |
| Boundary drift back into DevHub git execution | Med        | Freeze executor-only command rule in spec/design   |
| Workspace naming/collision ambiguity          | Med        | Require stable workspace id + deterministic naming |
| SW-2.2 starts on unstable contract            | High       | Explicit dependency block until SW-2.1 approval    |

## Rollback Plan

Discard this proposal/spec line and keep current behavior unchanged; no runtime or schema changes are introduced in SW-2.1 proposal phase.

## Dependencies

- Required input: `sdd/sw-2-1-agent-workspaces-strategy/explore`
- SW-3.1 depends on `evidence_ref`/artifact contract from SW-2.1
- SW-2.2 blocked until SW-2.1 contract is approved/frozen

## Success Criteria

- [ ] Proposal states DevHub/executor ownership boundary unambiguously
- [ ] Baseline commit and `dirty-excluded` handling are explicit
- [ ] SW-2.2 block and SW-3.1 dependency edge are documented
