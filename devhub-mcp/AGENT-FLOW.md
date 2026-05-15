# DevHub MCP Agent Flow

DevHub MCP is the project-planning and roadmap control plane. It complements,
but does not replace, persistent memory systems such as Engram.

## When an agent should use DevHub MCP

Use DevHub MCP automatically when the user asks about:

- project portfolio status, dashboard, roadmap, milestones, tasks, planning
- creating or updating a project plan
- decomposing work into milestones/tasks
- selecting the next task for an agent/worker
- recording task progress or technical comments tied to a DevHub task
- coordinating multiple coding agents on the same project

Do **not** use DevHub MCP for general codebase memory, semantic recall, or
session history. Use Engram for those.

## Recommended planning sequence

1. `list_projects` or `get_dashboard` to orient.
2. `get_project_context({ project_id })` before generating a plan.
3. `bulk_create_milestones` for the roadmap.
4. `bulk_create_tasks` for task decomposition.
5. `update_project({ project_id, planning_status: "completed" })` after the
   planning pass is complete.

Bulk tools are idempotent by project/title and should be preferred over many
single-create calls when generating full plans.

## Recommended execution sequence

1. `register_agent` when a worker session starts.
2. `heartbeat_agent` periodically for long sessions.
3. `get_execution_queue` when the agent/user wants to inspect options.
4. `claim_next_task` when the agent is ready to work.
5. `add_task_comment` for decisions, QA notes, implementation summaries, or
   blockers that belong on the task.
6. `update_task` when status changes.
7. `unregister_agent` on clean shutdown.

## Engram + DevHub MCP

Use both systems together:

- Engram = durable project memory, decisions, discoveries, bug fixes, session
  summaries, semantic recall.
- DevHub MCP = operational project objects: projects, roadmap, tasks,
  milestones, queue, assigned agent status.

A good agent startup sequence is:

1. Search Engram for prior context and constraints.
2. Use DevHub MCP only if the current request relates to planning, tasks,
   roadmap, progress, or agent coordination.
3. Save important discoveries back to Engram and, when tied to a task, also add
   a DevHub task comment.

## Graphify

Graphify can be used as a code/documentation graph and exploration layer. It
should not own task state. If Graphify finds architecture facts or dependency
maps, summarize them into Engram for durable recall and optionally into DevHub
as task comments or planning context.

No direct conflict exists as long as responsibilities stay separated:

- Graphify: code graph / documentation graph / relationships.
- Engram: memory and session knowledge.
- DevHub MCP: roadmap and execution state.
