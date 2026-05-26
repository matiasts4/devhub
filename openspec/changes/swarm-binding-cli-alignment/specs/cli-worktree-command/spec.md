# CLI Worktree Command Specification

## Purpose

Expose worktree diagnosis through shared durable readers aligned with workspace evidence and canonical swarm state.

## Requirements

### Requirement: Worktree diagnosis uses shared read helpers

The system SHALL serve `devhub worktree list` and `devhub worktree status` from shared domain/helper-backed reads. These reads MUST report durable workspace state, latest evidence context, and canonical orphaned status without relying on ad-hoc raw SQL diagnosis paths.

#### Scenario: Worktree status uses durable evidence summary

- GIVEN a workspace has durable metadata plus latest run and artifact evidence
- WHEN `devhub worktree status <workspace-id>` is executed
- THEN the command returns its diagnosis from shared readers
- AND the output includes the current workspace state with latest evidence context

#### Scenario: Orphaned workspace is surfaced directly

- GIVEN a workspace is marked orphaned in durable state
- WHEN `devhub worktree status <workspace-id>` is executed
- THEN the command reports the workspace as orphaned
- AND it does not mask that state behind a generic missing result

### Requirement: Worktree cleanup scope stays unchanged

This slice MUST keep `devhub worktree clean` on its existing cleanup path. It SHALL NOT broaden into unrelated workspace mutation changes.

#### Scenario: Worktree clean keeps explicit cleanup flow

- GIVEN an operator runs `devhub worktree clean <workspace-id> --force`
- WHEN the command executes in this slice
- THEN the existing cleanup workflow is used
- AND diagnostic read alignment does not change cleanup behavior
