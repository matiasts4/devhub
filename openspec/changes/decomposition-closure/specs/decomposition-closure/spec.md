# Decomposition Closure Specification

## Purpose

Define the last verified closure requirements for the decomposition follow-up: mission cleanup must target persisted worktree paths correctly, and closure docs must describe only the gaps still open after the recent MCP and CLI fixes.

## Requirements

### Requirement: Mission cleanup uses persisted worktree paths

The system MUST use each workspace row's persisted `worktree_path` when mission cleanup removes launch worktrees, and MUST return a per-workspace result instead of silently degrading because of field-name mismatches.

#### Scenario: Cleanup removes a mission worktree from the stored path

- GIVEN a mission launch has an `agent_workspaces` row with a non-empty `worktree_path`
- WHEN mission cleanup runs for that launch
- THEN cleanup uses that persisted path for worktree removal
- AND the result reports the outcome for that workspace id and path

#### Scenario: Cleanup handles missing path state safely

- GIVEN a mission launch workspace row has no `worktree_path` or the path no longer exists on disk
- WHEN mission cleanup runs for that launch
- THEN cleanup does not throw because of the missing path state
- AND the result reports the workspace as skipped or not found with path context preserved when available

### Requirement: Decomposition closure docs reflect verified repo state

Closure documentation SHALL describe only currently verified decomposition gaps and SHALL NOT restate already-fixed MCP or CLI blockers as active closure work.

#### Scenario: Closed MCP and CLI blockers are not presented as open work

- GIVEN the closure docs are reviewed against the current working tree
- WHEN a reader checks the documented MCP and CLI blocker lists
- THEN previously fixed boot, inbox, events, auth, task JSON, mission evidence, and worktree command gaps are marked closed, historical, or removed from fix-now sections
- AND the docs do not require another broad decomposition pass for those areas

#### Scenario: Remaining closure work is kept narrow

- GIVEN the remaining verified gaps are mission cleanup reliability and closure-doc reconciliation
- WHEN the closure docs describe next actions for decomposition follow-up
- THEN they constrain follow-up to those verified gaps
- AND they keep broader redesign or explicitly deferred cleanup ideas out of scope
