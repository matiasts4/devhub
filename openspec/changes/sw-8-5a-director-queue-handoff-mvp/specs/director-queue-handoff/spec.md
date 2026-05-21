# Director Queue Handoff Specification

## Purpose

Expose durable queue order and safe next-task handoff inside the Director Control Room without creating a second queue authority.

## Requirements

### Requirement: Director queue snapshot uses durable queue truth only

The system MUST render the Director queue snapshot from existing durable queue truth only. It MUST use `get_execution_queue` as the ordered source for visible entries and SHALL preserve entry order and blocked semantics as returned. The projection MUST NOT invent local readiness, scoring, or fallback queue records.

#### Scenario: Queue visible and ordered

- GIVEN `get_execution_queue` returns claimable entries in priority order
- WHEN Director opens or refreshes the Control Room
- THEN the queue panel shows the same ordered entries
- AND the UI does not re-rank or inject synthetic tasks

#### Scenario: Empty queue

- GIVEN `get_execution_queue` returns no claimable or blocked entries
- WHEN Director views the queue panel
- THEN the panel shows an empty-queue state
- AND the state is derived from the durable queue response only

#### Scenario: Blocked entries visible as blocked

- GIVEN `get_execution_queue` returns blocked entries with dependency or policy reasons
- WHEN Director views the queue panel
- THEN those entries are shown as blocked rather than claimable
- AND the panel does not reinterpret them as ready work

### Requirement: Director handoff claims next safe task through existing durable primitives

The system MUST perform Director handoff only through existing MCP claim primitives. It MAY use `get_next_task` as the preferred safe claim path and MAY use `claim_next_task` only within the same durable queue contract. After any claim attempt, the projection MUST reflect the resulting durable task, workspace, run, and supervisor truth and MUST NOT fabricate optimistic state.

#### Scenario: Successful claim produces reflected durable state

- GIVEN durable queue truth has a safe next task and the claim primitive succeeds
- WHEN Director triggers handoff
- THEN the resulting task lease and any returned workspace, run, and supervisor records are shown from durable data
- AND the previous queue snapshot is refreshed as a projection of the updated durable state

#### Scenario: Claim result reports no safe task

- GIVEN the claim primitive returns no claimable task because the queue is empty or blocked
- WHEN Director triggers handoff
- THEN the UI shows the returned empty or blocked result state
- AND no local task, workspace, or run is invented

### Requirement: Director queue handoff stays projection-only

The system MUST keep the existing Control Room as a projection-only read model plus bounded handoff affordance. It MUST NOT introduce a new dispatch engine, prompt composer, live evidence UI, approvals UI, or Browser/GTK behavior in this slice.

#### Scenario: No extra composer, approvals, or live evidence behavior

- GIVEN Director uses the queue snapshot and handoff flow
- WHEN the flow completes or fails
- THEN only queue and reflected durable execution state change within the existing room
- AND no prompt composition, approval interaction, live evidence stream, or runtime control surface is introduced
