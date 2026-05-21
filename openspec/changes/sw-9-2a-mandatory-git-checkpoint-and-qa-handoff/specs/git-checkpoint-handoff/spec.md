# Git Checkpoint Handoff Specification

## Purpose

Define the durable server gate that controls task closure and QA handoff using verified git checkpoint evidence.

## Requirements

### Requirement: Terminal and QA handoff gate

The system MUST reject any task transition to `completed` or `qa-ready` unless durable checkpoint evidence for that task is present, valid, and linked to the same handoff attempt. The rejection MUST explain what evidence is missing or invalid and how to remediate it.

#### Scenario: Completed handoff with valid checkpoint

- GIVEN a task has durable checkpoint evidence linked to the current handoff
- WHEN an agent requests status `completed`
- THEN the system accepts the transition
- AND the accepted handoff remains auditable from durable records

#### Scenario: QA-ready handoff without checkpoint

- GIVEN a task has no valid checkpoint evidence for the requested handoff
- WHEN an agent requests status `qa-ready`
- THEN the system rejects the transition
- AND the response explains the missing checkpoint requirements

### Requirement: Checkpoint evidence contract

The system MUST require auditable checkpoint evidence containing `commit=<sha|none>`, checks run, touched docs, and working-tree status. Comment text MAY mirror this evidence for humans, but server validation SHALL be the write authority.

#### Scenario: Evidence includes commit sha

- GIVEN checkpoint evidence includes a commit SHA plus checks, docs, and working-tree status
- WHEN the server validates the handoff
- THEN the evidence is eligible for acceptance

#### Scenario: Evidence is incomplete

- GIVEN checkpoint evidence omits one required field
- WHEN the server validates the handoff
- THEN the handoff is rejected
- AND the response identifies the incomplete fields

### Requirement: Zero-change analysis exception

The system MUST accept `commit=none` only for zero-change analysis handoffs. The system MUST reject `commit=none` when files changed or when the task is not an analysis-only handoff.

#### Scenario: Zero-change analysis uses commit none

- GIVEN an analysis-only task reports zero file changes and `commit=none`
- WHEN the server validates the handoff
- THEN the transition may proceed if the remaining checkpoint fields are valid

#### Scenario: Changed work attempts commit none

- GIVEN the task reports changed work and `commit=none`
- WHEN the server validates the handoff
- THEN the transition is rejected
- AND the response instructs the agent to create a local checkpoint commit
