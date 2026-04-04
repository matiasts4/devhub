# Proposal: Agent Observability v2 & Telegram/Web Unification

## Intent

DevHub currently has **two disconnected agent paths**: the web AgentHub uses OpenCode headless SSE with rich trace rendering, while the Telegram bot uses LLM Bridge (direct LLM API calls with MCP tools) or a legacy tmux-based OpenCode path. There are **no shared sessions** between channels, **no real-time execution visibility** in SwarmControl, and **no persistent trace storage** beyond in-memory React state. This proposal unifies both channels behind a single OpenCode headless engine, adds persistent trace storage with search/filter, and surfaces real-time agent execution across the entire UI.

## Scope

### In Scope

- **SQLite schema**: New `agent_traces` table for persistent trace storage (tool calls, reasoning, text parts, usage data) linked to existing `agent_hub_sessions`
- **OpenCode headless as single engine**: Replace LLM Bridge chat path in Telegram with OpenCode SSE, preserving MCP tool calling via OpenCode's native MCP support
- **Telegram ↔ Web session bridge**: Shared session IDs across channels; Telegram messages appear in web AgentHub, web responses visible in Telegram
- **Telegram commands**: `/session` (new), `/sessions` (list/switch), `/project` (switch active project context)
- **Persistent trace storage**: Save SSE trace parts to SQLite in real-time via Next.js API route
- **SwarmControl observability**: Real-time SSE feed showing active agent execution (tools, reasoning, status) — replace polling with WebSocket/SSE
- **Trace search & filter UI**: Filter by tool type, status, session; full-text search in trace outputs
- **Permission approval modal**: Interactive approve/reject UI for OpenCode permission requests in web
- **Full output viewer**: Expandable/collapsible tool outputs with show more/less, no truncation
- **Remove old agent registry**: Deprecate `agent_registry` table and MCP-based agent registration in favor of OpenCode native profiles

### Out of Scope

- Multi-user/multi-tenant support (single user remains)
- Supabase re-integration
- Changing OpenCode's internal SSE event format
- Mobile-responsive redesign of SwarmControl
- Token cost tracking/billing (only usage display, not cost)

## Approach

### Phase 1: Persistent Trace Storage

- Add `agent_traces` table: `(id, session_id, message_id, part_type, part_id, tool_name, tool_status, tool_input, tool_output, content, metadata, created_at)`
- Add `agent_session_usage` table: `(id, session_id, prompt_tokens, completion_tokens, total_tokens, model, created_at)`
- Create `/api/agenthub/traces` Next.js route for saving trace parts from SSE stream
- Modify `dispatchOpenCode` in AgentHub to save each trace part to SQLite

### Phase 2: Telegram → OpenCode Migration

- Replace `commands/chat.js` LLM Bridge path with OpenCode headless SSE call
- Reuse existing `telegram-bot/services/opencode.js` (already has SSE parsing, approval flow, server lifecycle)
- Map OpenCode SSE events → Telegram messages (text parts as replies, tool calls as status updates)
- Handle permission approvals via Telegram inline buttons (callback_query)
- Store Telegram session IDs in `telegram_sessions` table, linked to OpenCode session IDs

### Phase 3: Session Unification Bridge

- Create `/api/agenthub/sessions/bridge` route: when Telegram creates/uses a session, sync to `agent_hub_sessions`
- Shared session title, message history, and trace data via common `session_id`
- Telegram `/session` command creates new AgentHub session via headless API
- Telegram `/sessions` command queries `agent_hub_sessions` with project filter
- Telegram `/project` command updates active project, changes OpenCode `cwd`

### Phase 4: SwarmControl Real-Time Feed

- Replace 5s polling with SSE connection to `/api/agenthub/stream` (aggregates all active OpenCode sessions)
- Show live execution cards: agent name, current tool, reasoning snippet, status
- Click to expand full trace view (reuses AgentTracePanel component)

### Phase 5: Trace Viewer & Search

- New `/api/agenthub/traces/search` endpoint with FTS5 on `content` and `tool_output`
- Filter UI in SwarmControl: by tool type, status, date range, session
- Full output viewer modal with expandable sections
- Multi-session trace browser with session selector

## Affected Areas

| Area                                            | Impact     | Description                                      |
| ----------------------------------------------- | ---------- | ------------------------------------------------ |
| `src/lib/db/localDb.js`                         | Modified   | Add `agent_traces`, `agent_session_usage` tables |
| `src/app/api/agenthub/traces/route.js`          | New        | POST to save trace parts, GET to query/filter    |
| `src/app/api/agenthub/stream/route.js`          | New        | SSE aggregator for all active sessions           |
| `src/app/api/agenthub/sessions/bridge/route.js` | New        | Cross-channel session sync                       |
| `src/views/AgentHub.jsx`                        | Modified   | Save traces to SQLite, add permission modal      |
| `src/views/SwarmControl.jsx`                    | Modified   | Replace polling with SSE, add trace viewer       |
| `src/components/chat/AgentTracePanel.jsx`       | Modified   | Support persistent trace loading, search         |
| `telegram-bot/commands/chat.js`                 | Modified   | Replace LLM Bridge with OpenCode SSE path        |
| `telegram-bot/services/opencode.js`             | Modified   | Support project-based cwd, session bridging      |
| `telegram-bot/commands/session.js`              | New        | `/session` command handler                       |
| `telegram-bot/commands/sessions.js`             | Modified   | Enhanced `/sessions` with switch capability      |
| `telegram-bot/commands/project.js`              | New        | `/project` command handler                       |
| `telegram-bot/services/providers/llm-bridge.js` | Deprecated | No longer used for chat (keep for reference)     |

## Risks

| Risk                                                      | Likelihood | Mitigation                                                                                 |
| --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| OpenCode SSE connection drops mid-execution               | Medium     | Implement reconnection logic in both web and Telegram; persist partial traces              |
| Telegram message formatting loses trace detail            | Medium     | Use Telegram's HTML mode with character limits; fall back to file upload for large outputs |
| SQLite write contention under heavy trace volume          | Low        | Use WAL mode (already enabled), batch writes, async queue                                  |
| Breaking existing Telegram conversations during migration | Medium     | Feature flag `TELEGRAM_USE_OPENCODE`; keep LLM Bridge as fallback until verified           |
| OpenCode `cwd` change affects all sessions                | High       | Use OpenCode's per-session project context or spawn separate instances per project         |

## Rollback Plan

1. Set `TELEGRAM_USE_OPENCODE=false` in `.env` to revert Telegram to LLM Bridge
2. New tables (`agent_traces`, `agent_session_usage`) are additive — no data loss on rollback
3. Keep LLM Bridge files intact (mark as deprecated, don't delete)
4. SwarmControl polling fallback: if SSE fails, fall back to existing 5s poll
5. Git revert any modified files; new files can be safely deleted

## Dependencies

- OpenCode headless server must be running (`opencode serve`)
- OpenCode must have MCP servers configured for tool access
- SQLite database must have WAL mode enabled (already configured)

## Success Criteria

- [ ] Telegram message triggers OpenCode SSE execution, not LLM Bridge
- [ ] Same session visible in both Telegram and web AgentHub
- [ ] Agent traces persist in SQLite and survive page refresh
- [ ] SwarmControl shows real-time execution (not just status)
- [ ] Trace search returns results by tool type, status, and content
- [ ] Permission approval works via Telegram inline buttons and web modal
- [ ] `/session`, `/sessions`, `/project` commands work in Telegram
- [ ] Full output viewer shows complete tool output with expand/collapse
- [ ] Old agent registry removed from SwarmControl without breaking existing functionality
