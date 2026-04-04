# Delta for Swarm Observability

## ADDED Requirements

### Requirement: SSE Aggregator for All Active Sessions

The system MUST provide `/api/agenthub/stream` SSE endpoint that aggregates live events from all active OpenCode sessions. Each event MUST include: `session_id`, `event_type`, `agent_name`, `tool_name` (if applicable), `content`, `timestamp`, and `status`.

#### Scenario: Stream delivers events from multiple sessions

- GIVEN two OpenCode sessions are executing concurrently
- WHEN a client connects to `/api/agenthub/stream`
- THEN the client receives SSE events from both sessions, each tagged with the correct `session_id`

#### Scenario: Stream filters by session

- GIVEN multiple sessions are active
- WHEN a client connects to `/api/agenthub/stream?session_id=sess-abc`
- THEN only events for `sess-abc` are delivered

### Requirement: SwarmControl Real-Time Execution Cards

SwarmControl MUST display live execution cards for each active agent session, showing: agent name, current tool (with icon), reasoning snippet (truncated to 120 chars), status badge, and elapsed time. Cards MUST update in real-time via SSE, not polling.

#### Scenario: Card appears when agent starts

- GIVEN an agent session transitions to `busy` state
- WHEN the SSE event arrives
- THEN a new execution card appears in SwarmControl with agent name, status "Ejecutando", and elapsed time starting at 0

#### Scenario: Card updates on tool execution

- GIVEN an execution card is visible
- WHEN the agent starts executing a tool
- THEN the card updates to show the tool name, icon, and current tool status

#### Scenario: Card completes on agent idle

- GIVEN an execution card shows an active agent
- WHEN the agent returns to `idle` state
- THEN the card transitions to "Completado" status with total duration

### Requirement: SSE Auto-Reconnection

The SwarmControl SSE client MUST automatically reconnect within 5 seconds if the connection drops. On reconnection, it MUST request events from the last known timestamp to avoid missing events.

#### Scenario: Reconnect after drop

- GIVEN the SSE connection drops mid-execution
- WHEN 1-3 seconds pass
- THEN the client automatically reconnects and resumes receiving events

#### Scenario: Reconnect after server restart

- GIVEN the OpenCode server restarts
- WHEN the server is healthy again
- THEN SwarmControl reconnects within 5 seconds and shows updated session states

### Requirement: Expandable Trace Panel in SwarmControl

Clicking on an execution card in SwarmControl MUST expand an inline trace panel (reusing AgentTracePanel component) showing all trace parts for that session: tool calls with input/output, reasoning blocks, text output, and subtask entries.

#### Scenario: Expand trace panel

- GIVEN an execution card is visible in SwarmControl
- WHEN the user clicks on the card
- THEN an expandable trace panel appears below the card showing all trace parts in chronological order

#### Scenario: Trace panel loads persisted traces

- GIVEN a session completed earlier and its traces are stored in SQLite
- WHEN the user clicks on the completed session's card
- THEN the trace panel loads and displays all persisted traces from the database

### Requirement: Remove Polling Fallback

SwarmControl MUST NOT use the existing 5-second polling mechanism for agent status. All status updates MUST come from the SSE stream. Polling is only used as a fallback if SSE connection fails after 3 reconnection attempts.

#### Scenario: SSE is primary transport

- GIVEN SwarmControl is loaded
- WHEN the component mounts
- THEN it establishes an SSE connection and does NOT start polling

#### Scenario: Polling fallback after failures

- GIVEN SSE connection fails 3 consecutive times
- WHEN the 3rd reconnection attempt fails
- THEN SwarmControl falls back to 5-second polling and shows a warning banner

### Requirement: Removed Agent Registry Dependency

SwarmControl MUST NOT depend on the `agent_registry` table or `getAgentRegistryLiveSnapshot()` for displaying active agents. Agent status MUST come from OpenCode session state via SSE.

#### Scenario: SwarmControl works without agent_registry

- GIVEN the `agent_registry` table is empty
- WHEN SwarmControl loads
- THEN it displays active sessions from OpenCode SSE without errors
