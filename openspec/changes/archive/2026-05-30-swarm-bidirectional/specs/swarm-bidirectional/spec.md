# Delta for Swarm Bidirectional Communication

## ADDED Requirements

### Requirement: Director Session Env Var for Workers

The system MUST inject `DEVHUB_DIRECTOR_SESSION` environment variable into every worker agent at launch. The value MUST be `devhub-swarm-${launchId}-director` where `${launchId}` is the swarm launch identifier. The variable MUST be set by `buildAgentEnvExports()` in `agentLaunchWrapper.js`.

#### Scenario: Worker receives director session env var

- GIVEN Director launches swarm with `launchId=abc123`
- WHEN a worker agent is spawned via `buildAgentEnvExports()`
- THEN the worker environment contains `DEVHUB_DIRECTOR_SESSION=devhub-swarm-abc123-director`

#### Scenario: Env var absent when director session unknown

- GIVEN the Director session name is not available at worker launch
- WHEN `buildAgentEnvExports()` is called without director context
- THEN `DEVHUB_DIRECTOR_SESSION` is NOT set in the worker environment
- AND no error is raised

---

### Requirement: Worker Tmux Status Injection Function

The system MUST provide a `buildDirectorTmuxInjection()` helper in `agentLaunchWrapper.js` that returns a bash function named `_devhub_tell_director`. The function MUST send a formatted status message to the Director's tmux session via `tmux send-keys -t $DEVHUB_DIRECTOR_SESSION "<status_message>"`. The function MUST be injected into every worker wrapper environment.

#### Scenario: Tmux injection function sends to director session

- GIVEN a worker has `_devhub_tell_director` available in its environment
- WHEN the worker calls `_devhub_tell_director "task_start" "coded file X"`
- THEN `tmux send-keys -t $DEVHUB_DIRECTOR_SESSION "✅ worker: task_start coded file X"` is executed locally

#### Scenario: Tmux injection fails gracefully when session unset

- GIVEN `DEVHUB_DIRECTOR_SESSION` is not set
- WHEN `_devhub_tell_director` is called
- THEN no tmux command is executed
- AND no error is raised to the worker

---

### Requirement: Event-Driven Status Injection

The system MUST support the following event types for status injection: `task_start`, `found_issue`, `task_complete`, `needs_help`, `blocked`. Each status message MUST be formatted as `✅ {role}: {event} {details}`. Workers MUST inject status on these events instead of relying on heartbeat polling.

#### Scenario: Worker injects task_start status

- GIVEN a worker begins processing a task
- WHEN the worker calls `_devhub_tell_director "task_start" "task-456"`
- THEN Director's tmux pane receives `✅ coder: task_start task-456` within 1 second

#### Scenario: Worker injects found_issue status

- GIVEN a worker detects a problem during execution
- WHEN the worker calls `_devhub_tell_director "found_issue" "Auth token expired"`
- THEN Director's tmux pane receives `⚠️ architect: found_issue Auth token expired`

#### Scenario: Worker injects task_complete status

- GIVEN a worker finishes a task successfully
- WHEN the worker calls `_devhub_tell_director "task_complete" "file:///src/utils/auth.ts"`
- THEN Director's tmux pane receives `✅ coder: task_complete file:///src/utils/auth.ts`

#### Scenario: Worker injects needs_help status

- GIVEN a worker requires assistance to proceed
- WHEN the worker calls `_devhub_tell_director "needs_help" "Unclear requirement for feature X"`
- THEN Director's tmux pane receives `🆘 architect: needs_help Unclear requirement for feature X`

#### Scenario: Worker injects blocked status

- GIVEN a worker is blocked by an external dependency
- WHEN the worker calls `_devhub_tell_director "blocked" "Waiting for PR #42"`
- THEN Director's tmux pane receives `🚫 worker: blocked Waiting for PR #42`

---

### Requirement: Heartbeat Interval Increase

The system MUST increase the heartbeat interval from 30 seconds to 120 seconds. Heartbeat MUST remain active for presence confirmation (agent is alive) but MUST NOT be used for status polling. Status updates MUST be delivered via tmux injection instead.

#### Scenario: Heartbeat sent at 120s intervals

- GIVEN a worker agent is running
- WHEN the worker sends heartbeat via `devhub heartbeat <agent-id>`
- THEN the interval between heartbeats is approximately 120 seconds

#### Scenario: Heartbeat confirms presence only

- GIVEN Director has not received a tmux status injection for 60 seconds
- WHEN Director checks worker presence
- THEN heartbeat is used to confirm the worker is still alive
- AND status is inferred from last tmux injection, not from heartbeat payload

---

## MODIFIED Requirements

### Requirement: Agent Event Types (Previously: EVT-4 Event Type Enum)

The system MUST add the following event types to the valid event type enum: `task_start`, `found_issue`, `task_complete`, `needs_help`, `blocked`. These events are emitted via tmux injection to Director's tmux pane. Existing events (`agent_booted`, `agent_shutdown`, `workspace_orphaned`, `quota_blocked`, `supervisor_action`, `mission_joined`, `mission_left`) remain via HTTP API.

(Previously: Event type enum covered only agent lifecycle events without task-scoped status)

#### Scenario: New event types accepted by agent

- GIVEN an agent sends an event emission request with `event_type='task_start'`
- WHEN the request is validated
- THEN the event type is accepted (tmux injection path, not HTTP API path)

---

### Requirement: Director Bootstrap Prompt (Previously: N/A — New requirement)

The Director bootstrap prompt MUST explain that workers inject status to Director's tmux pane via `_devhub_tell_director`. Director MUST expect formatted status messages: `✅ coder: task_start X`, `⚠️ architect: found_issue Y`, `🚫 worker: blocked Z`.

#### Scenario: Director recognizes tmux status messages

- GIVEN Director's prompt includes tmux injection explanation
- WHEN Director sees `✅ coder: task_start file:///src/routes/auth.ts` in its tmux pane
- THEN Director recognizes this as a worker status update
- AND logs it appropriately

#### Scenario: Director interprets needs_help messages

- GIVEN Director's prompt includes tmux injection explanation
- WHEN Director sees `🆘 architect: needs_help Feature schema unclear` in its tmux pane
- THEN Director interprets this as architect requesting help
- AND considers escalating or responding

---

## Summary Table

| Requirement        | Type     | Description                                     |
| ------------------ | -------- | ----------------------------------------------- |
| REQ-1              | ADDED    | Director session env var to workers             |
| REQ-2              | ADDED    | `_devhub_tell_director` tmux injection function |
| REQ-3              | ADDED    | Event-driven status injection (5 event types)   |
| REQ-4              | ADDED    | Heartbeat interval increase 30s→120s            |
| REQ-5              | ADDED    | Director prompt update for tmux status          |
| agent-events/EVT-4 | MODIFIED | Add task-scoped event types                     |
