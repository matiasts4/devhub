# CLI Shared Core Specification

## Purpose

Define the first Fase 14 dependency slice: one reusable read contract for compact durable summaries reused by CLI commands, public MCP adapters, and the health route without exposing runtime plumbing.

## Out of Scope

- Full CLI command implementation or final output for `status`, `queue`, `agents`, `swarm`, `task`, `ws`, or `run`.
- Public MCP pruning or runtime/session redesign.
- Durable schema changes.

## Requirements

### Requirement: Shared compact durable summaries

The system MUST provide one shared read contract for compact Director snapshot, execution queue, and workspace-run-evidence summaries. These summaries SHALL derive from mission, queue, workspace, run, artifact, and supervisor truth. For the same durable state, results MUST be deterministic, bounded, and MUST NOT depend on raw logs, traces, or observer-only mirrors.

#### Scenario: Shared core returns compact durable summaries

- GIVEN durable mission, queue, workspace, run, artifact, and supervisor records exist
- WHEN a consumer requests Director, queue, or workspace-run-evidence summaries
- THEN the shared core returns compact summaries from those records
- AND the response does not invent additional truth outside the bounded contract

#### Scenario: Runtime hints do not replace durable truth

- GIVEN runtime-local mirrors or high-frequency hints are stale, missing, or different
- WHEN the shared core composes a summary
- THEN durable records remain authoritative
- AND runtime-local state is not required to complete the bounded read

### Requirement: MCP and health-route adapter parity

The system MUST let the public MCP adapter and the operations health route consume the same read contracts. Equivalent reads over the same durable state SHALL produce equivalent semantics, differing only in wrapper or transport fields.

#### Scenario: Queue semantics stay aligned across adapters

- GIVEN the same durable queue truth for a project
- WHEN the public MCP adapter and the health route read the queue summary
- THEN both expose the same ordering, blocked semantics, and bounded lease-facing fields
- AND neither adapter re-ranks or fabricates entries

#### Scenario: Empty or missing states stay aligned across adapters

- GIVEN durable summary data is empty or partially missing
- WHEN both adapters read the same contract
- THEN both return stable empty or degraded states
- AND neither adapter fabricates fallback truth to hide the missing data

### Requirement: Explicit public-MCP versus internal-runtime boundary

The public MCP SHALL expose bounded durable contracts needed by external clients, including portable project, task, milestone, comment, queue, lease, and evidence reads. High-frequency agent plumbing, heartbeats, session reconciliation, binding resolution, and observer-only mirrors SHALL remain owned by the internal runtime and MUST NOT become required public read inputs.

#### Scenario: External consumer reads bounded durable contract

- GIVEN an external client reads queue or workspace evidence through the public MCP
- WHEN the read succeeds
- THEN the client receives bounded durable contract data
- AND it does not need runtime-local heartbeats, session polling, or binding internals

#### Scenario: Internal runtime keeps high-frequency ownership

- GIVEN the runtime performs polling, reconciliation, or heartbeat handling
- WHEN compact summaries are exposed to external consumers
- THEN that plumbing remains behind the internal boundary
- AND the public contract stays portable and bounded

### Requirement: Slice remains schema-preserving and dependency-scoped

This slice MUST preserve existing durable schemas and compatible read contracts. It MUST add reusable read extraction only. This slice MUST NOT implement CLI commands, final CLI output UX, or public-MCP pruning.

#### Scenario: Shared-core extraction requires no schema change

- GIVEN the existing durable tables and evidence contracts are in use
- WHEN this slice is introduced
- THEN no new durable schema is required
- AND existing bounded reads remain compatible

#### Scenario: Future CLI work stays deferred

- GIVEN future CLI commands are planned on top of this slice
- WHEN this slice is reviewed
- THEN only reusable read contracts are in scope
- AND command surfaces or MCP pruning remain deferred to later slices
