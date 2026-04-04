# Tasks: Agent Observability v2

## Phase 1: Database Foundation

- [ ] 1.1 Create `agent_traces` table with all columns, indexes, and FTS5 virtual table
  - **File**: `src/lib/db/localDb.js` — add schema to `ensureRuntimeSchema()`
  - **Details**: Add `CREATE TABLE IF NOT EXISTS agent_traces` with columns (id, session_id, message_id, part_type, part_id, tool_name, tool_status, tool_input, tool_output, content, metadata, created_at). Add all 6 indexes. Create `agent_traces_fts` FTS5 virtual table with 3 triggers (insert/delete/update).
  - **Verify**: Run `getDb()` and query `sqlite_master` — table, indexes, FTS5 table, and triggers exist.

- [ ] 1.2 Create `agent_session_usage` table with indexes
  - **File**: `src/lib/db/localDb.js` — add to `ensureRuntimeSchema()`
  - **Details**: `CREATE TABLE IF NOT EXISTS agent_session_usage` (id, session_id, message_id, prompt_tokens, completion_tokens, total_tokens, model, created_at). Add 3 indexes.
  - **Verify**: Table and indexes exist in `sqlite_master`.

- [ ] 1.3 Create `telegram_session_map` table with indexes
  - **File**: `src/lib/db/localDb.js` — add to `ensureRuntimeSchema()`
  - **Details**: `CREATE TABLE IF NOT EXISTS telegram_session_map` (id, telegram_chat_id, session_id, opencode_session_id, active, last_message_at, created_at). Add 3 indexes.
  - **Verify**: Table and indexes exist in `sqlite_master`.

- [ ] 1.4 ALTER TABLE `agent_hub_sessions` with new columns and indexes
  - **File**: `src/lib/db/localDb.js` — add ALTER statements to `ensureRuntimeSchema()`
  - **Details**: Add columns: `telegram_chat_id TEXT`, `directory TEXT`, `status TEXT DEFAULT 'active'`, `opencode_session_id TEXT`, `total_prompt_tokens INTEGER DEFAULT 0`, `total_completion_tokens INTEGER DEFAULT 0`, `total_tokens INTEGER DEFAULT 0`. Add 2 indexes. Wrap each in try/catch for duplicate column safety.
  - **Verify**: `PRAGMA table_info(agent_hub_sessions)` shows all new columns.

- [ ] 1.5 ALTER TABLE `agent_hub_messages` with new columns
  - **File**: `src/lib/db/localDb.js` — add ALTER statements to `ensureRuntimeSchema()`
  - **Details**: Add columns: `source TEXT DEFAULT 'web'`, `prompt_tokens INTEGER DEFAULT 0`, `completion_tokens INTEGER DEFAULT 0`, `total_tokens INTEGER DEFAULT 0`, `opencode_session_id TEXT`.
  - **Verify**: `PRAGMA table_info(agent_hub_messages)` shows all new columns.

- [ ] 1.6 Add `agent_traces` and `agent_session_usage` to `tables` export
  - **File**: `src/lib/db/localDb.js` — add to `tables` object
  - **Details**: `agent_traces: makeTableOps('agent_traces', 'id')`, `agent_session_usage: makeTableOps('agent_session_usage', 'id')`, `telegram_session_map: makeTableOps('telegram_session_map', 'id')`.
  - **Verify**: `tables.agent_traces.insert(...)`, `tables.agent_traces.select(...)` work.

- [ ] 1.7 Create standalone migration script
  - **File**: `scripts/migrate-observability-v2.js` (NEW)
  - **Details**: Idempotent migration that creates all 3 new tables, ALTERs existing tables, creates indexes, FTS5 table, and triggers. Safe to run multiple times.
  - **Verify**: `node scripts/migrate-observability-v2.js` runs without errors on existing DB.

## Phase 2: Core API Layer

