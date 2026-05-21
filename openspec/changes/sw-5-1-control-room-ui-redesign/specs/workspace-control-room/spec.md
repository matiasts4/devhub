# Workspace Control Room Specification

## Purpose

Define the final read-only swarm surface for humans over the shared durable snapshot.

## Requirements

### Requirement: Snapshot-First Composition

The system MUST render Workspace Control Room from shared durable snapshots and explicit read models produced by frozen workspace, run, artifact, supervisor, Telegram, and MCP contracts. Cards, tables, and panels MUST cover agents, claimed tasks, leases, workspaces, branches, artifacts, errors, queue, and approvals. Local UI state MAY control filters, expansion, selection, and layout, but MUST NOT become durable truth.

#### Scenario: Composed snapshot renders all panels

- GIVEN the shared snapshot includes agent, task, lease, workspace, branch, artifact, queue, error, and approval records
- WHEN Workspace Control Room loads
- THEN each panel renders from that snapshot or its read-model slice
- AND no panel requires a UI-owned runtime mirror

#### Scenario: Local view state changes only presentation

- GIVEN a human changes filters or collapses panels
- WHEN the view re-renders
- THEN the same durable records remain the source of truth
- AND only presentation order or visibility changes

### Requirement: Trust and Failure Signals

The system MUST show authority, freshness, and evidence metadata for rendered status summaries. The system MUST render stale, degraded, and unavailable states explicitly and MUST NOT collapse missing evidence into healthy or current status.

#### Scenario: Current durable status is explicit

- GIVEN a run card has durable authority, current freshness, and evidence refs
- WHEN the card renders
- THEN the card shows those trust indicators alongside the status

#### Scenario: Snapshot is stale or unavailable

- GIVEN a workspace or approval read model is stale, degraded, or unavailable
- WHEN Control Room renders
- THEN the affected panel shows the failure state and evidence gap explicitly
- AND the UI does not infer a healthy replacement state

### Requirement: Human-Gated and Non-Orchestrating

The system MUST show risky-action approval gates and their pending, approved, or rejected status. The UI MUST NOT own orchestration, claim or release authority, durable truth synthesis, or general Git, worktree, merge, or filesystem controls.

#### Scenario: Approval gate is pending

- GIVEN a supervisor outcome requires human approval
- WHEN the related task or workspace row renders
- THEN the gate status is visible with the target and evidence reference
- AND the risky action is not shown as already applied

#### Scenario: Forbidden control verbs stay out of scope

- GIVEN a human opens Workspace Control Room
- WHEN they inspect available actions
- THEN general Git, worktree, merge, and filesystem controls are absent or clearly out of scope
- AND no UI action claims, releases, or mutates swarm truth directly
