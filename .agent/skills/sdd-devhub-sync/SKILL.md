# DevHub Sync Protocol

## Canonical source

- OpenCode (`/home/matias/.config/opencode/skills/sdd-devhub-sync/SKILL.md`) is the source of truth.
- Mirror every change to every IDE skill copy on this machine; keep copies identical unless a tiny path-specific adapter is unavoidable.

## DevHub documentation gate

- Before planning or docs work, classify the project first: `personal/devhub`, `shared/legacy`, or `archive-only`.
- `personal/devhub`: use the DevHub docs flow.
- `shared/legacy`: preserve existing docs; do not convert by default.
- `archive-only`: archive legacy docs first, then create new DevHub docs.
- If the policy is missing or ambiguous, stop and ask before proceeding.

## Worker contract

- Pull with `get_next_task`; it assigns the task and moves it to `in_progress`.
- Read the task `title` and `description`; do not ask for selection if you can fetch it.
- Complete work with `add_task_comment` + `update_task`; `update_agent_status` reports telemetry.
- `sdd-tasks` persists tasks with `create_task`.
- Never complete a task without an audit trail.
