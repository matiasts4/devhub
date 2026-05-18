# Proposal: SW-3.1 Agent Runs and Artifacts Model

## Intent

Define durable `agent_runs` and append-only `agent_artifacts` so DevHub records executor evidence without turning `devhub_agent_runs` into durable truth. Build on SW-2.1’s frozen `agent_workspaces` contract and clarify what `prepare_agent_workspace` must emit into `evidence_ref` for SW-2.2.

## Scope

### In Scope

- Specify immutable `agent_runs` header linked to task, agent, workspace, baseline `f814998dd05cb491caf8637bf570dbd74b539090`, and recovery lineage.
- Specify append-only `agent_artifacts` ledger for executor evidence: workspace prep, git/worktree actions, diffs, logs, tests, QA, attachments.
- Define `evidence_ref` framing so `prepare_agent_workspace` reports auditable evidence bundles/timeline references, not embedded control-plane payloads.

### Out of Scope

- Implementing schema, APIs, migrations, or executor adapters.
- Moving git/worktree/branch/merge ownership into DevHub MCP verbs.
- Expanding GTK/VTE beyond attach-surface responsibilities.

## Capabilities

### New Capabilities

- `agent-run-artifact-audit`: durable run header plus append-only artifact evidence model for executor actions and recovery.

### Modified Capabilities

- None.

## Approach

Keep DevHub as control plane/system of record, but split runtime mirror from durable audit history: `devhub_agent_runs` stays UI/runtime-local only; durable truth becomes `agent_runs` + `agent_artifacts`. Treat branch/worktree/merge operations only as executor-produced evidence. Proposal must also freeze that `prepare_agent_workspace` emits evidence for requested base ref, observed branch/head/dirty/path, provisioning outcome, and any drift/error, referenced through opaque `evidence_ref`. Planning checkpoint `02d82361449a09e93e5880a08e35e3043617002d` and broader `dirty-excluded` tree remain observational evidence only.

## Affected Areas

| Area                                                                | Impact    | Description                                                          |
| ------------------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| `openspec/changes/sw-3-1-agent-runs-artifacts-model/proposal.md`    | New       | SW-3.1 proposal artifact                                             |
| `openspec/changes/sw-3-1-agent-runs-artifacts-model/exploration.md` | Reference | Upstream framing and route-boundary risk                             |
| `src/lib/db/localDb.js`                                             | Modified  | Future durable run/artifact persistence surface                      |
| `src/app/api/agent/execute/route.js`                                | Modified  | Future refactor: git branch side effects become executor evidence    |
| `src/app/api/agent/qa-result/route.js`                              | Modified  | Future refactor: merge/cleanup side effects become executor evidence |

## Risks

| Risk                                                | Likelihood | Mitigation                                                            |
| --------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| Runtime mirror becomes durable truth again          | Med        | Keep `devhub_agent_runs` explicitly mirror-only in spec/design        |
| SW-2.2 emits inconsistent evidence                  | High       | Freeze minimum `prepare_agent_workspace` evidence contract now        |
| Control-plane/executor boundary regresses in routes | High       | Model direct git/merge flows as auditable evidence, not MCP ownership |

## Rollback Plan

Discard this proposal line and keep current observational state; no runtime behavior changes in proposal phase.

## Dependencies

- Required upstream artifact: `sdd/sw-3-1-agent-runs-artifacts-model/explore`
- Depends on SW-2.1 frozen `agent_workspaces` + opaque `evidence_ref`
- Makes SW-2.2 safer by defining evidence emitted from `prepare_agent_workspace`

## Success Criteria

- [ ] Proposal states `agent_runs` durable header and `agent_artifacts` append-only ledger clearly
- [ ] Proposal keeps DevHub control-plane ownership separate from executor git/worktree actions
- [ ] Proposal clarifies `prepare_agent_workspace` evidence output and keeps `devhub_agent_runs` mirror-only
