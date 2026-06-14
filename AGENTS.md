# DevHub agent operating guide

Use this guide when working in `/home/matias/ArxonLabs/devhub`.

## DevHub MCP routing

DevHub MCP is the operational planning layer for this project. Use it proactively when the user asks about:

- project planning, roadmap, milestones, prioritization, execution queues, or task tracking;
- coordinating multiple agents/workers;
- checking project status before choosing what to implement next;
- recording progress on a task that belongs to DevHub planning.

Do **not** call DevHub MCP blindly for every coding turn. For small isolated code edits, inspect the repo and run tests normally. If the work changes project direction, creates follow-up tasks, affects roadmap, or needs coordination, update DevHub MCP.

Recommended flow:

1. Use Engram first for durable memory/context from previous sessions.
2. Use DevHub MCP for the current operational state: projects, tasks, milestones, execution queue, claims, and agent status.
3. Use Graphify/code graph tools for structural code exploration when available.
4. Save durable learnings/decisions back to Engram; save execution state/progress back to DevHub MCP.

## Tool intent

- `list_projects`, `get_project`, `get_dashboard`, `get_project_context`: orient before planning.
- `bulk_create_tasks`, `bulk_create_milestones`: turn plans/roadmaps into structured work.
- `get_execution_queue`, `claim_next_task`: select and claim the next executable task.
- `update_task`, `add_task_comment`, `update_milestone`: report progress and outcomes.
- `register_agent`, `heartbeat_agent`, `update_agent_status`, `unregister_agent`: coordinate multi-agent runs.

## Project Skills

The following skills are shipped inside this repo and should be loaded when the task context matches their trigger:

- `devhub-morphology` — `skills/devhub-morphology/SKILL.md`: Trigger when adding, removing, or modifying a DevHub morphology (registry entry, CSS token block, selector wiring, factory usage, tests, and common pitfalls).

## Safety

- Never invent project/task IDs. Read them from DevHub MCP first.
- Prefer idempotent bulk tools for generated plans.
- Do not mark work completed unless it was verified.
- Git gate before `completed`/`qa-ready`: run `git status --short`, require a local checkpoint commit if files changed, and leave a `[git:checkpoint]` comment with `commit=<sha|none>`, docs, checks, and working-tree status.
- `commit=none` is valid only for analysis/investigation tasks with zero file changes.
- Do not push automatically; push only when a human asks or when publishing the task branch is operationally necessary for QA/handoff.
- Keep Engram and DevHub distinct: Engram is memory; DevHub is planning/execution state.
