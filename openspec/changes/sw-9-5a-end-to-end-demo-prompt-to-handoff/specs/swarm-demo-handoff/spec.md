# Swarm Demo Handoff Specification

## Purpose

Define one deterministic prompt-to-handoff acceptance demo that composes existing SW-9.1A–SW-9.4A seams and produces a portable checklist plus evidence bundle.

## Requirements

### Requirement: Seeded prompt-to-handoff scenario

The system MUST define a single seeded demo scenario that replays prompt intake, team dispatch, runtime checkpointing, approval gating, checks, and QA/PR handoff through existing seams only. The scenario MUST use stable identifiers, fixtures, and ordering so repeated local or QA runs produce the same named checkpoints. The demo layer MUST NOT redefine queue, lease, terminal, approval, supervisor, or handoff primitives.

#### Scenario: Deterministic seeded replay succeeds

- GIVEN the canonical demo seed, fixture set, and scenario identifier are available
- WHEN the prompt-to-handoff demo is executed end to end
- THEN the run reaches the same ordered checkpoints for prompt, dispatch, approvals, checks, and handoff
- AND each checkpoint is derived from existing APIs, MCP tools, or UI seams

#### Scenario: Primitive redesign is rejected from scope

- GIVEN a proposed demo step requires new queue, terminal, approval, or supervisor behavior
- WHEN the step is evaluated for this capability
- THEN the step is excluded from the demo specification
- AND the gap is treated as a separate product change

### Requirement: Acceptance checklist contract

The system MUST publish a checklist for the canonical scenario that defines pass or fail status for each demo checkpoint. The checklist MUST cover prompt submission, dispatch visibility, runtime or terminal truth, approval decision capture, checks completion, and QA/PR handoff readiness. The checklist SHOULD be usable by local operators and QA without interpreting implementation details.

#### Scenario: Checklist marks a full pass

- GIVEN the canonical scenario completes all required checkpoints
- WHEN acceptance is evaluated
- THEN the checklist marks each checkpoint as passed
- AND the result identifies the scenario as ready for QA or PR handoff

#### Scenario: Checklist preserves partial failure

- GIVEN one checkpoint fails or remains incomplete during the demo
- WHEN acceptance is evaluated
- THEN the checklist marks the specific checkpoint as failed or incomplete
- AND the remaining checkpoint results stay visible for diagnosis

### Requirement: Evidence bundle manifest

The system MUST produce a canonical evidence bundle manifest for each demo run. The manifest MUST record the scenario identifier, checklist outcome, and stable locations for logs, snapshots, screenshots, and handoff notes. The manifest SHALL reference existing durable outputs where available instead of duplicating their contents, and MAY mark unavailable evidence as missing while preserving the rest of the bundle.

#### Scenario: Complete evidence bundle is recorded

- GIVEN the demo run finishes with all expected outputs available
- WHEN the evidence bundle manifest is assembled
- THEN the manifest lists the canonical bundle path and each required evidence location
- AND the handoff consumer can review the bundle without querying ad hoc state

#### Scenario: Missing evidence stays explicit

- GIVEN one expected evidence item is unavailable or unreadable
- WHEN the manifest is assembled
- THEN the missing item is recorded explicitly in the bundle
- AND the remaining evidence locations remain available for handoff and triage
