# Agent Runs Evidence Specification

## Purpose

Define durable execution headers and append-only evidence records for agent runs while keeping DevHub as control plane and executors as owners of git, worktree, branch, merge, and cleanup side effects.

## Requirements

### Requirement: Durable Agent Run Header

The system MUST persist each execution attempt as one durable `agent_runs` header linked to `task_id`, `agent_id`, `workspace_id`, requested base ref, observed starting workspace state, lifecycle timestamps, terminal outcome, and recovery lineage. The header SHALL preserve original provenance once written; later updates MAY only add terminal metadata and SHALL NOT rewrite baseline identity or lineage.

#### Scenario: First execution attempt starts

- GIVEN a task is assigned to an executor workspace
- WHEN a run is created
- THEN one durable header records task, agent, workspace, requested base ref, and starting observed state
- AND the header is identifiable without reading artifact payloads

#### Scenario: Retry or recovery starts

- GIVEN a prior run ended failed, aborted, or superseded
- WHEN a new attempt starts
- THEN a new header is created instead of mutating the old one
- AND the new header links predecessor and recovery lineage explicitly

### Requirement: Append-Only Evidence Ledger

The system MUST persist `agent_artifacts` as append-only evidence entries per run. Each entry SHALL include a stable sequence or timestamp ordering, artifact kind, phase, producer, summary, `evidence_ref`, and integrity metadata sufficient to prove immutability. Entries MUST NOT be updated in place except for additive indexing metadata, and superseding evidence MUST be represented by a new entry.

#### Scenario: Workspace preparation emits evidence

- GIVEN an executor prepares a workspace for a run
- WHEN preparation completes or fails
- THEN evidence records requested base ref, observed branch/head/dirty/path, provisioning outcome, and drift or error details
- AND the run can be audited without replaying the executor

#### Scenario: Commands and tests emit evidence

- GIVEN an executor runs commands or tests
- WHEN any command starts, finishes, or fails
- THEN evidence is appended for command intent, exit outcome, logs, and related test results
- AND failure evidence does not overwrite prior successful evidence

#### Scenario: Diffs and attachments are captured

- GIVEN a run produces file changes, patches, screenshots, or logs
- WHEN evidence is persisted
- THEN each artifact is stored as its own append-only entry or referenced attachment
- AND later consumers can read chronology for the full run

### Requirement: Evidence Reference Contract

The system MUST make `evidence_ref` concrete enough for downstream consumers to dereference or route evidence by kind, locator, and version or integrity hint. The control plane MAY still treat the reference as opaque for transport and storage. Legacy opaque references from SW-2.1 SHALL remain valid when bound to artifact rows that expose the required locator metadata.

#### Scenario: Structured reference is emitted

- GIVEN an executor writes workspace or test evidence
- WHEN it emits `evidence_ref`
- THEN downstream consumers can determine evidence kind and locator without inferring from free text
- AND the control plane is not required to execute git commands to use that reference

#### Scenario: Legacy opaque reference is preserved

- GIVEN an upstream SW-2.1 producer emits an opaque token
- WHEN the token is persisted in the evidence model
- THEN the token remains accepted
- AND the corresponding artifact metadata makes the evidence auditable and routable

### Requirement: Control-Plane Boundary and Outcome Reporting

DevHub MUST remain the control plane and durable audit owner, while executors MUST remain owners of git/worktree/branch/merge effects. Workspace preparation, commands, tests, diffs, errors, QA decisions, and final outcomes SHALL be reported as evidence rather than elevated into DevHub MCP verbs. `devhub_agent_runs` SHALL remain runtime/UI mirror state only. Current direct git and merge side effects in `src/app/api/agent/execute/route.js` and `src/app/api/agent/qa-result/route.js` are boundary violations and SHALL be corrected by later implementation.

#### Scenario: QA approves a run

- GIVEN executor evidence includes branch state, diff, and QA outcome
- WHEN DevHub records approval
- THEN approval is stored as durable outcome plus evidence entries
- AND branch merge ownership remains with the executor boundary

#### Scenario: Run ends with error

- GIVEN workspace prep, command execution, or QA fails
- WHEN the run is closed
- THEN the header records a terminal outcome and reason class
- AND append-only artifacts preserve the failure chronology for retry decisions
