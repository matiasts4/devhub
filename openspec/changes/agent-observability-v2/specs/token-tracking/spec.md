# Delta for Token Tracking

## ADDED Requirements

### Requirement: Session Usage Table

The system MUST create an `agent_session_usage` table with columns: `id` (UUID, PK), `session_id` (FK to agent_hub_sessions, non-null), `prompt_tokens` (INTEGER), `completion_tokens` (INTEGER), `total_tokens` (INTEGER), `model` (TEXT), `context_window_size` (INTEGER, nullable), `context_utilization_pct` (REAL, nullable), `created_at` (auto).

#### Scenario: Usage record created on session completion

- GIVEN an OpenCode session completes execution
- WHEN the session's usage data is available from the SSE events
- THEN a row is inserted into `agent_session_usage` with token counts and model name

#### Scenario: Usage record updated incrementally

- GIVEN a session is still executing and accumulating tokens
- WHEN new usage data arrives via SSE
- THEN the existing `agent_session_usage` row is updated with cumulative token counts

### Requirement: Token Display in AgentHub

AgentHub MUST display token usage per session showing: input tokens, output tokens, total tokens, and model name. This information MUST be visible in the session header and in the trace panel.

#### Scenario: Token usage visible in session header

- GIVEN a session has completed with 5000 total tokens
- WHEN the session is viewed in AgentHub
- THEN the header shows "5,000 tokens · 1,200 input · 3,800 output · claude-sonnet-4-20250514"

### Requirement: Context Window Utilization

The system MUST calculate and display context window utilization as a percentage: `(total_tokens / context_window_size) * 100`. The percentage MUST be shown with a visual indicator (green < 50%, yellow 50-80%, red > 80%).

#### Scenario: Low context utilization

- GIVEN a session uses 2,000 tokens with a 200,000 token context window
- WHEN the usage is displayed
- THEN it shows "1.0%" with a green indicator

#### Scenario: High context utilization warning

- GIVEN a session uses 170,000 tokens with a 200,000 token context window
- WHEN the usage is displayed
- THEN it shows "85.0%" with a red indicator and a warning message

### Requirement: Usage API Endpoint

The system MUST provide GET `/api/agenthub/sessions/:id/usage` endpoint returning the current token usage for a session.

#### Scenario: Get usage for active session

- GIVEN a session is currently executing
- WHEN GET `/api/agenthub/sessions/sess-abc/usage` is called
- THEN the response includes current cumulative token counts and model

#### Scenario: Get usage for completed session

- GIVEN a session has completed
- WHEN GET `/api/agenthub/sessions/sess-abc/usage` is called
- THEN the response includes final token counts, model, and context utilization percentage
