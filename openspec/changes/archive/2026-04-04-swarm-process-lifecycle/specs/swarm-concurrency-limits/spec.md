# Swarm Concurrency Limits Specification

## Purpose

Define the behavior for configurable global concurrency limits on swarm agents, including persistent storage, API-level enforcement, settings UI, and visual feedback. Users MUST be able to control how many agents run simultaneously (default 5, range 1-20) to prevent resource exhaustion.

## Requirements

### REQ-1: Persistent Concurrency Configuration

The system MUST store the maximum concurrent swarm limit in the SQLite `swarm_config` table as a key-value pair with key `max_concurrent_swarms`. The default value MUST be 5. Valid values are integers from 1 to 20, or 0 to indicate unlimited.

#### Scenario: Default value on first initialization

- **Given** the `swarm_config` table has no entry for `max_concurrent_swarms`
- **When** the system reads the concurrency limit
- **Then** the returned value is 5 (default)

#### Scenario: Valid value is persisted

- **Given** the system receives a valid limit value of 10
- **When** the value is saved to `swarm_config`
- **Then** subsequent reads return 10
- **AND** the value persists across Next.js restarts

#### Scenario: Invalid value is rejected

- **Given** the system receives a limit value of 25
- **When** a save is attempted
- **Then** the operation is rejected with a validation error
- **AND** the previous value remains unchanged

### REQ-2: Concurrency Enforcement at API Level

The system MUST check the active agent count against the configured limit before spawning a new swarm agent in the headless API route. When the limit is reached, the system MUST respond with HTTP 429 (Too Many Requests) and include the current active count, the limit, and the queue position.

#### Scenario: Spawn request within limit

- **Given** the limit is 5 and 3 agents are currently active
- **When** a new agent spawn request arrives at the headless route
- **Then** the request is accepted
- **AND** the agent is spawned normally

#### Scenario: Spawn request at limit

- **Given** the limit is 5 and 5 agents are currently active
- **When** a new agent spawn request arrives at the headless route
- **Then** the response is HTTP 429
- **AND** the body includes `active: 5`, `limit: 5`, `queued: true`, and `queuePosition: 1`

#### Scenario: Unlimited mode (limit = 0)

- **Given** the limit is set to 0 (unlimited)
- **When** a new agent spawn request arrives
- **Then** the request is always accepted regardless of active count

### REQ-3: Settings UI for Concurrency Limit

The system MUST provide a settings section in `Ajustes.jsx` that allows the user to view and modify the maximum concurrent swarm limit. The UI MUST include a number input constrained to the range 1-20, with the current value pre-filled from the database.

#### Scenario: User changes limit via settings

- **Given** the current limit is 5 displayed in Ajustes.jsx
- **When** the user changes the input to 3 and saves
- **Then** the value is persisted to `swarm_config`
- **AND** a success confirmation is shown
- **AND** subsequent API requests enforce the new limit of 3

#### Scenario: User enters out-of-range value

- **Given** the settings input is focused
- **When** the user types 0 or 21
- **Then** the input rejects the value or shows a validation error
- **AND** the save button remains disabled

#### Scenario: Settings load on page open

- **Given** the `swarm_config` table contains `max_concurrent_swarms: 8`
- **When** the user opens Ajustes.jsx
- **Then** the number input displays 8

### REQ-4: Visual Feedback in SwarmControl

The system MUST display the current concurrency status in `SwarmControl.jsx` showing the active agent count relative to the configured limit (e.g., "3/5 agents active"). When the limit is reached, a queue indicator MUST be shown for pending agents.

#### Scenario: Normal operation below limit

- **Given** 3 agents are active out of a limit of 5
- **When** SwarmControl renders
- **Then** a status badge displays "3/5 agents active"

#### Scenario: All slots occupied

- **Given** 5 agents are active out of a limit of 5
- **When** SwarmControl renders
- **Then** the badge displays "5/5 agents active"
- **AND** a queue indicator is visible showing pending agents

#### Scenario: No agents running

- **Given** 0 agents are active
- **When** SwarmControl renders
- **Then** the badge displays "0/5 agents active"

### REQ-5: Settings API Endpoint

The system MUST expose a REST endpoint at `/api/settings/swarm` supporting GET (read current config) and PUT (update config). The PUT endpoint MUST validate the input and return appropriate HTTP status codes: 200 on success, 400 on validation error.

#### Scenario: GET returns current configuration

- **Given** `swarm_config` contains `max_concurrent_swarms: 7`
- **When** a GET request is made to `/api/settings/swarm`
- **Then** the response is 200 with body `{ maxConcurrentSwarms: 7 }`

#### Scenario: PUT updates with valid value

- **Given** the current limit is 5
- **When** a PUT request is made with `{ maxConcurrentSwarms: 10 }`
- **Then** the response is 200
- **AND** the database is updated
- **AND** the response body confirms the new value

#### Scenario: PUT rejects invalid value

- **Given** the current limit is 5
- **When** a PUT request is made with `{ maxConcurrentSwarms: 30 }`
- **Then** the response is 400
- **AND** the body includes a validation error message
- **AND** the database value remains 5

### REQ-6: Active Agent Tracking

The system MUST maintain an accurate count of currently active swarm agents. An agent is considered active from the moment it is spawned until its session completes, fails, or is manually terminated. The count MUST be queryable in real-time by the concurrency enforcement logic.

#### Scenario: Agent spawn increments count

- **Given** 2 agents are currently active
- **When** a new agent is successfully spawned
- **Then** the active count becomes 3

#### Scenario: Agent completion decrements count

- **Given** 3 agents are currently active
- **When** one agent session completes
- **Then** the active count becomes 2

#### Scenario: Agent failure decrements count

- **Given** 3 agents are currently active
- **When** one agent session crashes or fails
- **Then** the active count becomes 2
- **AND** the failure is logged

### REQ-7: Limit Change During Active Sessions

The system MUST handle changes to the concurrency limit while agents are actively running. If the new limit is lower than the current active count, no existing agents MUST be terminated — the new limit applies only to new spawn requests.

#### Scenario: Limit reduced below active count

- **Given** 5 agents are active and the limit is changed to 3
- **When** the change is saved
- **Then** all 5 existing agents continue running
- **AND** new spawn requests are rejected with 429 until active count drops below 3

#### Scenario: Limit increased

- **Given** 5 agents are active and the limit is changed from 5 to 10
- **When** the change is saved
- **Then** up to 5 additional agents can be spawned immediately
