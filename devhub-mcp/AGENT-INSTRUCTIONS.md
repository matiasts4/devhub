# DevHub MCP Usage Instructions for Agents

At session start, do not call DevHub MCP blindly. First decide whether the user
request involves project planning, roadmap, tasks, milestones, progress, or
agent coordination.

If yes:

1. Call `list_projects` or `get_project_context` to orient.
2. For planning, call `get_project_context` before producing milestones/tasks.
3. Prefer `bulk_create_milestones` and `bulk_create_tasks` for full plans.
4. Use `get_execution_queue` to inspect next work.
5. Use `add_task_comment` to attach implementation notes or blockers to the
   relevant task.
6. Use only the public read/evidence MCP tools here; runtime workspace/run/lease
   mutations now belong to CLI/runtime-owned flows outside this contract.

If no:

- Use Engram and normal codebase tools instead.

Always keep Engram and DevHub MCP in sync when the information belongs in both:

- Save durable decisions/discoveries/bug fixes to Engram.
- Add operational task-specific notes to DevHub MCP.
