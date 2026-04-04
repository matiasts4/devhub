# Delta for Trace Storage

## ADDED Requirements

### Requirement: Persistent Agent Traces

The system MUST store every SSE trace part from OpenCode executions into `agent_traces`. Schema: `id` (UUID), `session_id` (FK), `message_id` (nullable), `part_type` (tool|reasoning|text|subtask), `part_id`, `tool_name`, `tool_status` (running|completed|error), `tool_input` (JSON), `tool_output` (TEXT), `content` (TEXT), `metadata` (JSON), `created_at` (auto).

#### Scenario: Tool execution trace saved

- GIVEN an agent executes a tool call
- WHEN SSE event `tool.start` arrives
- THEN a row is inserted with `part_type='tool'`, `tool_status='running'`, `tool_name`, `tool_input` as JSON

#### Scenario: Tool completion trace updated

- GIVEN a running tool trace exists
- WHEN SSE event `tool.complete` arrives
- THEN the row is updated with `tool_status='completed'`, `tool_output`, and duration in metadata

#### Scenario: Non-tool trace saved

- GIVEN an agent emits reasoning, text, or subtask events
- WHEN the SSE event arrives
- THEN a row is inserted with the appropriate `part_type` and `content`

### Requirement: Auto-save on SSE Event

The system MUST save each trace part to SQLite immediately upon receiving the corresponding SSE event, without batching or delaying. The save operation MUST NOT block SSE event delivery to the UI.

#### Scenario: Trace saved without blocking UI

- GIVEN a user sends a prompt via AgentHub
- WHEN the SSE stream delivers events
- THEN each event is saved to SQLite asynchronously while the UI renders in real-time

### Requirement: Trace Recovery by Session ID

The system MUST allow retrieving all trace parts for a given `session_id`, ordered by `created_at` ascending, via a GET API endpoint.

#### Scenario: Full trace recovery after page refresh

- GIVEN a session with 50+ trace parts exists in SQLite
- WHEN the user refreshes the AgentHub page and selects that session
- THEN all trace parts are loaded and rendered in correct chronological order

### Requirement: FTS5 Full-Text Search

The system MUST create an FTS5 virtual table on `agent_traces(content, tool_output, tool_name)`.

#### Scenario: Search finds tool by output content

- GIVEN a tool produced output containing "TypeError"
- WHEN a search query `TypeError` is submitted
- THEN the trace row is returned

### Requirement: Trace Filter API

The system MUST provide GET `/api/agenthub/traces` with params: `session_id`, `part_type`, `tool_status`, `tool_name`, `date_from`, `date_to`, `search`, `limit`, `offset`.

#### Scenario: Filter by tool type and search

- GIVEN traces exist for multiple tools
- WHEN GET `/api/agenthub/traces?part_type=tool&search=git` is called
- THEN only bash tool traces containing "git" are returned

### Requirement: Trace Metadata Schema

Every trace row MUST include: `session_id` (non-null FK), `part_type` (non-null), `created_at` (auto). Optional: `message_id`, `part_id`, `tool_name`, `tool_status`, `tool_input`, `tool_output`, `content`, `metadata`.

#### Scenario: Minimal trace row

- GIVEN a text-only SSE event
- WHEN saved
- THEN only `session_id`, `part_type='text'`, `content`, `created_at` are populated
