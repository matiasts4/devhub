# Agent Workspace Preparation Specification

## Purpose

Define `prepare_agent_workspace` as a narrow DevHub control-plane contract that records workspace-preparation intent and accepts executor audit evidence without exposing git, branch, merge, worktree, or filesystem verbs through MCP.

## Requirements

### Requirement: Narrow prepare request and acknowledgement

The system MUST accept `prepare_agent_workspace` with exactly one workspace identity form: `workspace_id` OR `{task_id, agent_id}`. The request MAY include `requested_base_ref`; otherwise the shared remote-safe baseline MUST default to `f814998dd05cb491caf8637bf570dbd74b539090`. The acknowledgement MUST return `workspace_id`, `task_id`, `agent_id`, `requested_base_ref`, `reservation_token`, `correlation_id`, `status`, and `accepted_at`. The contract MUST NOT expose git/worktree/merge/file-operation verbs.

#### Scenario: Accept canonical preparation intent

- GIVEN a valid workspace identity and no explicit base override
- WHEN `prepare_agent_workspace` is accepted
- THEN the acknowledgement returns the resolved workspace identity and baseline `f814998dd05cb491caf8637bf570dbd74b539090`
- AND the status is a control-plane lifecycle value, not an execution verb

#### Scenario: Reject ambiguous identity

- GIVEN a request missing `workspace_id` and also missing either `task_id` or `agent_id`
- WHEN `prepare_agent_workspace` is called
- THEN the request is rejected as invalid

### Requirement: Durable metadata boundary

DevHub MUST store only durable control-plane truth: workspace identity, requested base ref, lifecycle status, reservation/correlation ids, last error class, recovery reason, and the latest opaque `evidence_ref`. Observed branch, head commit, dirty state, filesystem path, and concrete git/worktree actions MUST remain executor evidence only. `devhub_agent_runs` MUST remain UI/runtime-local and SHALL NOT be treated as durable truth.

#### Scenario: Persist control-plane truth only

- GIVEN executor preparation completes with observed branch, head, dirty, and path details
- WHEN DevHub records the outcome
- THEN DevHub stores status plus opaque `evidence_ref`
- AND the observed workspace snapshot remains outside DevHub durable fields

### Requirement: Opaque evidence handoff and SW-3.1 join

Executor completion MUST emit an opaque `evidence_ref` for every accepted preparation attempt. DevHub MUST store and forward `evidence_ref` unchanged. The audit layer behind SW-3.1 MUST be able to resolve that reference to workspace-preparation evidence with invariant join metadata for `workspace_id`, `correlation_id`, evidence kind, and integrity/version hint, plus optional later linkage to `agent_runs` or `agent_artifacts`.

#### Scenario: Join workspace prep evidence into audit history

- GIVEN a prepared workspace has an `evidence_ref`
- WHEN SW-3.1 audit consumers dereference it
- THEN they can join the preparation evidence to the originating workspace and correlation
- AND DevHub does not need to understand executor-local artifact layout

### Requirement: Idempotency, retry, and recovery states

Idempotency MUST be scoped to `workspace_id` plus `correlation_id`. A duplicate call with the same pair MUST be a no-op acknowledgement unless new executor evidence changes the lifecycle state. A retry after failure MUST create fresh evidence and MUST NOT overwrite prior evidence. Observed ownership collision or base drift MUST transition the workspace to `conflicted`. Executor loss after acceptance SHOULD transition to `orphaned`. `dirty-excluded` state relative to baseline `f814998dd05cb491caf8637bf570dbd74b539090` MUST be reported as observed reality and MUST NOT be normalized to clean.

#### Scenario: Duplicate prepare call is idempotent

- GIVEN the same `workspace_id` and `correlation_id` were already accepted
- WHEN the caller retries without new evidence
- THEN DevHub returns the prior acknowledgement
- AND no prior evidence is replaced

#### Scenario: Collision preserves dirty-excluded truth

- GIVEN executor observes a branch/workspace ownership collision or dirty-excluded divergence
- WHEN the result is reported
- THEN the workspace status becomes `conflicted` or `orphaned` as applicable
- AND DevHub does not rewrite the workspace as clean

### Requirement: Boundary guardrails and non-goals

This capability MUST freeze planning boundaries only. It SHALL NOT require GTK/VTE for runtime orchestration; GTK/VTE is only an attach/terminal surface. It SHALL NOT legitimize existing direct git/merge side effects in `src/app/api/agent/execute/route.js` or `src/app/api/agent/qa-result/route.js`; those remain boundary violations to remove later, not precedent for this contract.

#### Scenario: Executor-side git behavior stays outside MCP

- GIVEN an implementation needs checkout, branch, merge, or worktree manipulation
- WHEN that implementation is designed against this spec
- THEN those actions stay inside executor adapters and their evidence
- AND DevHub MCP surface remains control-plane only
