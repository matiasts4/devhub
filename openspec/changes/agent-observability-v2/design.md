# Technical Design: Agent Observability v2

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            DevHub Application                           │
│                                                                         │
│  ┌──────────────┐    ┌───────────────────────────────────────────────┐  │
│  │  Web AgentHub│    │              SwarmControl                      │  │
│  │  (React SPA) │    │  ┌─────────────┐  ┌────────────────────────┐  │  │
│  │              │    │  │ SSE Feed    │  │ AgentTracePanel (v2)   │  │  │
│  │  ┌─────────┐ │    │  │ (real-time) │  │ - search/filter        │  │  │
│  │  │ChatInput│ │    │  └──────┬──────┘  │ - virtualization       │  │  │
│  │  └────┬────┘ │    │         │         │ - full output viewer   │  │  │
│  │  ┌────┴────┐ │    │  ┌──────┴──────┐  │ - permission modal     │  │  │
│  │  │TracePane│ │    │  │MCPStatusPanel│  └────────────────────────┘  │  │
│  │  └─────────┘ │    │  └─────────────┘                              │  │
│  └──────┬───────┘    └───────────────────────────────────────────────┘  │
│         │                                                               │
│  ┌──────┴───────────────────────────────────────────────────────────┐   │
│  │                    Next.js API Routes                             │   │
│  │                                                                   │   │
│  │  POST /api/agenthub/sessions      ← create/find session           │   │
│  │  GET  /api/agenthub/sessions/:id/traces  ← trace query            │   │
│  │  POST /api/agenthub/sessions/:id/permissions/:permId ← approve    │   │
│  │  GET  /api/agenthub/mcp/status    ← MCP server health             │   │
│  │  POST /api/agenthub/headless      ← SSE proxy (enhanced)          │   │
│  │  POST /api/agenthub/traces        ← persist trace parts           │   │
│  │  POST /api/telegram/sync          ← Telegram→Web webhook          │   │
│  └──────┬───────────────────────────────────────────────────────────┘   │
│         │                                                               │
│  ┌──────┴───────────────────────────────────────────────────────────┐   │
│  │                    SQLite (better-sqlite3)                        │   │
│  │                                                                   │   │
│  │  agent_hub_sessions ───┬─── agent_hub_messages                    │   │
│  │                        │                                           │   │
│  │                        ├─── agent_traces (NEW)                     │   │
│  │                        ├─── agent_session_usage (NEW)              │   │
│  │                        │                                           │   │
│  │  telegram_sessions ────┼─── telegram_session_map (NEW)             │   │
│  │                        │                                           │   │
│  │  agent_registry (deprecated)                                       │   │
│  │  mcp_connections (deprecated)                                      │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │  SSE (Server-Sent Events)
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      OpenCode Headless Server                           │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────────────┐  │
│  │ /session    │  │ /event (SSE) │  │ /session/:id/permissions/:pid │  │
│  │ POST        │  │ GET          │  │ POST (approve/reject)         │  │
│  └─────────────┘  └──────────────┘  └───────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    MCP Servers (native)                           │  │
│  │  engram-mcp  │  filesystem  │  web-search  │  github  │  custom   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        Telegram Bot                                     │
│                                                                         │
│  ┌──────────┐  ┌───────────────┐  ┌────────────────────────────────┐   │
│  │ bot.js   │→ │ session-bridge│→ │ opencode.js (enhanced)         │   │
│  │(webhook) │  │ (NEW)         │  │ - persistent sessions           │   │
│  └──────────┘  └───────┬───────┘  │ - directory switching           │   │
│                        │          │ - SSE event routing             │   │
│  ┌─────────────────────┼──────┐   │ - approval via inline buttons   │   │
│  │ commands/           │      │   └────────────────────────────────┘   │
│  │  chat.js (modified) │      │                                        │
│  │  session.js (NEW)   │      │   ┌────────────────────────────────┐   │
│  │  sessions.js (mod)  │      │   │ llm-bridge.js (deprecated)     │   │
│  │  project.js (NEW)   │      │   │ - kept as fallback              │   │
│  └─────────────────────┘      │   └────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │  POST /api/telegram/sync
         ▼
    Next.js API (web sync)