- [ ] 2.1 Create `POST /api/agenthub/traces` route for batch trace persistence
  - **File**: `src/app/api/agenthub/traces/route.js` (NEW)
  - **Details**: Accepts `{ traces: [{ id, session_id, part_type, ... }] }`. Uses `db.transaction()` for atomic batch insert. Supports single trace or array. Returns `{ saved: N }`.
  - **Verify**: `curl -X POST /api/agenthub/traces -d '{"traces":[{...}]}'` inserts rows.

- [ ] 2.2 Create `GET /api/agenthub/traces` route for trace querying with FTS5
  - **File**: `src/app/api/agenthub/traces/route.js` — add GET handler
  - **Details**: Query params: `session_id`, `type`, `tool_name`, `tool_status`, `search`, `limit`, `offset`, `order`. Uses FTS5 when `search` param provided. Returns `{ traces, total, has_more }`.
  - **Verify**: `GET /api/agenthub/traces?session_id=X&type=tool&search=TypeError` returns filtered results.

- [ ] 2.3 Create `POST /api/agenthub/sessions` route for session creation/lookup
  - **File**: `src/app/api/agenthub/sessions/route.js` (NEW)
  - **Details**: Accepts `{ project_id, title, agent_model, telegram_chat_id, directory, opencode_session_id }`. If `telegram_chat_id` provided and active session exists, return it. Otherwise create new. Update `telegram_session_map` if applicable.
  - **Verify**: POST creates new session; second POST with same `telegram_chat_id` returns existing.

- [ ] 2.4 Create `GET /api/agenthub/sessions` route for session listing
  - **File**: `src/app/api/agenthub/sessions/route.js` — add GET handler
  - **Details**: Query params: `project_id`, `telegram_chat_id`, `status`, `limit`. Joins with `agent_hub_messages` for message_count. Returns `{ sessions, total }`.
  - **Verify**: `GET /api/agenthub/sessions?project_id=X&status=active` returns filtered list.

- [ ] 2.5 Create `GET /api/agenthub/sessions/[id]/traces` route
  - **File**: `src/app/api/agenthub/sessions/[id]/traces/route.js` (NEW)
  - **Details**: Same as 2.2 but `session_id` from URL path. Supports same query params for filtering.
  - **Verify**: `GET /api/agenthub/sessions/sess-123/traces?type=tool` returns traces for that session.

- [ ] 2.6 Create `GET /api/agenthub/sessions/[id]/usage` route for token usage
  - **File**: `src/app/api/agenthub/sessions/[id]/usage/route.js` (NEW)
  - **Details**: Returns latest `agent_session_usage` row for session, plus aggregated totals from `agent_hub_sessions`. Response: `{ prompt_tokens, completion_tokens, total_tokens, model, context_utilization_pct }`.
  - **Verify**: Returns current usage for active session, final usage for completed.

- [ ] 2.7 Create `POST /api/agenthub/sessions/[id]/permissions/[permId]` route
  - **File**: `src/app/api/agenthub/sessions/[id]/permissions/[permId]/route.js` (NEW)
  - **Details**: Accepts `{ response: "approve" | "reject" }`. Forwards to OpenCode `POST /session/:opencode_session_id/permissions/:permId`. Logs permission event to `agent_traces`.
  - **Verify**: POST with "approve" forwards to OpenCode and returns success.

- [ ] 2.8 Create `GET /api/agenthub/mcp/status` route
  - **File**: `src/app/api/agenthub/mcp/status/route.js` (NEW)
  - **Details**: Queries OpenCode `/agent` or equivalent endpoint for connected MCP servers, their tools, and status. Returns `{ servers: [{ name, status, tools }], opencode_server: { running, port, health } }`.
  - **Verify**: Returns array of servers with tool lists when OpenCode is running.

