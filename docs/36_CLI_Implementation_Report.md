# CLI Implementation Report

## Executive Summary

This report reflects the CLI state after the follow-up closure fixes. Earlier implementation work added the command families, but some contracts were overstated. The CLI now matches the backend behavior more closely for the remaining critical gaps.

## Closed Gaps

### 1. `devhub worktree clean`

- **Status**: ✅ Implemented
- **Behavior**: `devhub worktree clean <workspace-id> --force`
- **Contract**: Removes a specific workspace-backed git worktree via `safeRemoveWorktree()` and runs `git worktree prune` through the existing cleanup helpers.
- **Notes**:
  - Requires a valid `repo_root` and `worktree_path` on the workspace row.
  - Updates the workspace row to `completed` after successful removal.

### 2. `devhub worktree list`

- **Status**: ✅ Corrected
- **Behavior**: Lists schema-backed worktree fields from `agent_workspaces`.
- **Contract change**: Removed the unsupported `--launch` filter claim.
- **Why**: `agent_workspaces` has no `launch_id` column.
- **Replacement**: `--status <value>` is supported because it maps to a real column.

### 3. `devhub mission close`

- **Status**: ✅ Corrected
- **Behavior**:
  - Default outcome is now `aborted`.
  - `completed` requires explicit evidence via `--check` and/or `--commit`.
- **Why**: `src/lib/swarm/missionClose.js` rejects `completed` without evidence.

### 4. `devhub task <id> --json`

- **Status**: ✅ Implemented
- **Behavior**: Detail mode now returns real JSON: `{ "task": ... }`.

### 5. Legacy events fallback `since`

- **Status**: ✅ Patched
- **Behavior**: The legacy `mission_messages` fallback now applies the `since` filter with `created_at >= ?`.

## Intentionally Narrowed Contracts

### Worktree launch filtering

- **Status**: Not supported
- **Reason**: No direct `launch_id` in `agent_workspaces`.
- **Decision**: Removed the misleading CLI/help contract instead of inventing backend linkage.

## Relevant Files

- `devhub-cli/commands/worktree.js` — implemented per-workspace cleanup; removed fake launch filtering
- `devhub-cli/commands/mission.js` — aligned close defaults and evidence requirements to backend contract
- `devhub-cli/commands/task.js` — added real JSON output for task detail mode
- `src/app/api/agenthub/events/route.js` — applied `since` in legacy fallback query
- `devhub-cli/commands/worktree.test.js` — added contract tests for list and clean argument handling
- `devhub-cli/commands/mission.test.js` — added contract tests for default close path and evidence requirements
- `devhub-cli/commands/task.test.js` — added detail `--json` assertion

## Validation Performed

Targeted validation expected for this closure pass:

- `node --check` on changed JS files
- targeted Jest for:
  - `devhub-cli/commands/worktree.test.js`
  - `devhub-cli/commands/mission.test.js`
  - `devhub-cli/commands/task.test.js`
- direct CLI spot checks where safe

## Remaining Limitations

1. Launch-scoped worktree filtering is still unavailable from the current schema.
2. Full end-to-end CLI integration still depends on a populated DB and, for API-backed commands, a running server.

## Status

Updated after CLI closure fixes on 2026-05-25.