```

## Database Schema Changes

### New Table: `agent_traces`

Persistent storage for all SSE trace parts. This is the core table that enables search, filtering, and history across sessions.

```sql
CREATE TABLE IF NOT EXISTS agent_traces (
  id            TEXT PRIMARY KEY,           -- UUID v4
  session_id    TEXT NOT NULL,              -- FK → agent_hub_sessions.id
  message_id    TEXT,                       -- FK → agent_hub_messages.id (nullable for tool-only events)
  part_type     TEXT NOT NULL,              -- 'tool' | 'text' | 'reasoning' | 'subtask'
  part_id       TEXT,                       -- OpenCode's internal part identifier
  tool_name     TEXT,                       -- Set when part_type = 'tool'
  tool_status   TEXT,                       -- 'running' | 'completed' | 'error'
  tool_input    TEXT,                       -- JSON string of tool input parameters
  tool_output   TEXT,                       -- Tool output (may be large)
  content       TEXT,                       -- Text content or reasoning text
  metadata      TEXT,                       -- JSON: timing, agent name, error details
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_traces_session ON agent_traces(session_id);
CREATE INDEX IF NOT EXISTS idx_traces_message ON agent_traces(message_id);
CREATE INDEX IF NOT EXISTS idx_traces_type ON agent_traces(part_type);
CREATE INDEX IF NOT EXISTS idx_traces_tool ON agent_traces(tool_name) WHERE tool_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_traces_status ON agent_traces(tool_status) WHERE tool_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_traces_created ON agent_traces(created_at DESC);

-- FTS5 virtual table for full-text search across content and tool_output
CREATE VIRTUAL TABLE IF NOT EXISTS agent_traces_fts USING fts5(
  content,
  tool_output,
  tool_name,
  content='agent_traces',
  content_rowid='rowid'
);

-- Triggers to keep FTS5 in sync
CREATE TRIGGER IF NOT EXISTS traces_fts_insert AFTER INSERT ON agent_traces BEGIN
  INSERT INTO agent_traces_fts(rowid, content, tool_output, tool_name)
  VALUES (new.rowid, new.content, new.tool_output, new.tool_name);
END;

CREATE TRIGGER IF NOT EXISTS traces_fts_delete AFTER DELETE ON agent_traces BEGIN
  INSERT INTO agent_traces_fts(agent_traces_fts, rowid, content, tool_output, tool_name)
  VALUES ('delete', old.rowid, old.content, old.tool_output, old.tool_name);
END;

CREATE TRIGGER IF NOT EXISTS traces_fts_update AFTER UPDATE ON agent_traces BEGIN
  INSERT INTO agent_traces_fts(agent_traces_fts, rowid, content, tool_output, tool_name)
  VALUES ('delete', old.rowid, old.content, old.tool_output, old.tool_name);
  INSERT INTO agent_traces_fts(rowid, content, tool_output, tool_name)
  VALUES (new.rowid, new.content, new.tool_output, new.tool_name);
END;
```

### New Table: `agent_session_usage`

Token usage snapshots per session, updated after each message completion.

```sql
CREATE TABLE IF NOT EXISTS agent_session_usage (
  id              TEXT PRIMARY KEY,           -- UUID v4
  session_id      TEXT NOT NULL,              -- FK → agent_hub_sessions.id
  message_id      TEXT,                       -- FK → agent_hub_messages.id
  prompt_tokens   INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens    INTEGER DEFAULT 0,
  model           TEXT,                       -- e.g. 'claude-sonnet-4-20250514'
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_session ON agent_session_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_message ON agent_session_usage(message_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON agent_session_usage(created_at DESC);
```

### New Table: `telegram_session_map`

Bridges Telegram chat IDs to AgentHub session IDs for cross-channel session sharing.

```sql
CREATE TABLE IF NOT EXISTS telegram_session_map (
  id                TEXT PRIMARY KEY,           -- UUID v4
  telegram_chat_id  TEXT NOT NULL,              -- Telegram chat ID
  session_id        TEXT NOT NULL,              -- FK → agent_hub_sessions.id
  opencode_session_id TEXT,                     -- OpenCode's internal session ID
  active            INTEGER DEFAULT 1,          -- 0 = inactive/archived
  last_message_at   TEXT,                       -- Timestamp of last message
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tg_map_chat ON telegram_session_map(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_tg_map_session ON telegram_session_map(session_id);
CREATE INDEX IF NOT EXISTS idx_tg_map_active ON telegram_session_map(telegram_chat_id, active);
```

### ALTER TABLE: `agent_hub_sessions`

Add columns to support Telegram mapping, project directory context, and token tracking.

```sql
ALTER TABLE agent_hub_sessions ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE agent_hub_sessions ADD COLUMN directory TEXT;
ALTER TABLE agent_hub_sessions ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE agent_hub_sessions ADD COLUMN opencode_session_id TEXT;
ALTER TABLE agent_hub_sessions ADD COLUMN total_prompt_tokens INTEGER DEFAULT 0;
ALTER TABLE agent_hub_sessions ADD COLUMN total_completion_tokens INTEGER DEFAULT 0;
ALTER TABLE agent_hub_sessions ADD COLUMN total_tokens INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ahs_telegram ON agent_hub_sessions(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ahs_status ON agent_hub_sessions(status);
```

### ALTER TABLE: `agent_hub_messages`

Add token usage and source tracking per message.

```sql
ALTER TABLE agent_hub_messages ADD COLUMN source TEXT DEFAULT 'web';  -- 'web' | 'telegram'
ALTER TABLE agent_hub_messages ADD COLUMN prompt_tokens INTEGER DEFAULT 0;
ALTER TABLE agent_hub_messages ADD COLUMN completion_tokens INTEGER DEFAULT 0;
ALTER TABLE agent_hub_messages ADD COLUMN total_tokens INTEGER DEFAULT 0;
ALTER TABLE agent_hub_messages ADD COLUMN opencode_session_id TEXT;
```

### Index Strategy Summary

| Index                | Purpose                                   | Selectivity |
| -------------------- | ----------------------------------------- | ----------- |
| `idx_traces_session` | Fast trace lookup by session              | High        |
| `idx_traces_type`    | Filter by part type (tool/text/reasoning) | Medium      |
| `idx_traces_tool`    | Filter by tool name                       | High        |
| `idx_traces_status`  | Filter by tool status                     | Medium      |
| `idx_traces_created` | Recent-first ordering                     | High        |
| `idx_tg_map_chat`    | Find Telegram → session mapping           | High        |
| `idx_tg_map_active`  | Find active session for chat              | High        |
| `idx_ahs_telegram`   | Find web session by Telegram chat         | High        |
| `agent_traces_fts`   | Full-text search across traces            | High        |

## API Design

### `POST /api/agenthub/sessions` — Create or Find Session

**Request:**

```json
{
  "project_id": "proj-123",
  "title": "Fix auth bug",
  "agent_model": "claude-sonnet-4-20250514",
  "telegram_chat_id": "-1001234567890", // optional
  "directory": "/home/matias/devhub", // optional, defaults to project root
  "opencode_session_id": "abc-123" // optional, for bridging
}
```

**Response:**

```json
{
  "id": "sess-456",
  "project_id": "proj-123",
  "title": "Fix auth bug",
  "agent_model": "claude-sonnet-4-20250514",
  "telegram_chat_id": null,
  "directory": "/home/matias/devhub",
  "status": "active",
  "total_tokens": 0,
  "created_at": "2026-04-02T10:00:00Z",
  "updated_at": "2026-04-02T10:00:00Z"
}
```

**Logic:**

- If `telegram_chat_id` provided and an active session exists for that chat, return existing session
- Otherwise create new session
- If `opencode_session_id` provided, store it for bridging
- Update `telegram_session_map` if `telegram_chat_id` is present

### `GET /api/agenthub/sessions/:id/traces` — Get Traces for a Session

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string | — | Filter by part_type: `tool`, `text`, `reasoning`, `subtask` |
| `tool_name` | string | — | Filter by specific tool |
| `tool_status` | string | — | Filter by status: `running`, `completed`, `error` |
| `search` | string | — | FTS5 search query on content/tool_output |
| `limit` | number | 100 | Max traces to return |
| `offset` | number | 0 | Pagination offset |
| `order` | string | `desc` | Sort direction for created_at |

**Response:**

```json
{
  "traces": [
    {
      "id": "trace-789",
      "session_id": "sess-456",
      "part_type": "tool",
      "tool_name": "read_file",
      "tool_status": "completed",
      "tool_input": "{\"path\": \"src/auth.js\"}",
      "tool_output": "// file content...",
      "content": null,
      "metadata": "{\"duration\": 142}",
      "created_at": "2026-04-02T10:01:00Z"
    }
  ],
  "total": 47,
  "has_more": true
}
```

### `POST /api/agenthub/sessions/:id/permissions/:permId` — Approve/Reject Permission

**Request:**

```json
{
  "response": "approve" // or "reject"
}
```

**Logic:**

- Forward to OpenCode headless: `POST http://127.0.0.1:4153/session/:opencode_session_id/permissions/:permId`
- Return OpenCode response
- Log permission event to `agent_traces` with part_type='tool', tool_status based on response

### `GET /api/agenthub/mcp/status` — Get MCP Server Status

**Response:**

```json
{
  "servers": [
    {
      "name": "engram-mcp",
      "status": "connected",
      "tools": [
        { "name": "mem_search", "description": "Search memory" },
        { "name": "mem_save", "description": "Save observation" }
      ]
    },
    {
      "name": "filesystem",
      "status": "connected",
      "tools": [
        { "name": "read_file", "description": "Read a file" },
        { "name": "write_file", "description": "Write a file" }
      ]
    }
  ],
  "opencode_server": {
    "running": true,
    "port": 4153,
    "health": "ok"
  }
}
```

### `GET /api/agenthub/sessions` — List Sessions

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `project_id` | string | — | Filter by project |
| `telegram_chat_id` | string | — | Filter by Telegram chat |
| `status` | string | `active` | Filter by status |
| `limit` | number | 50 | Max sessions |

**Response:**

```json
{
  "sessions": [
    {
      "id": "sess-456",
      "project_id": "proj-123",
      "title": "Fix auth bug",
      "agent_model": "claude-sonnet-4-20250514",
      "status": "active",
      "total_tokens": 15420,
      "message_count": 8,
      "last_activity": "2026-04-02T10:30:00Z",
      "created_at": "2026-04-02T10:00:00Z"
    }
  ],
  "total": 12
}
```

### `POST /api/telegram/sync` — Telegram→Web Webhook

Called by the Telegram bot's session-bridge when a message is sent or received, to keep the web UI in sync.

**Request:**

```json
{
  "telegram_chat_id": "-1001234567890",
  "session_id": "sess-456",
  "event_type": "message_sent", // or "message_received", "session_created", "session_switched"
  "message": {
    "role": "user",
    "content": "Fix the auth middleware",
    "source": "telegram"
  },
  "traces": [
    // Optional: array of trace parts to persist
  ]
}
```

**Logic:**

- Validate webhook secret (from env `TELEGRAM_WEBHOOK_SECRET`)
- Find or create session mapping
- Persist message to `agent_hub_messages`
- Persist traces to `agent_traces`
- Return 200 with session state

### Modified: `POST /api/agenthub/headless` — Enhanced Headless Proxy

**New Request Body:**

```json
{
  "agent": "gentleman",
  "prompt": "Fix the auth middleware",
  "directory": "/home/matias/devhub", // NEW: project directory
  "session_id": "sess-456", // NEW: existing session to reuse
  "persist_traces": true // NEW: save traces to SQLite
}
```

**Changes:**

- Accept `directory` parameter to set OpenCode `cwd`
- Accept existing `session_id` to reuse an AgentHub session (instead of always creating new)
- When `persist_traces: true`, pipe SSE events through a trace-saver transform that writes to SQLite
- Return `X-AgentHub-Session-ID` header with the session ID for the UI to use

## Component Design

### New Components

#### `TraceSearchBar.jsx`

**Path:** `src/components/chat/TraceSearchBar.jsx`

```jsx
/**
 * @param {object} props
 * @param {string} props.query - Current search text
 * @param {function} props.onQueryChange - (query: string) => void
 * @param {string} props.toolFilter - Selected tool filter
 * @param {function} props.onToolFilterChange - (tool: string) => void
 * @param {string} props.statusFilter - Selected status filter
 * @param {function} props.onStatusFilterChange - (status: string) => void
 * @param {Array<string>} props.availableTools - List of tool names in current session
 * @param {boolean} props.isSearching - Loading state
 */
```

Features:

- Debounced text search (300ms) against FTS5
- Dropdown for tool type filter (read_file, bash, write_file, etc.)
- Status filter chips (running, completed, error)
- Clear all filters button
- Result count display

#### `OutputViewerModal.jsx`

**Path:** `src/components/chat/OutputViewerModal.jsx`

```jsx
/**
 * @param {object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {function} props.onClose - () => void
 * @param {object} props.trace - Trace part object to display
 * @param {string} props.title - Modal title
 */
```

Features:

- Full output display with syntax highlighting (auto-detect language)
- Expand/collapse sections for large outputs
- Copy to clipboard button
- Download as file option
- Line numbers toggle
- Max initial height 70vh, scrollable

#### `PermissionModal.jsx`

**Path:** `src/components/chat/PermissionModal.jsx`

```jsx
/**
 * @param {object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {function} props.onClose - () => void
 * @param {object} props.permission - { action, toolName, args, sessionID, permissionID }
 * @param {function} props.onApprove - () => Promise<void>
 * @param {function} props.onReject - () => Promise<void>
 * @param {boolean} props.isProcessing - Loading state during approval
 */
```

Features:

- Shows tool name, arguments, and risk assessment
- Approve (green) / Reject (red) buttons
- "Approve all for this tool" option
- Keyboard shortcuts (Enter=approve, Escape=reject)
- Auto-dismiss on response

#### `TokenUsageBadge.jsx`

**Path:** `src/components/chat/TokenUsageBadge.jsx`

```jsx
/**
 * @param {object} props
 * @param {number} props.promptTokens - Input tokens
 * @param {number} props.completionTokens - Output tokens
 * @param {number} props.totalTokens - Total tokens
 * @param {string} props.model - Model name
 * @param {'sm' | 'md' | 'lg'} props.size - Badge size
 * @param {boolean} props.showModel - Whether to show model name
 */
```

Features:

- Compact badge showing token counts
- Color-coded: green (<10k), yellow (10k-50k), red (>50k)
- Hover tooltip with breakdown
- Model name display (optional)

#### `MCPStatusPanel.jsx`

**Path:** `src/components/chat/MCPStatusPanel.jsx`

```jsx
/**
 * @param {object} props
 * @param {Array<object>} props.servers - MCP server status objects
 * @param {boolean} props.isOpen - Panel visibility
 * @param {function} props.onToggle - () => void
 */
```

Features:

- List of MCP servers with connection status indicators
- Expandable tool list per server
- Auto-refresh every 30s
- Click to test connection
- Shows tool count per server

#### `SessionListModal.jsx`

**Path:** `src/components/chat/SessionListModal.jsx`

```jsx
/**
 * @param {object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {function} props.onClose - () => void
 * @param {string} props.projectId - Current project filter
 * @param {function} props.onSelectSession - (sessionId: string) => void
 * @param {string} props.activeSessionId - Currently active session
 */
```

Features:

- Searchable session list
- Filter by project
- Shows session title, last activity, token usage, message count
- Click to switch session
- Delete session option (with confirmation)
- Telegram indicator for cross-channel sessions

### Modified Components

#### `AgentTracePanel.jsx`

**Changes:**

- Add `TraceSearchBar` integration at top of panel
- Add virtualization for large trace lists (use `react-virtuoso` or windowed rendering)
- Replace inline truncation (`slice(0, 1200)`) with "Show more" button that opens `OutputViewerModal`
- Add `sessionId` prop to load traces from API instead of only in-memory
- Add `onTraceClick` callback for individual trace interaction
- Add loading skeleton while traces fetch

**New Props:**

```jsx
{
  sessionId: string,           // NEW: load from API
  searchQuery: string,         // NEW: filter text
  toolFilter: string,          // NEW: tool type filter
  statusFilter: string,        // NEW: status filter
  onTraceClick: (trace) => void, // NEW: click handler
  showSearch: boolean,         // NEW: show search bar (default: true)
  maxVisible: number,          // NEW: virtualization window (default: 50)
}
```

#### `SwarmControl.jsx`

**Changes:**

- Replace 5s polling with SSE connection to `/api/agenthub/stream` (new endpoint)
- Add `AgentTracePanel` as expandable child of each agent card
- Add `MCPStatusPanel` in header
- Add live status indicators (connecting, connected, error)
- Add reconnection logic with exponential backoff
- Keep polling as fallback when SSE unavailable

**SSE Integration:**

```jsx
const useSSEFeed = (url) => {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('disconnected');
  // EventSource with backoff, session filtering
  return { events, status, reconnect };
};
```

#### `AgentHub.jsx`

**Changes:**

- Add `PermissionModal` integration — show when SSE emits `permission.asked`
- Add `TokenUsageBadge` in session header
- Add `SessionListModal` triggered by history button
- Add trace persistence: after each SSE event, POST to `/api/agenthub/traces`
- Add session creation flow that includes `directory` parameter
- Add SSE connection management (create on dispatch, cleanup on unmount)
- Refactor `dispatchOpenCode` to accept and return session ID

**New State:**

```jsx
const [permissionRequest, setPermissionRequest] = useState(null);
const [sessionUsage, setSessionUsage] = useState({ prompt: 0, completion: 0, total: 0 });
const [showSessionList, setShowSessionList] = useState(false);
const [activeSessionId, setActiveSessionId] = useState(null);
```

#### `AgentActivityFeed.jsx`

**Changes:**

- Replace polling-based activity feed with SSE subscription
- Subscribe to `/api/agenthub/stream` for real-time updates
- Add activity type icons (message, tool, permission, session)
- Add click-to-navigate to session
- Add filter by source (web/telegram)

## Telegram Bot Changes

### New/Modified Files

#### `telegram-bot/services/session-bridge.js` (NEW)

Central service for managing Telegram↔Web session synchronization.

```javascript
/**
 * SessionBridge — Manages Telegram ↔ Web session mapping and sync.
 *
 * Responsibilities:
 * - Find or create AgentHub session for a Telegram chat
 * - Sync messages bidirectionally
 * - Maintain active session state per chat
 * - Handle project directory switching
 */

class SessionBridge {
  constructor(db, opencodeService) {
    this.db = db;
    this.opencode = opencodeService;
  }

  /**
   * Find existing active session or create new one for a Telegram chat.
   * @param {string} chatId - Telegram chat ID
   * @param {string} projectId - DevHub project ID
   * @param {string} directory - Project directory path
   * @returns {Promise<{sessionId, opencodeSessionId, isNew}>}
   */
  async findOrCreateSession(chatId, projectId, directory) {}

  /**
   * Switch active session for a Telegram chat.
   * @param {string} chatId
   * @param {string} sessionId - AgentHub session to switch to
   * @returns {Promise<void>}
   */
  async switchSession(chatId, sessionId) {}

  /**
   * Sync a Telegram message to the web session.
   * @param {object} params
   * @param {string} params.chatId
   * @param {string} params.sessionId
   * @param {string} params.role - 'user' | 'assistant'
   * @param {string} params.content
   * @param {Array} params.traces - Optional trace parts
   * @returns {Promise<void>}
   */
  async syncMessage(params) {}

  /**
   * Get all sessions for a Telegram chat.
   * @param {string} chatId
   * @returns {Promise<Array>}
   */
  async getSessions(chatId) {}

  /**
   * Change project directory for a chat's active session.
   * @param {string} chatId
   * @param {string} directory
   * @returns {Promise<void>}
   */
  async switchProject(chatId, directory) {}
}
```

#### `telegram-bot/services/opencode.js` (MODIFIED)

**Changes:**

- Add `createSession(cwd)` → returns `{sessionId, opencodeSessionId}`
- Add `sendMessage(sessionId, agent, prompt, options)` → reuses existing session instead of creating new
- Add `subscribeToSession(sessionId, onEvent)` → SSE subscription for a specific session
- Add `getActiveSessions()` → list of active OpenCode sessions
- Add `setSessionDirectory(sessionId, directory)` → change cwd for a session
- Modify `run()` to accept `sessionId` parameter for session reuse
- Add persistent session management (don't destroy session after single message)

**New Function Signatures:**

```javascript
/**
 * Create a new OpenCode session without sending a prompt.
 * @param {string} cwd - Working directory
 * @returns {Promise<{sessionId: string, opencodeSessionId: string}>}
 */
async function createSession(cwd) {}

/**
 * Send a message to an existing OpenCode session.
 * @param {string} sessionId - AgentHub session ID
 * @param {string} opencodeSessionId - OpenCode's internal session ID
 * @param {string} agent - Agent name
 * @param {string} prompt - User message
 * @param {object} options
 * @param {function} [options.onEvent] - Real-time event callback
 * @param {function} [options.onApproval] - Approval request callback
 * @returns {Promise<string>} Final assistant output
 */
async function sendMessage(sessionId, opencodeSessionId, agent, prompt, options) {}

/**
 * Get status of all active OpenCode sessions.
 * @returns {Promise<Array<{sessionId, status, agent, lastActivity}>>}
 */
async function getActiveSessions() {}
```

#### `telegram-bot/commands/session.js` (NEW)

New command handlers for session management.

```javascript
// /session — Create new session or show current session status
// /session new — Force create new session
// /session info — Show current session details (title, tokens, messages)
// /session switch <id> — Switch to existing session

module.exports = {
  register(bot, db, sessionBridge) {
    bot.command('session', async (ctx) => {
      // Show current session or create new if none
    });
    bot.command('session', 'new', async (ctx) => {
      // Force create new session
    });
    bot.command('session', 'info', async (ctx) => {
      // Show session details with token usage
    });
    bot.command('session', 'switch', async (ctx) => {
      // Switch to session by ID
    });
  },
};
```

#### `telegram-bot/commands/chat.js` (MODIFIED)

**Changes:**

- Add feature flag `TELEGRAM_USE_OPENCODE` (default: `true`)
- When enabled, route through `sessionBridge` → `opencode.sendMessage()` instead of LLM Bridge
- When disabled, fall back to existing LLM Bridge path
- Add Telegram inline button handling for permission approvals (callback_query)
- Send tool execution status updates as Telegram messages (with rate limiting)

**Message Flow:**

```
User message → chat.js handler
  → sessionBridge.findOrCreateSession(chatId, projectId, directory)
  → opencode.sendMessage(sessionId, opencodeSessionId, agent, prompt, {
      onEvent: (event) => {
        // Send status update to Telegram (rate-limited)
        // e.g., "🔧 Executing read_file..."
      },
      onApproval: (permission) => {
        // Send inline keyboard with Approve/Reject buttons
        bot.sendMessage(chatId, `⚠️ Approval needed: ${permission.action}`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Approve', callback_data: `approve:${permission.permissionID}` }],
              [{ text: '❌ Reject', callback_data: `reject:${permission.permissionID}` }]
            ]
          }
        });
      }
    })
  → sessionBridge.syncMessage({ chatId, sessionId, role: 'assistant', content: response })
  → bot.sendMessage(chatId, formattedResponse)
```

#### `telegram-bot/commands/project.js` (NEW)

```javascript
// /project — Show current project
// /project list — List available projects
// /project switch <name> — Switch active project (changes directory)

module.exports = {
  register(bot, db, sessionBridge) {
    bot.command('project', async (ctx) => {
      /* show current */
    });
    bot.command('project', 'list', async (ctx) => {
      /* list projects */
    });
    bot.command('project', 'switch', async (ctx) => {
      /* switch project */
    });
  },
};
```

#### `telegram-bot/commands/sessions.js` (MODIFIED)

**Changes:**

- Query `agent_hub_sessions` instead of `telegram_sessions` for session list
- Show token usage and last activity
- Add inline buttons for session switching
- Add project filter

### Message Flow (Detailed)

```
1. User sends message in Telegram
        ↓
2. bot.js receives update → routes to chat.js handler
        ↓
3. chat.js checks TELEGRAM_USE_OPENCODE flag
   ├── true → sessionBridge.findOrCreateSession(chatId, projectId, directory)
   │           ↓
   │        opencode.sendMessage(sessionId, opencodeSessionId, agent, prompt, {
   │          onEvent: (event) → send Telegram status update (rate-limited)
   │          onApproval: (perm) → send inline keyboard with approve/reject
   │        })
   │           ↓
   │        sessionBridge.syncMessage({ chatId, sessionId, role: 'assistant', content, traces })
   │           ↓
   │        POST /api/telegram/sync → Next.js persists to SQLite
   │           ↓
   │        bot.sendMessage(chatId, formattedResponse)
   │
   └── false (fallback) → existing LLM Bridge path
```

## SSE Architecture

### Flow: OpenCode → Next.js → React

```
OpenCode Headless                    Next.js API                     React Component
┌─────────────────┐                 ┌───────────────────┐            ┌─────────────────┐
│  /event (SSE)   │ ──fetch──────→ │  /api/agenthub/    │ ──SSE────→ │  AgentHub.jsx   │
│  (raw stream)   │                 │  headless/route.js │            │  SwarmControl   │
└─────────────────┘                 │                   │            └─────────────────┘
                                    │  TransformStream: │
                                    │  1. Filter by      │
                                    │     sessionID      │
                                    │  2. Persist traces │
                                    │     to SQLite      │
                                    │  3. Forward to     │
                                    │     client         │
                                    └───────────────────┘
```

### Reconnection Logic

```javascript
class SSEConnection {
  constructor(url, options = {}) {
    this.url = url;
    this.maxRetries = options.maxRetries ?? 10;
    this.baseDelay = options.baseDelay ?? 1000;
    this.maxDelay = options.maxDelay ?? 30000;
    this.retryCount = 0;
    this.eventSource = null;
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;
  }

  connect() {
    this.onStatus?.('connecting');
    this.eventSource = new EventSource(this.url);

    this.eventSource.onmessage = (event) => {
      this.retryCount = 0; // Reset on successful message
      this.onStatus?.('connected');
      this.onMessage?.(JSON.parse(event.data));
    };

    this.eventSource.onerror = () => {
      this.eventSource.close();
      this.reconnect();
    };
  }

  reconnect() {
    if (this.retryCount >= this.maxRetries) {
      this.onStatus?.('failed');
      return;
    }
    const delay = Math.min(this.baseDelay * Math.pow(2, this.retryCount), this.maxDelay);
    this.onStatus?.(`reconnecting in ${delay}ms`);
    this.retryCount++;
    setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    this.eventSource?.close();
    this.onStatus?.('disconnected');
  }
}
```

### Session-Based Event Filtering

The Next.js headless proxy already filters SSE events by `sessionID`. The enhancement adds:

- Trace persistence pipeline within the TransformStream
- Session ID header in response (`X-AgentHub-Session-ID`)
- Optional trace persistence toggle

### Trace Persistence Pipeline

```
SSE Event from OpenCode
        ↓
TransformStream.transform()
        ↓
  1. Parse event data
  2. Map to trace part format:
     { id, session_id, part_type, tool_name, tool_status, ... }
  3. Queue for batch insert
        ↓
  4. Batch insert to SQLite (every 500ms or 20 parts)
  5. Forward event to client
```

Batch insert strategy:

- Accumulate trace parts in memory
- Flush every 500ms OR when 20 parts accumulated
- Use `db.transaction()` for atomic batch writes
- On error, retry individual parts

## State Management

### React State Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      AgentHub.jsx                           │
│                                                             │
│  ┌─────────────────┐    ┌────────────────────────────────┐  │
│  │ Local State:    │    │ SSE Events (real-time)         │  │
│  │                 │    │                                │  │
│  │ messages[]      │←───│ onmessage → parse → dispatch   │  │
│  │ trace[]         │    │                                │  │
│  │ isRunning       │    │ ┌────────────────────────────┐ │  │
│  │ sessionId       │    │ │ Trace Persistence Queue    │ │  │
│  │ permissionReq   │    │ │ (batch → POST /traces)     │ │  │
│  │ sessionUsage    │    │ └────────────────────────────┘ │  │
│  └─────────────────┘    └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │
         │ props
         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Child Components                          │
│                                                             │
│  AgentTracePanel    ← trace[], searchQuery, toolFilter      │
│  PermissionModal    ← permissionRequest, onApprove, onReject│
│  TokenUsageBadge    ← sessionUsage                          │
│  SessionListModal   ← sessions[], onSelectSession           │
│  MCPStatusPanel     ← servers[], onRefresh                  │
└─────────────────────────────────────────────────────────────┘
```

### SQLite Persistence

| Table                  | Write Trigger                   | Read Trigger                 |
| ---------------------- | ------------------------------- | ---------------------------- |
| `agent_hub_sessions`   | Session creation, status change | Session list, session switch |
| `agent_hub_messages`   | Each user/assistant message     | Message history load         |
| `agent_traces`         | SSE event (batched)             | Trace panel load, search     |
| `agent_session_usage`  | Message completion              | Token usage display          |
| `telegram_session_map` | Telegram session create/switch  | Telegram→Web sync            |

### State Synchronization

- **Web → SQLite:** Direct via Next.js API routes (synchronous for messages, batched for traces)
- **Telegram → SQLite:** Via `/api/telegram/sync` webhook
- **SQLite → Web:** On component mount (initial load), then SSE for real-time updates
- **SQLite → Telegram:** Via session-bridge queries when needed

## Migration Strategy

### Phase 1: Database Schema Migration

Create a migration script at `scripts/migrate-observability-v2.js`:

```javascript
/**
 * Migration: Agent Observability v2
 *
 * Adds new tables and columns without data loss.
 * Safe to run multiple times (idempotent).
 */

const { getDb } = require('../src/lib/db/localDb');

function migrate() {
  const db = getDb();

  // 1. Create new tables (IF NOT EXISTS = idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_traces (...);
    CREATE TABLE IF NOT EXISTS agent_session_usage (...);
    CREATE TABLE IF NOT EXISTS telegram_session_map (...);
    CREATE VIRTUAL TABLE IF NOT EXISTS agent_traces_fts USING fts5(...);
  `);

  // 2. Add columns to existing tables (safe - SQLite ignores existing columns)
  const columnsToAdd = {
    agent_hub_sessions: [
      'telegram_chat_id TEXT',
      'directory TEXT',
      "status TEXT DEFAULT 'active'",
      'opencode_session_id TEXT',
      'total_prompt_tokens INTEGER DEFAULT 0',
      'total_completion_tokens INTEGER DEFAULT 0',
      'total_tokens INTEGER DEFAULT 0',
    ],
    agent_hub_messages: [
      "source TEXT DEFAULT 'web'",
      'prompt_tokens INTEGER DEFAULT 0',
      'completion_tokens INTEGER DEFAULT 0',
      'total_tokens INTEGER DEFAULT 0',
      'opencode_session_id TEXT',
    ],
  };

  for (const [table, columns] of Object.entries(columnsToAdd)) {
    for (const colDef of columns) {
      const colName = colDef.split(' ')[0];
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
      } catch (e) {
        if (!e.message.includes('duplicate column')) throw e;
        // Column already exists — skip
      }
    }
  }

  // 3. Create indexes (IF NOT EXISTS = idempotent)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_traces_session ON agent_traces(session_id);
    -- ... all other indexes
  `);

  // 4. Create FTS5 triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS traces_fts_insert ...;
    CREATE TRIGGER IF NOT EXISTS traces_fts_delete ...;
    CREATE TRIGGER IF NOT EXISTS traces_fts_update ...;
  `);

  console.log('Migration completed successfully');
}

module.exports = { migrate };
```

### Phase 2: Feature Flag Rollout

```
TELEGRAM_USE_OPENCODE=true   # Enable OpenCode path in Telegram
TELEGRAM_WEBHOOK_SECRET=xxx  # Secret for /api/telegram/sync
TRACE_PERSISTENCE_ENABLED=true # Enable trace saving to SQLite
```

### Phase 3: Backward Compatibility

- LLM Bridge files remain intact but are not imported when `TELEGRAM_USE_OPENCODE=true`
- SwarmControl falls back to 5s polling if SSE connection fails after max retries
- Old `agent_registry` and `mcp_connections` tables are NOT deleted — just deprecated
- Existing `telegram_sessions` table remains for legacy data
- `agent_hub_sessions` without new columns still work (columns have defaults)

### Phase 4: Data Migration (Optional)

If existing `llm_conversations` or `ai_interactions` data should be visible in the new system:

```javascript
function migrateLegacyData() {
  const db = getDb();

  // Migrate ai_interactions to agent_traces (best-effort)
  const interactions = db.prepare('SELECT * FROM ai_interactions').all();
  const insertTrace = db.prepare(`
    INSERT OR IGNORE INTO agent_traces (id, session_id, part_type, content, metadata, created_at)
    VALUES (?, ?, 'text', ?, ?, ?)
  `);

  const migrate = db.transaction(() => {
    for (const interaction of interactions) {
      const traceId = `migrated-${interaction.id}`;
      insertTrace.run(
        traceId,
        null, // No session mapping for legacy data
        interaction.response || interaction.prompt,
        JSON.stringify({ source: 'ai_interactions', model: interaction.model }),
        interaction.created_at
      );
    }
  });

  migrate();
  console.log(`Migrated ${interactions.length} legacy interactions`);
}
```

## File Changes Summary

| Action        | File Path                                                          | Description                                      |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| **CREATE**    | `src/lib/db/migrations/002-observability-v2.js`                    | Database migration script                        |
| **CREATE**    | `src/app/api/agenthub/sessions/route.js`                           | Session CRUD API (GET list, POST create)         |
| **CREATE**    | `src/app/api/agenthub/sessions/[id]/traces/route.js`               | Trace query API                                  |
| **CREATE**    | `src/app/api/agenthub/sessions/[id]/permissions/[permId]/route.js` | Permission approval API                          |
| **CREATE**    | `src/app/api/agenthub/traces/route.js`                             | Trace persistence API                            |
| **CREATE**    | `src/app/api/agenthub/mcp/status/route.js`                         | MCP server status API                            |
| **CREATE**    | `src/app/api/telegram/sync/route.js`                               | Telegram→Web sync webhook                        |
| **CREATE**    | `src/components/chat/TraceSearchBar.jsx`                           | Trace search and filter UI                       |
| **CREATE**    | `src/components/chat/OutputViewerModal.jsx`                        | Full output viewer modal                         |
| **CREATE**    | `src/components/chat/PermissionModal.jsx`                          | Permission approval modal                        |
| **CREATE**    | `src/components/chat/TokenUsageBadge.jsx`                          | Token usage display                              |
| **CREATE**    | `src/components/chat/MCPStatusPanel.jsx`                           | MCP server status panel                          |
| **CREATE**    | `src/components/chat/SessionListModal.jsx`                         | Session history modal                            |
| **CREATE**    | `src/hooks/useSSEConnection.js`                                    | SSE connection hook with reconnection            |
| **CREATE**    | `src/hooks/useTracePersistence.js`                                 | Trace batching and persistence hook              |
| **CREATE**    | `telegram-bot/services/session-bridge.js`                          | Telegram↔Web session bridge                      |
| **CREATE**    | `telegram-bot/commands/session.js`                                 | Session management commands                      |
| **CREATE**    | `telegram-bot/commands/project.js`                                 | Project switching commands                       |
| **CREATE**    | `scripts/migrate-observability-v2.js`                              | Standalone migration runner                      |
| **MODIFY**    | `src/lib/db/localDb.js`                                            | Add new table schemas to `ensureRuntimeSchema`   |
| **MODIFY**    | `src/app/api/agenthub/headless/route.js`                           | Add directory, session reuse, trace persistence  |
| **MODIFY**    | `src/views/AgentHub.jsx`                                           | Integrate new components, SSE, trace persistence |
| **MODIFY**    | `src/views/SwarmControl.jsx`                                       | Replace polling with SSE, add trace panel        |
| **MODIFY**    | `src/components/chat/AgentTracePanel.jsx`                          | Add search, virtualization, API loading          |
| **MODIFY**    | `src/components/chat/AgentActivityFeed.jsx`                        | Switch from polling to SSE                       |
| **MODIFY**    | `telegram-bot/services/opencode.js`                                | Add persistent sessions, directory switching     |
| **MODIFY**    | `telegram-bot/commands/chat.js`                                    | Add OpenCode path with feature flag              |
| **MODIFY**    | `telegram-bot/commands/sessions.js`                                | Enhanced session list with switching             |
| **MODIFY**    | `telegram-bot/bot.js`                                              | Register new commands, callback_query handler    |
| **DEPRECATE** | `telegram-bot/services/providers/llm-bridge.js`                    | Mark as deprecated, keep for fallback            |

## Testing Strategy

### Unit Tests

| Test File                              | What It Tests                                               |
| -------------------------------------- | ----------------------------------------------------------- |
| `tests/unit/session-bridge.test.js`    | `findOrCreateSession`, `switchSession`, `syncMessage` logic |
| `tests/unit/opencode-enhanced.test.js` | `createSession`, `sendMessage` with mock OpenCode server    |
| `tests/unit/trace-persistence.test.js` | Batch insert, FTS5 triggers, error handling                 |
| `tests/unit/sse-filtering.test.js`     | Session-based event filtering in TransformStream            |
| `tests/unit/permission-flow.test.js`   | Approval/rejection flow in opencode.js                      |

**Example: Session Bridge Unit Test**

```javascript
describe('SessionBridge', () => {
  it('finds existing active session for a chat', async () => {
    const bridge = new SessionBridge(mockDb, mockOpencode);
    const result = await bridge.findOrCreateSession('-100123', 'proj-1', '/path');
    expect(result.isNew).toBe(false);
    expect(result.sessionId).toBe('existing-session-id');
  });

  it('creates new session when none exists', async () => {
    const bridge = new SessionBridge(mockDb, mockOpencode);
    const result = await bridge.findOrCreateSession('-99999', 'proj-1', '/path');
    expect(result.isNew).toBe(true);
    expect(result.sessionId).toBeDefined();
  });

  it('switches active session for a chat', async () => {
    const bridge = new SessionBridge(mockDb, mockOpencode);
    await bridge.switchSession('-100123', 'new-session-id');
    const sessions = await bridge.getSessions('-100123');
    const active = sessions.find((s) => s.active);
    expect(active.sessionId).toBe('new-session-id');
  });
});
```

### Integration Tests

| Test File                                  | What It Tests                                          |
| ------------------------------------------ | ------------------------------------------------------ |
| `tests/integration/sse-pipeline.test.js`   | End-to-end SSE: OpenCode → Next.js → trace persistence |
| `tests/integration/telegram-sync.test.js`  | `/api/telegram/sync` webhook processing                |
| `tests/integration/trace-search.test.js`   | FTS5 search with various queries                       |
| `tests/integration/permission-api.test.js` | Permission approval via API → OpenCode                 |

**Example: SSE Pipeline Integration Test**

```javascript
describe('SSE Pipeline', () => {
  it('persists trace parts from SSE stream to SQLite', async () => {
    // 1. Start mock OpenCode server that emits known SSE events
    // 2. POST to /api/agenthub/headless with persist_traces: true
    // 3. Wait for stream completion
    // 4. Query agent_traces for the session
    // 5. Verify all expected trace parts were saved
    const traces = db.prepare('SELECT * FROM agent_traces WHERE session_id = ?').all(sessionId);
    expect(traces.length).toBeGreaterThan(0);
    expect(traces.some((t) => t.part_type === 'tool')).toBe(true);
    expect(traces.some((t) => t.part_type === 'text')).toBe(true);
  });
});
```

### End-to-End Tests

| Scenario                       | Steps                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Telegram→Web Sync**          | 1. Send message in Telegram → 2. Verify message appears in web AgentHub → 3. Verify traces saved to SQLite → 4. Verify session visible in session list |
| **Cross-Channel Session**      | 1. Start session in Telegram → 2. Open same session in web → 3. Send message from web → 4. Verify response in Telegram                                 |
| **Permission Flow (Web)**      | 1. Trigger protected tool call → 2. Verify PermissionModal appears → 3. Click Approve → 4. Verify tool executes                                        |
| **Permission Flow (Telegram)** | 1. Trigger protected tool call → 2. Verify inline keyboard appears → 3. Tap Approve → 4. Verify tool executes and response sent                        |
| **Trace Search**               | 1. Execute session with multiple tools → 2. Search by tool name → 3. Verify filtered results → 4. Search by content → 5. Verify FTS5 results           |
| **Session Switch**             | 1. Create multiple sessions → 2. Switch via SessionListModal → 3. Verify correct traces load → 4. Verify token usage updates                           |
| **Reconnection**               | 1. Start SSE connection → 2. Kill OpenCode server → 3. Verify reconnection attempts → 4. Restart server → 5. Verify connection restored                |

### Manual Testing Checklist

- [ ] Telegram `/session` creates new session visible in web
- [ ] Telegram `/sessions` lists sessions with token usage
- [ ] Telegram `/project` switches directory correctly
- [ ] Web AgentHub shows real-time traces during execution
- [ ] Trace search returns correct results by tool, status, content
- [ ] Permission modal appears and works for approve/reject
- [ ] Token usage badge updates after each message
- [ ] Session list modal shows all sessions with correct data
- [ ] SwarmControl shows live SSE feed instead of polling
- [ ] Full output viewer shows complete tool output
- [ ] MCP status panel shows connected servers and tools
- [ ] Feature flag `TELEGRAM_USE_OPENCODE=false` falls back to LLM Bridge
- [ ] Page refresh preserves trace history (loaded from SQLite)
- [ ] SSE reconnection works after network interruption