- [ ] 2.9 Create `POST /api/telegram/sync` webhook route
  - **File**: `src/app/api/telegram/sync/route.js` (NEW)
  - **Details**: Validates `TELEGRAM_WEBHOOK_SECRET` header. Accepts `{ telegram_chat_id, session_id, event_type, message, traces }`. Finds/creates session mapping, persists message to `agent_hub_messages`, persists traces to `agent_traces`. Returns 200 with session state.
  - **Verify**: POST with valid secret persists data; invalid secret returns 401.

- [ ] 2.10 Enhance `POST /api/agenthub/headless` with directory, session reuse, trace persistence
  - **File**: `src/app/api/agenthub/headless/route.js` (MODIFY)
  - **Details**: Accept new body fields: `directory`, `session_id`, `persist_traces`. When `persist_traces: true`, pipe SSE through TransformStream that batches and saves to SQLite. Return `X-AgentHub-Session-ID` header.
  - **Verify**: POST with `persist_traces: true` saves traces; `session_id` reuses existing session.

- [ ] 2.11 Create `useSSEConnection` hook
  - **File**: `src/hooks/useSSEConnection.js` (NEW)
  - **Details**: React hook wrapping EventSource with exponential backoff reconnect (baseDelay=1s, maxDelay=30s, maxRetries=10). Returns `{ events, status, reconnect, disconnect }`. Status values: 'disconnected', 'connecting', 'connected', 'reconnecting', 'failed'.
  - **Verify**: Hook connects, receives events, reconnects on error with backoff.

- [ ] 2.12 Create `useTracePersistence` hook
  - **File**: `src/hooks/useTracePersistence.js` (NEW)
  - **Details**: Accumulates trace parts in memory, flushes to `POST /api/agenthub/traces` every 500ms or when 20 parts accumulated. Uses `db.transaction()` equivalent via batch API. Exposes `pushTrace(part)` and `flush()`.
  - **Verify**: Traces batch correctly; flush triggers on timer and count threshold.

## Phase 3: Telegram Migration

- [ ] 3.1 Create `telegram-bot/services/session-bridge.js`
  - **File**: `telegram-bot/services/session-bridge.js` (NEW)
  - **Details**: `SessionBridge` class with methods: `findOrCreateSession(chatId, projectId, directory)`, `switchSession(chatId, sessionId)`, `syncMessage(params)`, `getSessions(chatId)`, `switchProject(chatId, directory)`. Uses SQLite `telegram_session_map` and `agent_hub_sessions` tables.
  - **Verify**: Each method performs correct DB operations; findOrCreateSession returns existing active session when available.

- [ ] 3.2 Enhance `telegram-bot/services/opencode.js` with persistent sessions
  - **File**: `telegram-bot/services/opencode.js` (MODIFY)
  - **Details**: Add `createSession(cwd)`, `sendMessage(sessionId, opencodeSessionId, agent, prompt, options)`, `subscribeToSession(sessionId, onEvent)`, `getActiveSessions()`, `setSessionDirectory(sessionId, directory)`. Modify `run()` to accept `sessionId` parameter.
  - **Verify**: `createSession` returns valid session IDs; `sendMessage` reuses existing session.

- [ ] 3.3 Create `telegram-bot/commands/session.js`
  - **File**: `telegram-bot/commands/session.js` (NEW)
  - **Details**: Register `/session` (show current or create new), `/session new` (force create), `/session info` (show details with token usage), `/session switch <id>` (switch session). Uses sessionBridge.
  - **Verify**: Each subcommand responds correctly in Telegram.

- [ ] 3.4 Create `telegram-bot/commands/project.js`
  - **File**: `telegram-bot/commands/project.js` (NEW)
  - **Details**: Register `/project` (show current), `/project list` (list available), `/project switch <name>` (switch project and update OpenCode cwd).
  - **Verify**: Switch updates directory; list shows available projects.

