# Exploration: SW-2.1 agent_workspaces + branch/worktree strategy

### Current State

- There is no `agent_workspaces` model yet.
- Current runtime data is split across `agent_registry`, `agent_hub_sessions`, `swarm_processes`, and UI-local `devhub_agent_runs`.
- Existing workspace state already uses durable per-workspace/per-panel keys in JS (`browserWindowState`, `terminalRendererPreferences`, `workspaceStateHelpers`), but those are UI/runtime prefs, not git ownership.
- `devhub_agent_runs` is a local UI/runtime map keyed by task/session metadata; it is not a safe source of truth for git/worktree ownership.

### Required `agent_workspaces` Fields

Minimum control-plane shape should include:

- `id`
- `project_id`
- `agent_id`
- `task_id` / `current_task_id`
- `session_id` or `run_id`
- `base_branch`
- `branch_name`
- `worktree_path`
- `workspace_path`
- `repo_root`
- `status`
- `claimed_at`, `started_at`, `updated_at`, `completed_at`
- `observed_head`, `observed_branch`, `observed_dirty`
- `last_error`, `recovery_reason`, `evidence_ref`

Candidate lifecycle states:

- `planned` → `provisioning` → `ready` → `active`
- terminal/exceptional: `paused`, `conflicted`, `cleanup_pending`, `completed`, `failed`, `orphaned`

### Affected Areas

- `src/lib/db/localDb.js` — current schema already has `agent_registry`, `agent_hub_sessions`, `swarm_config`, `swarm_processes`; `agent_workspaces` would be a new durable table, not a repurpose.
- `src/lib/agentRegistryLive.js` — currently bridges agent identity to panel/session metadata; it should not become workspace ownership logic.
- `src/lib/swarm/processManager.js` — owns process/session lifecycle today; workspace lifecycle must stay separate from process lifecycle.
- `src/components/workspace/browserWindowState.js` and `src/components/terminal/terminalRendererPreferences.js` — prove workspace-scoped UI state exists, but they are not git/worktree contracts.
- `src/app/api/agent/execute/route.js` and `src/app/api/agent/qa-result/route.js` — current branch/merge behavior is executor-like and too coarse for a real workspace contract.
- `devhub_agent_runs` consumers in terminal/workspace code — collision zone for naming and recovery semantics.

### Approaches

1. **Dedicated control-plane `agent_workspaces` + executor-owned git/worktree adapter** — DevHub stores desired/observed state; an executor adapter performs checkout, worktree create/remove, and returns audited evidence.
   - Pros: clean boundary, auditable, recoverable, keeps git side effects out of MCP.
   - Cons: requires a new contract and extra reconciliation logic.
   - Effort: High

2. **Reuse `devhub_agent_runs` as workspace source of truth** — piggyback worktree/branch metadata onto the existing UI runtime map.
   - Pros: fastest path.
   - Cons: wrong ownership boundary, browser-local state, weak recovery, stale timestamps, poor auditability.
   - Effort: Low

3. **Encode worktree data into `agent_registry` / session rows** — extend existing agent/session records with branch and path fields.
   - Pros: fewer tables.
   - Cons: conflates agent runtime, session lifecycle, and git ownership; hard to reason about cleanup and conflict detection.
   - Effort: Medium

### Recommendation

Use **Approach 1**.

Name and isolate workspaces deterministically:

- branch: `agent/<agent_id>/<task_or_run_slug>`
- base branch: explicit snapshot field, never implied
- worktree path: project-scoped, stable, sanitized, e.g. `.worktrees/<project>/<workspace-id>` or equivalent executor-owned root
- workspace path: logical control-plane path distinct from filesystem path

Control-plane MUST persist intent, state transitions, and evidence; executor MUST own git/worktree commands and cleanup. DevHub should only record what happened, not perform the checkout itself.

### Risks

- `devhub_agent_runs` can drift from reality; it must stay observer-only.
- Branch/worktree collisions are likely if naming is derived only from agent/task IDs without a stable workspace id.
- Cleanup is dangerous unless the system distinguishes `paused` from `cleanup_pending` and always records evidence.
- Existing runtime concepts already overlap (`agent_registry`, `agent_hub_sessions`, `swarm_processes`), so the new model must not duplicate responsibilities.
- SW-2.2 is blocked until this contract defines ownership, recovery, and naming.

### Ready for Proposal

Yes — SW-2.1 is ready for proposal once the control-plane/executor boundary and lifecycle contract are frozen.
