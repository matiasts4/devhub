# Delta for Agent Workspace Lifecycle

## MODIFIED Requirements

### Requirement: Workspace Identity And Metadata

The system MUST maintain a dedicated `agent_workspaces` record with: `id`, `project_id`, `agent_id`, `current_task_id`, `run_id_or_session_id`, `repo_root`, `workspace_path`, `worktree_path`, `base_branch`, `base_commit`, `branch_name`, `status`, `observed_branch`, `observed_head`, `observed_dirty`, `last_error`, `recovery_reason`, `evidence_ref`, `claimed_at`, `started_at`, `updated_at`, and `completed_at`. `id` MUST be stable and unique. `base_commit` MUST capture the safe baseline at creation. `workspace_path` MUST remain a logical control-plane path even when `worktree_path` changes. `run_id_or_session_id` MUST remain optional correlation metadata and SHALL NOT be treated as canonical binding ownership; durable ownership SHALL be derived from workspace identity plus related `agent_runs`.
(Previously: `run_id_or_session_id` was listed in workspace metadata, but its binding semantics were not explicitly constrained.)

#### Scenario: Planned workspace is recorded before executor action

- GIVEN an agent is assigned work requiring an isolated workspace
- WHEN DevHub creates the workspace record
- THEN the record status is `planned` with stable identity, base branch, and base commit metadata

#### Scenario: Dirty baseline is preserved as observed state

- GIVEN executor reports the current tree as `dirty-excluded`
- WHEN DevHub updates observed fields
- THEN `observed_dirty` stores `dirty-excluded`
- AND DevHub does not infer `clean`

#### Scenario: Correlation metadata does not override durable ownership

- GIVEN `run_id_or_session_id` points to a runtime session value without a matching durable run
- WHEN a binding projection is requested for that workspace
- THEN the workspace record remains valid metadata
- AND the runtime correlation value does not become canonical ownership truth