- [ ] 3.5 Modify `telegram-bot/commands/chat.js` with OpenCode path
  - **File**: `telegram-bot/commands/chat.js` (MODIFY)
  - **Details**: Add `TELEGRAM_USE_OPENCODE` feature flag check. When true: route through sessionBridge → opencode.sendMessage() with onEvent/onApproval callbacks. When false: fall back to LLM Bridge. Add callback_query handler for permission inline buttons.
  - **Verify**: With flag=true, messages go through OpenCode; with flag=false, LLM Bridge path works.

- [ ] 3.6 Modify `telegram-bot/commands/sessions.js` for enhanced listing
  - **File**: `telegram-bot/commands/sessions.js` (MODIFY)
  - **Details**: Query `agent_hub_sessions` instead of `telegram_sessions`. Show token usage, last activity, project. Add inline buttons for session switching.
  - **Verify**: `/sessions` shows formatted list with all fields.

- [ ] 3.7 Register new commands and callback_query handler in `bot.js`
  - **File**: `telegram-bot/bot.js` (MODIFY)
  - **Details**: Import and register session.js and project.js commands. Add `bot.on('callback_query')` handler for permission approvals (approve/reject → call OpenCode permission API → edit message).
  - **Verify**: All new commands respond; inline button callbacks trigger correct API calls.

## Phase 4: Web UI — Trace Enhancements

- [ ] 4.1 Create `TraceSearchBar.jsx` component
  - **File**: `src/components/chat/TraceSearchBar.jsx` (NEW)
  - **Details**: Props: query, onQueryChange, toolFilter, onToolFilterChange, statusFilter, onStatusFilterChange, availableTools, isSearching. Debounced search (300ms). Dropdown for tool type. Status filter chips. Clear all button. Result count.
  - **Verify**: Typing triggers debounced search; filters update correctly; clear resets all.

- [ ] 4.2 Create `OutputViewerModal.jsx` component
  - **File**: `src/components/chat/OutputViewerModal.jsx` (NEW)
  - **Details**: Props: isOpen, onClose, trace, title. Full output with syntax highlighting. Expand/collapse sections. Copy to clipboard. Download as file. Line numbers toggle. Max height 70vh.
  - **Verify**: Modal opens with full content; copy works; download triggers file save.

- [ ] 4.3 Create `PermissionModal.jsx` component
  - **File**: `src/components/chat/PermissionModal.jsx` (NEW)
  - **Details**: Props: isOpen, onClose, permission, onApprove, onReject, isProcessing. Shows tool name, args, risk. Approve/Reject buttons. 60s countdown timer with auto-reject. Keyboard shortcuts (Enter=approve, Esc=reject).
  - **Verify**: Modal appears with permission details; approve/reject call correct callbacks; timeout auto-rejects.

- [ ] 4.4 Create `TokenUsageBadge.jsx` component
  - **File**: `src/components/chat/TokenUsageBadge.jsx` (NEW)
  - **Details**: Props: promptTokens, completionTokens, totalTokens, model, size, showModel. Color-coded: green (<10k), yellow (10k-50k), red (>50k). Hover tooltip with breakdown. Context utilization percentage with color indicator.
  - **Verify**: Badge shows correct colors for different token ranges; tooltip shows breakdown.

- [ ] 4.5 Create `MCPStatusPanel.jsx` component
  - **File**: `src/components/chat/MCPStatusPanel.jsx` (NEW)
  - **Details**: Props: servers, isOpen, onToggle. Lists MCP servers with status badges. Expandable tool list per server. Auto-refresh every 30s. Manual refresh button.
  - **Verify**: Panel shows servers with correct status; refresh updates data.

- [ ] 4.6 Create `SessionListModal.jsx` component
  - **File**: `src/components/chat/SessionListModal.jsx` (NEW)
  - **Details**: Props: isOpen, onClose, projectId, onSelectSession, activeSessionId. Searchable session list. Filter by project. Shows title, last activity, token usage, message count. Telegram indicator for cross-channel sessions. Delete option with confirmation.
  - **Verify**: Modal lists sessions; search filters; click switches session.

