# Terminal Adapter Lifecycle Specification

## Purpose

Define durable-first lifecycle semantics for terminal adapters while keeping runtime state as evidence only.

## Requirements

### Requirement: Durable-first lifecycle entry

The system MUST require SW-8.2D binding input for `open`, `attach`, and `restore`. A request with durable classification `bound` or `stale` and durable `workspace_id` plus `run_id` MAY proceed. Lifecycle execution MUST consume durable ownership and SHALL NOT create or rewrite canonical ownership from `terminalId`, `panelId`, `sessionStore` ids, AgentHub session ids, PTY ids, or VTE handles.

#### Scenario: Open against valid durable binding

- GIVEN the resolver returns `bound` with durable `workspace_id` and `run_id`
- WHEN `open` is requested
- THEN the adapter starts or resumes runtime execution for that durable binding
- AND the result reports runtime evidence separately from ownership

#### Scenario: Attach against valid durable binding

- GIVEN the resolver returns `bound` and the adapter has a correlated runtime handle
- WHEN `attach` is requested
- THEN the adapter returns an attached runtime result for that handle
- AND canonical ownership remains the durable binding

#### Scenario: Runtime-only identifiers are rejected as ownership

- GIVEN only `terminalId`, `panelId`, session ids, or other runtime identifiers are available
- WHEN any lifecycle entry operation is requested
- THEN the request is rejected or degraded as not bound
- AND no canonical ownership is created

### Requirement: Handle-scoped live operations

The system MUST execute `focus`, `resize`, and `close` only against an existing adapter runtime handle. These operations MAY use runtime, session, or panel state to refine result details, but SHALL NOT create a missing handle, SHALL NOT promote runtime state into ownership truth, and SHALL NOT change durable binding records.

#### Scenario: Focus or resize on existing handle

- GIVEN a durable binding is valid and the adapter has a live runtime handle
- WHEN `focus` or `resize` is requested
- THEN only that addressed handle is updated
- AND the result includes success with runtime evidence

#### Scenario: Close on existing handle

- GIVEN a durable binding is valid and the adapter has a live runtime handle
- WHEN `close` is requested
- THEN that handle is closed
- AND durable ownership remains governed outside this contract

#### Scenario: Degraded live operation without handle

- GIVEN a durable binding exists but no usable runtime handle is present
- WHEN `focus`, `resize`, or `close` is requested
- THEN the adapter returns a degraded missing-or-stale-handle outcome
- AND no replacement handle or ownership record is synthesized

### Requirement: Bounded restore and heartbeat recovery

The system MUST keep `restore` and `heartbeat` contract-based and bounded. `restore` MAY reuse matching PTY, `sessionStore`, AgentHub session, native VTE, or equivalent runtime evidence to recover execution state for an existing durable binding. `heartbeat` MUST report liveness or freshness as evidence only. Stale or mismatched runtime evidence MUST produce degraded availability results instead of broad runtime rewrites, new provider scope, or orchestration behavior.

#### Scenario: Restore with matching runtime evidence

- GIVEN a durable binding is `stale` or `bound` and matching runtime evidence still exists
- WHEN `restore` is requested
- THEN the adapter returns a recovered runtime handle
- AND the result marks runtime availability without changing ownership truth

#### Scenario: Restore with stale runtime evidence

- GIVEN a durable binding exists but correlated runtime evidence is stale, missing, or mismatched
- WHEN `restore` is requested
- THEN the adapter returns a degraded unavailable-or-stale outcome
- AND the contract stops without broader native or runtime rewrite

#### Scenario: Heartbeat reports evidence only

- GIVEN a durable binding exists with any current runtime snapshot
- WHEN `heartbeat` is requested
- THEN the adapter reports liveness, freshness, or staleness from runtime evidence
- AND heartbeat does not create ownership or dispatch follow-up workflow

### Requirement: MVP scope exclusions

The system MUST NOT introduce a new durable ownership table such as `terminal_session_binding` for this MVP. This contract SHALL NOT expand UI scope, provider surface, panel redesign, or orchestration and dispatch responsibilities beyond existing adapter seams.

#### Scenario: Boundary remains outside MVP

- GIVEN lifecycle behavior is being extended
- WHEN the MVP contract is specified or implemented
- THEN no new durable ownership table or UI-orchestration scope is required
- AND additive adapter hooks remain bounded to contract semantics
