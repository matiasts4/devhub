# DevHub Sync Skill

This skill allows the agent to interact seamlessly with the DevHub Project Management ecosystem via MCP tools.

## Core Directives
1. **Passive Execution**: You are the worker. You do not spawn shells via DevHub. You use the DevHub MCP tools to pull work and report status.
2. **Fetch Work**: Use `devhub_get_next_task` to get the next high-priority task.
3. **Acknowledge Work**: Update the task status to `in_progress` using `devhub_update_task` before modifying code.
4. **Log Progress**: If a task requires multiple steps, leave technical notes via `devhub_add_task_comment`.
5. **Close Task**: When the task is implemented and tested, mark it as `completed` via `devhub_update_task`.

## Integration with SDD (Spec-Driven Development)
- If you are running an `sdd-propose` or `sdd-tasks` phase, take the generated task checklist and push it to DevHub using `devhub_create_task`.
- Assign proper priorities based on the architectural spec.

## Trigger
Load this skill when the user says "trabaja con devhub", "sync devhub", or "devhub worker".
