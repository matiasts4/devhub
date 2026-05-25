# Proposal: Swarm Reliability Phase 3 — Team Targeting, Operator Inbox, Ops Board History

## Intent

Phase 1-2 built durable queue, claim/lease, approvals, and agent events. Phase 3 closes three operator experience gaps: agents cannot target messages by role, there is no general operator notification stream, and the ops board lacks task history and tags.

## Scope

### In Scope

- Role-based targeting for `team_tell` (MCP + `teamTell.js`)
- `operator_inbox` table and `get_operator_inbox` MCP tool
- `task_history` append-only table and `tags` JSON column on `tasks`
- History writes from `claim_next_task`, `release_task`, `update_task`
- Inbox writes from `request_supervisor_approval` and critical event paths

### Out of Scope

- CLI `devhub tell` role syntax (MCP only for now)
- Real-time push / WebSocket delivery for inbox
- Full audit logging beyond tasks

## Capabilities

### New Capabilities

- `operator-inbox`: Lightweight notification projection for operators
- `task-history`: Append-only task transition audit trail

### Modified Capabilities

- `mcp-public-contract`: Extend `team_tell` with optional `target_role`; add `get_operator_inbox`, `dismiss_inbox_item` tools; extend `list_tasks` to optionally include history

## Approach

1. **Team chat targeting**: Accept `target_role` in `team_tell`. Resolve `role_in_mission` to agent IDs before writing `message_deliveries`. Falls back to explicit `recipients` if both provided.
2. **Operator inbox**: Create `operator_inbox` table (`inbox_id`, `project_id`, `actor_id`, `category`, `source_table`, `source_id`, `message`, `status`, `created_at`). Add `record_inbox_item` helper in `localDb.js`. Write on approval checkpoint creation and critical agent events. Expose `get_operator_inbox` MCP tool.
3. **Ops board history**: Create `task_history` table (`history_id`, `task_id`, `actor_id`, `action`, `from_status`, `to_status`, `metadata`, `created_at`). Add `tags` JSON column to `tasks`. Write to `task_history` from claim, release, and update handlers. Optionally include history in `list_tasks`.

## Affected Areas

| Area                         | Impact   | Description                                                             |
| ---------------------------- | -------- | ----------------------------------------------------------------------- |
| `src/lib/swarm/teamTell.js`  | Modified | Add role resolution before delivery writes                              |
| `src/lib/db/localDb.js`      | Modified | Add `operator_inbox`, `task_history` tables; `record_inbox_item` helper |
| `devhub-mcp/server.js`       | Modified | Extend `team_tell` tool; add `get_operator_inbox`; write task history   |
| `src/views/Tareas.jsx`       | Modified | Render tags and history timeline in Kanban cards                        |
| `src/views/SwarmControl.jsx` | Modified | Add operator inbox panel alongside approvals                            |

## Risks

| Risk                                   | Likelihood | Mitigation                                                           |
| -------------------------------------- | ---------- | -------------------------------------------------------------------- |
| Schema drift between SQLite init paths | Medium     | Mirror ALTER in `ensureLocalMcpTables()` and `ensureRuntimeSchema()` |
| Write amplification on inbox           | Low        | Gate behind single `record_inbox_item` helper; batch where possible  |
| Breaking `team_tell` portable contract | Low        | `target_role` is optional; existing signatures unchanged             |

## Rollback Plan

1. **Team targeting**: Revert `teamTell.js` and MCP `team_tell` schema. `message_deliveries` remains valid.
2. **Operator inbox**: Drop `operator_inbox` table. No other tables depend on it.
3. **Task history**: Drop `task_history` table and remove `tags` column from `tasks` via migration.

## Dependencies

- Phase 1-2 schema must be deployed (tasks, mission_messages, agent_events, supervisor_approval_checkpoints)
- `mission_participants` table must have `role_in_mission` index or column

## Success Criteria

- [ ] `team_tell` with `target_role` resolves to correct recipients
- [ ] `get_operator_inbox` returns items ordered by `created_at` desc
- [ ] Claiming a task creates a `task_history` row with `from_status` and `to_status`
- [ ] `list_tasks` optionally includes history and tags
- [ ] Total diff under 400 changed lines
