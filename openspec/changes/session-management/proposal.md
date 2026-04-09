# Proposal: Session Management (Rename & Hide)

## Intent

Users cannot customize session names or control session visibility in SwarmControl. Auto-generated titles like "Gentleman: fix bug in auth" are not descriptive, and there is no way to declutter the active/history views without killing or deleting sessions. This change adds custom naming and visual hiding for both active and history sessions.

## Scope

### In Scope

- Add `custom_name TEXT` column to `agent_hub_sessions` (display priority over `title`)
- Add `visibility TEXT DEFAULT 'visible'` column (`visible`, `hidden_active`, `hidden_history`, `hidden_all`)
- Create PATCH `/api/agenthub/sessions/:id` endpoint for updating session metadata
- Add rename UI (pencil icon + inline edit) on `AgentMetricsCard` session cards
- Add hide UI (eye-off icon) on active session cards and history table rows
- Add "Show hidden" toggle in section headers of SwarmControl
- Filter sessions by visibility in queries (DB-level for history, client-level for active)

### Out of Scope

- Session deletion (soft or hard)
- Bulk rename / bulk hide operations
- Visibility sync across Telegram bot
- Undo/restore hidden sessions (beyond the toggle)
- Session grouping or tagging

## Capabilities

### New Capabilities

- `session-visibility`: Ability to hide sessions from specific views (active, history, or both) without affecting process lifecycle or data persistence. Sessions remain in DB and processes keep running.
- `session-renaming`: Ability to assign a custom display name to a session that takes priority over the auto-generated title.

### Modified Capabilities

- None at the spec level. Existing session lifecycle (create, kill, status) remains unchanged.

## Approach

1. **DB Migration**: Add `custom_name` and `visibility` columns via ALTER TABLE in `ensureRuntimeSchema()` (same pattern as existing migrations at line 186-197 of `localDb.js`)
2. **API**: Add PATCH endpoint at `/api/agenthub/sessions/[id]/route.js` accepting `{ custom_name?, visibility? }`, using existing `tables.agent_hub_sessions.update()`
3. **Query filtering**: Update `getSessionsByProject()` and `getRecentSessions()` to accept optional `visibility` filter; default to excluding `hidden_all`
4. **UI**: Add inline rename (click pencil → input → blur/enter to save) and hide button (eye-off) to `AgentMetricsCard` and history rows; add "Show hidden" toggle state in `SwarmControl`
5. **Display logic**: `displayName = session.custom_name || session.title`

## Affected Areas

| Area                                          | Impact   | Description                                      |
| --------------------------------------------- | -------- | ------------------------------------------------ |
| `src/lib/db/localDb.js`                       | Modified | ALTER TABLE + visibility filter in query helpers |
| `src/app/api/agenthub/sessions/[id]/route.js` | New      | PATCH endpoint for session metadata updates      |
| `src/app/api/agenthub/sessions/route.js`      | Modified | Add visibility filter to GET queries             |
| `src/views/SwarmControl.jsx`                  | Modified | Add "Show hidden" toggle state, filter logic     |
| `src/components/chat/AgentMetricsCard.jsx`    | Modified | Add rename/hide buttons, inline edit UI          |

## Risks

| Risk                                                         | Likelihood | Mitigation                                                             |
| ------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------- |
| ALTER TABLE fails on existing DB                             | Low        | Wrapped in try-catch with duplicate column handling (existing pattern) |
| Hidden sessions accidentally lost                            | Low        | Visibility is UI-only filter; data and processes untouched             |
| Inline edit UX conflicts with card click                     | Medium     | Use stopPropagation on edit controls; distinct button targets          |
| Large SwarmControl file (1867 lines) gets harder to maintain | Medium     | Extract rename/hide logic into small utility hooks                     |

## Rollback Plan

1. Remove PATCH endpoint file `src/app/api/agenthub/sessions/[id]/route.js`
2. Revert UI changes in `SwarmControl.jsx` and `AgentMetricsCard.jsx` via git
3. New columns (`custom_name`, `visibility`) are nullable with defaults — safe to leave in DB; no data migration needed
4. If needed, drop columns: `ALTER TABLE agent_hub_sessions DROP COLUMN custom_name` (SQLite 3.35+)

## Dependencies

- None. Pure additive change on existing session infrastructure.

## Success Criteria

- [ ] User can rename a session via pencil icon; custom name persists and displays immediately
- [ ] User can hide a session from active view; session process continues running
- [ ] User can hide a session from history view; data remains in DB
- [ ] "Show hidden" toggle reveals hidden sessions in respective views
- [ ] Existing session creation, killing, and status updates work unchanged
- [ ] API PATCH endpoint returns 200 with updated session on valid input
- [ ] API PATCH returns 400/404 on invalid session ID or malformed payload
