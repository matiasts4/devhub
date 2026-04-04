# Delta for Session Bridge

## ADDED Requirements

### Requirement: Telegram Chat ID on AgentHub Sessions

The `agent_hub_sessions` table MUST include a `telegram_chat_id` column (TEXT, nullable, indexed) to link web sessions with Telegram conversations.

#### Scenario: Session created from Telegram

- GIVEN a Telegram user sends `/session` command
- WHEN the session is created in `agent_hub_sessions`
- THEN the row includes `telegram_chat_id` set to the user's chat ID

#### Scenario: Session created from Web

- GIVEN a user creates a new session via AgentHub UI
- WHEN the session is created
- THEN `telegram_chat_id` is NULL

### Requirement: Session Bridge API

The system MUST provide POST `/api/agenthub/sessions/bridge` accepting `{ telegram_chat_id, session_id, title, project_id }`. Creates new or updates existing `agent_hub_sessions` to link the Telegram chat ID.

#### Scenario: Bridge creates or links session

- GIVEN no session exists for `telegram_chat_id=12345`
- WHEN POST is called with the payload
- THEN a new row is created; if `session_id` is provided, the existing row is updated instead

### Requirement: Session Continuity

The system MUST maintain a single OpenCode session per conversation. Switching platforms MUST NOT create a new session. Active sessions are reused; completed sessions trigger new ones.

#### Scenario: Cross-platform continuity

- GIVEN an active session started from Telegram
- WHEN the user opens AgentHub web
- THEN the web UI connects to the existing SSE stream

#### Scenario: Session lookup

- GIVEN a Telegram chat sends a message
- WHEN the system looks up the session
- THEN the active session is reused, or a new one is created if the last is completed

### Requirement: Session Status Synchronization

Session status changes (active, busy, completed, error) MUST be reflected in `agent_hub_sessions.updated_at` and visible to both Telegram and web consumers.

#### Scenario: Status updated on agent completion

- GIVEN a session is in `busy` state
- WHEN the agent completes execution
- THEN `agent_hub_sessions` is updated with `status='completed'` and `updated_at` set to current time