- [ ] 4.7 Enhance `AgentTracePanel.jsx` with search, virtualization, API loading
  - **File**: `src/components/chat/AgentTracePanel.jsx` (MODIFY)
  - **Details**: Add new props: sessionId, searchQuery, toolFilter, statusFilter, onTraceClick, showSearch, maxVisible. Integrate TraceSearchBar. Add virtualization (windowed rendering). Replace inline truncation with "Show more" → opens OutputViewerModal. Load traces from API when sessionId provided. Add loading skeleton.
  - **Verify**: Panel loads traces from API; search filters work; expand shows full output.

- [ ] 4.8 Enhance `AgentHub.jsx` with new components and SSE integration
  - **File**: `src/views/AgentHub.jsx` (MODIFY)
  - **Details**: Add state: permissionRequest, sessionUsage, showSessionList, activeSessionId. Integrate PermissionModal, TokenUsageBadge, SessionListModal. Add trace persistence via useTracePersistence hook. Add session creation with directory param. Refactor dispatchOpenCode to accept/return session ID.
  - **Verify**: Permission modal appears on SSE event; token badge updates; session list works.

- [ ] 4.9 Enhance `AgentActivityFeed.jsx` with SSE subscription
  - **File**: `src/components/chat/AgentActivityFeed.jsx` (MODIFY) — if it exists, otherwise skip
  - **Details**: Replace polling with SSE subscription to `/api/agenthub/stream`. Add activity type icons. Click-to-navigate to session. Filter by source (web/telegram).
  - **Verify**: Feed updates in real-time without polling.

## Phase 5: SwarmControl Real-time

- [ ] 5.1 Create `/api/agenthub/stream` SSE aggregator endpoint
  - **File**: `src/app/api/agenthub/stream/route.js` (NEW)
  - **Details**: SSE endpoint aggregating events from all active OpenCode sessions. Each event includes: session_id, event_type, agent_name, tool_name, content, timestamp, status. Supports `?session_id=X` filter. Maintains connection to all active OpenCode SSE streams and fans out to connected clients.
  - **Verify**: Connecting to endpoint receives events from all active sessions; filter works.

- [ ] 5.2 Enhance `SwarmControl.jsx` with SSE replacing polling
  - **File**: `src/views/SwarmControl.jsx` (MODIFY)
  - **Details**: Replace 5s polling with `useSSEConnection` hook to `/api/agenthub/stream`. Add live status indicators (connecting, connected, error). Add reconnection logic with exponential backoff. Keep polling as fallback after 3 failed SSE attempts. Add warning banner for fallback mode.
  - **Verify**: SSE connects and shows live updates; fallback activates on SSE failure.

- [ ] 5.3 Add live execution cards to SwarmControl
  - **File**: `src/views/SwarmControl.jsx` (MODIFY)
  - **Details**: Each active agent session renders a card showing: agent name, current tool (with icon), reasoning snippet (truncated 120 chars), status badge, elapsed time. Cards update in real-time via SSE events. Card transitions: busy → "Ejecutando" with timer, tool execution → shows tool name, idle → "Completado" with duration.
  - **Verify**: Cards appear/disappear based on session state; real-time updates work.

- [ ] 5.4 Add expandable trace panel to SwarmControl agent cards
  - **File**: `src/views/SwarmControl.jsx` (MODIFY)
  - **Details**: Clicking an execution card expands inline AgentTracePanel showing all trace parts for that session. Loads persisted traces from API for completed sessions, live traces for active sessions. Reuses AgentTracePanel component with sessionId prop.
  - **Verify**: Clicking card expands trace panel; traces load correctly for both active and completed sessions.

- [ ] 5.5 Add MCPStatusPanel to SwarmControl header
  - **File**: `src/views/SwarmControl.jsx` (MODIFY)
  - **Details**: Add MCPStatusPanel in SwarmControl header area. Fetches MCP status from `/api/agenthub/mcp/status`. Shows connected servers and tools.
  - **Verify**: MCP panel displays in SwarmControl with server status.

