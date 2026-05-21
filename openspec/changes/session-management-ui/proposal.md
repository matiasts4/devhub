# Proposal: Session Management UI

## Intent

Users need control over session naming and visibility in Agen Room / SwarmControl. Currently sessions get auto-generated titles (profile name + truncated instructions) and there's no way to visually hide sessions without killing them. This change adds custom naming and per-view visibility toggles so users can organize their workspace.

## Scope

### In Scope

- Add `custom_name TEXT` and `visibility TEXT DEFAULT 'visible'` columns to `agent_hub_sessions`
- PATCH endpoint for updating session metadata (name, visibility)
- Inline rename UI on session cards (pencil icon, editable input)
- Hide button (eye-off icon) on active session cards and history rows
- "Show hidden" toggle in section headers to reveal hidden sessions
- Filter queries by visibility in GET sessions endpoint

### Out of Scope

- Session deletion (physical or soft)
- Bulk operations (rename multiple, hide multiple)
- Session tags or categories
- Visibility sync across Telegram bot
- Undo/restore hidden sessions (beyond the toggle)

## Capabilities

### New Capabilities

- `session-metadata`: Ability to update session display name and visibility settings via API
- `session-visibility-ui`: Visual controls for renaming and hiding sessions in SwarmControl

### Modified Capabilities

- None — existing session listing and creation remain unchanged

## Approach

1. **DB migration**: Add two ALTER TABLE statements in `ensureRuntimeSchema()` — `custom_name TEXT` and `visibility TEXT DEFAULT 'visible'`
2. **Display logic**: Resolve display name as `custom_name ?? title` at render time (no DB changes to reads)
3. **PATCH endpoint**: New `/api/agenthub/sessions/[id]/route.js` accepting `{ custom_name, visibility }` — partial updates, validates enum
4. **UI — rename**: Add pencil icon to `AgentMetricsCard` → click opens inline input → blur/enter saves via PATCH
5. **UI — hide**: Add eye-off icon on active cards and history rows → PATCH visibility → card/row removed from current view
6. **UI — show hidden**: Toggle in section headers → flips filter to include `hidden_active` / `hidden_history` sessions
7. **API filtering**: GET endpoint accepts `?visibility=visible` (default) or `?visibility=all`

## Affected Areas

| Area                                          | Impact   | Description                                          |
| --------------------------------------------- | -------- | ---------------------------------------------------- |
| `src/lib/db/localDb.js`                       | Modified | Add 2 ALTER TABLE statements for new columns         |
| `src/app/api/agenthub/sessions/[id]/route.js` | New      | PATCH endpoint for session metadata updates          |
| `src/app/api/agenthub/sessions/route.js`      | Modified | Add visibility filter param to GET                   |
| `src/views/SwarmControl.jsx`                  | Modified | Add rename/hide UI, show-hidden toggle, filter logic |
| `src/components/chat/AgentMetricsCard.jsx`    | Modified | Add rename button + inline editing on session cards  |

## Risks

| Risk                                              | Likelihood | Mitigation                                                             |
| ------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| ALTER TABLE fails on existing DB                  | Low        | Wrapped in try-catch with duplicate column handling (existing pattern) |
| Visibility filter breaks existing queries         | Low        | Default to `visible` — existing callers unchanged                      |
| Inline rename UX conflicts with card interactions | Medium     | Use explicit edit mode (click pencil → input → save on blur/enter)     |
| Hidden sessions lost in history                   | Low        | "Show hidden" toggle restores view; data never deleted                 |

## Rollback Plan

1. Revert git changes — UI components and API route removed
2. New columns remain in SQLite (harmless, no data loss) — no migration rollback needed
3. Existing sessions unaffected — `custom_name` NULL falls back to `title`, `visibility` defaults to `visible`

## Dependencies

- None — pure additive change, no external services

## Success Criteria

- [ ] User can rename any session from the UI and see the custom name immediately
- [ ] User can hide an active session without killing its process
- [ ] User can hide a history session without deleting it from DB
- [ ] "Show hidden" toggle reveals hidden sessions in the appropriate section
- [ ] Existing session creation, listing, and SSE streaming continue working unchanged
