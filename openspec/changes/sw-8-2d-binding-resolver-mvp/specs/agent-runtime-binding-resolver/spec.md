# Agent Runtime Binding Resolver Specification

## Purpose

Define a durable-first binding resolver/projection for agent ↔ workspace ↔ run reuse without taking over terminal lifecycle.

## Requirements

### Requirement: Durable ownership classification

The system MUST derive canonical binding ownership from durable `agent_workspaces` and the latest relevant durable `agent_runs`. Resolver output MUST include `classification`, `agent_id`, `workspace_id`, and `run_id`, and MAY echo `run_id_or_session_id` only as correlation metadata. It MUST classify `bound` when durable workspace/run ownership is reusable, `missing` when no durable ownership candidate exists, and `orphaned` when durable control-plane state shows lost ownership.

#### Scenario: Durable workspace and run resolve as bound

- GIVEN a non-terminal workspace and its latest durable run belong to the same agent/task
- WHEN the resolver projects binding state
- THEN the result classification is `bound`
- AND the result returns the durable `workspace_id` and `run_id`

#### Scenario: No durable ownership resolves as missing

- GIVEN no eligible workspace or durable run exists for the requested agent
- WHEN the resolver projects binding state
- THEN the result classification is `missing`
- AND runtime-only session identifiers do not create a binding

#### Scenario: Durable orphan signal resolves as orphaned

- GIVEN the workspace or supervisor durable state reports lost ownership
- WHEN the resolver projects binding state
- THEN the result classification is `orphaned`
- AND the last durable `workspace_id` or `run_id` is preserved when available

### Requirement: Runtime evidence refinement boundary

The resolver SHALL reuse existing durable records and SHALL NOT require a new durable binding table for MVP. Runtime evidence from `agent_hub_sessions.opencode_session_id`, `sessionStore`, `ttyServer`, `native_vte`, or equivalent maps MAY refine projection fields and MAY classify `stale` when durable ownership exists but runtime evidence is absent, inactive, or mismatched. Runtime evidence SHALL NOT create `bound` ownership by itself, SHALL NOT override durable `workspace_id` or `run_id`, and this slice SHALL NOT open, focus, attach, close, or restore terminals or treat SSE, logs, or stdout as truth.

#### Scenario: Runtime mismatch resolves as stale

- GIVEN durable workspace/run ownership exists but correlated runtime evidence is missing or unusable
- WHEN the resolver projects binding state
- THEN the result classification is `stale`
- AND durable ownership fields remain unchanged

#### Scenario: Runtime evidence cannot become source of truth

- GIVEN runtime stores report a live session without matching durable workspace/run ownership
- WHEN the resolver projects binding state
- THEN the result is not `bound`
- AND no terminal control action is attempted