- [ ] 5.6 Remove agent_registry dependency from SwarmControl
  - **File**: `src/views/SwarmControl.jsx` (MODIFY)
  - **Details**: Remove all references to `agent_registry` table and `getAgentRegistryLiveSnapshot()`. Agent status now comes exclusively from OpenCode SSE. Ensure no errors when registry table is empty.
  - **Verify**: SwarmControl loads and displays agents without any registry table queries.

## Phase 6: Cleanup & Migration

- [ ] 6.1 Mark `llm-bridge.js` as deprecated
  - **File**: `telegram-bot/services/providers/llm-bridge.js` (MODIFY)
  - **Details**: Add deprecation comment at top of file. Add console.warn on initialization. Keep file intact for fallback path.
  - **Verify**: File still works when TELEGRAM_USE_OPENCODE=false; warning appears on load.

- [ ] 6.2 Add feature flags to `.env.example`
  - **File**: `.env.example` and `telegram-bot/.env.example` (MODIFY)
  - **Details**: Add `TELEGRAM_USE_OPENCODE=true`, `TELEGRAM_WEBHOOK_SECRET=change-me`, `TRACE_PERSISTENCE_ENABLED=true`. Document each flag.
  - **Verify**: New env vars documented and usable.

- [ ] 6.3 Create legacy data migration function (optional)
  - **File**: `scripts/migrate-observability-v2.js` — add `migrateLegacyData()` function
  - **Details**: Migrate `ai_interactions` to `agent_traces` as best-effort. Map each interaction to a trace with part_type='text', source metadata. Run as separate optional step.
  - **Verify**: Legacy interactions appear in traces with correct metadata.

- [ ] 6.4 Write unit tests for SessionBridge
  - **File**: `tests/unit/session-bridge.test.js` (NEW)
  - **Details**: Test `findOrCreateSession` (existing vs new), `switchSession`, `syncMessage`, `getSessions`, `switchProject`. Use mock DB and mock OpenCode service.
  - **Verify**: All tests pass with mock data.

- [ ] 6.5 Write unit tests for trace persistence
  - **File**: `tests/unit/trace-persistence.test.js` (NEW)
  - **Details**: Test batch insert, FTS5 triggers (insert/delete/update), error handling, individual retry on batch failure.
  - **Verify**: All tests pass; FTS5 search returns correct results.

- [ ] 6.6 Write integration test for SSE pipeline
  - **File**: `tests/integration/sse-pipeline.test.js` (NEW)
  - **Details**: Start mock OpenCode server emitting known SSE events. POST to `/api/agenthub/headless` with `persist_traces: true`. Wait for completion. Query `agent_traces` and verify all expected parts saved.
  - **Verify**: All trace parts persisted correctly from SSE stream.

- [ ] 6.7 Write integration test for trace search (FTS5)
  - **File**: `tests/integration/trace-search.test.js` (NEW)
  - **Details**: Insert test traces with known content. Test FTS5 search queries: exact match, partial match, tool_output search, tool_name search. Verify filter params work correctly.
  - **Verify**: Search returns correct results for all query types.

- [ ] 6.8 Write integration test for permission API flow
  - **File**: `tests/integration/permission-api.test.js` (NEW)
  - **Details**: Test `POST /api/agenthub/sessions/:id/permissions/:permId` with approve and reject. Mock OpenCode permission endpoint. Verify trace logging.
  - **Verify**: Approval/rejection forwarded correctly; trace logged.

- [ ] 6.9 Write integration test for Telegram sync webhook
  - **File**: `tests/integration/telegram-sync.test.js` (NEW)
  - **Details**: Test `POST /api/telegram/sync` with valid/invalid secret. Verify session mapping created/updated, message persisted, traces saved.
  - **Verify**: Valid webhook persists all data; invalid secret returns 401.
