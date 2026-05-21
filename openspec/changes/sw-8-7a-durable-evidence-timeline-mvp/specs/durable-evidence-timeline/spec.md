# Durable Evidence Timeline Specification

## Purpose

Project one ordered, read-only evidence narrative in Control Room from existing durable snapshot truth.

## Requirements

### Requirement: Timeline derives from durable snapshot truth only

The system MUST derive `evidence_timeline` from existing durable snapshot truth only. Primary entries SHALL come from durable records already represented in the snapshot, including `mission_messages`, `message_deliveries`, `agent_presence`, `agent_runs`, `agent_artifacts`, `supervisor_snapshots`, and `supervisor_approval_checkpoints`. The timeline MUST NOT require new durable tables, schema changes, or runtime-only records to exist.

#### Scenario: Mixed durable records appear in one timeline

- GIVEN the snapshot includes durable message, delivery, run, artifact, presence, snapshot, and approval records
- WHEN Control Room composes `evidence_timeline`
- THEN the timeline includes entries derived from those durable records only
- AND no synthetic primary entry is invented from session-local state

### Requirement: Timeline order is deterministic and repeatable

The system MUST return `evidence_timeline` in one deterministic order on every read. Ordering SHALL use durable event time first and stable tie-breakers second so identical snapshot truth yields identical item order across repeated reads. Runtime arrival order, SSE arrival order, and in-memory object order MUST NOT affect primary ordering.

#### Scenario: Repeated reads keep identical order

- GIVEN two reads use the same durable snapshot truth
- WHEN `evidence_timeline` is composed twice
- THEN both reads return the same item order
- AND tied timestamps resolve with the same stable tie-breakers

#### Scenario: Runtime arrival order cannot reorder primary evidence

- GIVEN runtime hints arrive in a different order than the durable records they reference
- WHEN the timeline is rendered
- THEN durable item order stays unchanged
- AND runtime arrival order is ignored for primary sorting

### Requirement: Empty and missing states are stable

The system MUST expose stable read-only empty and missing states. If no durable evidence exists, `evidence_timeline` SHALL be an empty list. If a durable record is incomplete or lacks optional linkage, the corresponding entry MAY still render but MUST preserve explicit missing-state metadata instead of failing, disappearing unpredictably, or fabricating linked truth.

#### Scenario: No durable evidence returns stable empty state

- GIVEN the snapshot contains no durable evidence records for the timeline
- WHEN Control Room selects `evidence_timeline`
- THEN the selector returns an empty list
- AND the UI shows an empty read-only state without mutation prompts

#### Scenario: Missing linked evidence stays explicit

- GIVEN a durable record exists but lacks an optional linked ref or related durable row
- WHEN the timeline entry is normalized
- THEN the entry remains read-only and explicitly marked missing or degraded
- AND no fallback entry is fabricated to fill the gap

### Requirement: Secondary session evidence is optional and non-authoritative

The system MAY attach `agent_traces` or session SSE evidence as secondary session evidence only when it is linked to an existing durable timeline item. Secondary session evidence MUST be labeled non-authoritative and MUST NOT become the primary truth for approvals, queue state, run state, delivery state, or timeline ordering.

#### Scenario: Linked session evidence augments durable item

- GIVEN a durable timeline item has a linked `agent_traces` or SSE hint
- WHEN the item is rendered
- THEN the hint appears as secondary session evidence
- AND the durable item remains the primary authoritative record

#### Scenario: Unlinked session evidence is ignored as primary truth

- GIVEN a session hint has no durable linked item
- WHEN the timeline is composed
- THEN that hint does not create a primary timeline item
- AND approvals, queue, run, and delivery truth remain unchanged

### Requirement: Timeline slice stays read-only and bounded

The system MUST keep the timeline slice read-only. It MUST NOT write records, mutate approvals, mutate queue or dispatch state, or introduce SW-8.8A approval actions, SW-9.x hardening behavior, or schema changes as part of timeline reads or rendering.

#### Scenario: Timeline refresh causes no side effects

- GIVEN an operator opens or refreshes Control Room
- WHEN `evidence_timeline` is read and rendered
- THEN no approval, queue, dispatch, or schema mutation occurs
- AND the behavior remains within SW-8.7A scope only
