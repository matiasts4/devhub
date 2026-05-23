# CLI Agents Command Specification

## Purpose

Defines the `devhub agents` command for displaying live swarm agent state from SQLite. Operators get a quick terminal view of registered agents, their status, current task, workspace branch, and heartbeat freshness without opening the web UI.

## Requirements

### Requirement: Agent Registry Query

The command MUST query `agent_registry` and LEFT JOIN `agent_workspaces` (latest per agent by `updated_at DESC LIMIT 1`) to produce a summary row per agent.

#### Scenario: All agents displayed

- GIVEN the SQLite database has registered agents
- WHEN `devhub agents` is executed
- THEN one row per agent is shown with agent_id, status, current_task_id, branch_name, modelo_llm, and last_heartbeat

#### Scenario: Agent with no workspace

- GIVEN an agent exists in `agent_registry` with no row in `agent_workspaces`
- WHEN `devhub agents` is executed
- THEN the agent row shows empty or "—" for BRANCH

#### Scenario: Multiple workspaces per agent

- GIVEN an agent has multiple rows in `agent_workspaces`
- WHEN `devhub agents` is executed
- THEN only the most recent workspace (by `updated_at DESC LIMIT 1`) is shown

### Requirement: TTY Table Output

When stdout is a TTY, the command MUST render a formatted table with columns: AGENT, STATUS, TASK, BRANCH, MODEL, HEARTBEAT.

#### Scenario: Table renders in TTY mode

- GIVEN `process.stdout.isTTY` is `true`
- WHEN `devhub agents` is executed with registered agents
- THEN output is a formatted table with the six column headers

#### Scenario: Table includes all agent data

- GIVEN two agents are registered with different statuses
- WHEN `devhub agents` is executed in TTY mode
- THEN each agent appears as one row with correct values in all columns

### Requirement: Non-TTY Machine-Readable Output

When stdout is not a TTY, the command MUST output pipe-delimited rows with no headers and no ANSI escape sequences.

#### Scenario: Piped output is plain text

- GIVEN stdout is piped (e.g., `devhub agents | cat`)
- WHEN the command executes
- THEN output contains no ANSI escape sequences

#### Scenario: Pipe-delimited format

- GIVEN two agents are registered
- WHEN `devhub agents | cat` is executed
- THEN each line is `agent_id|status|task|branch|model|heartbeat` with no header row

### Requirement: Heartbeat Age Display

The HEARTBEAT column MUST show relative time (e.g., "2m ago", "3h ago") or "stale" if the heartbeat exceeds a threshold.

#### Scenario: Recent heartbeat

- GIVEN an agent's last_heartbeat is 2 minutes ago
- WHEN `devhub agents` is executed
- THEN HEARTBEAT shows "2m ago"

#### Scenario: Stale heartbeat

- GIVEN an agent's last_heartbeat is older than 5 minutes
- WHEN `devhub agents` is executed
- THEN HEARTBEAT shows "stale"

#### Scenario: Missing heartbeat

- GIVEN an agent has no last_heartbeat value
- WHEN `devhub agents` is executed
- THEN HEARTBEAT shows "unknown"

### Requirement: Status Filter Flag

The `--status <filter>` flag MUST filter results to agents whose status exactly matches the provided value.

#### Scenario: Filter by exact status

- GIVEN agents with statuses "idle", "working", and "error"
- WHEN `devhub agents --status idle` is executed
- THEN only agents with status "idle" are shown

#### Scenario: No matching agents

- GIVEN no agents have status "running"
- WHEN `devhub agents --status running` is executed
- THEN the empty state message is shown and exit code is 0

### Requirement: Active Shorthand Flag

The `--active` flag MUST filter to agents with statuses: active, working, running, thinking.

#### Scenario: Active shorthand shows active agents

- GIVEN agents with statuses "working", "idle", and "thinking"
- WHEN `devhub agents --active` is executed
- THEN only "working" and "thinking" agents are shown

#### Scenario: Active and status flags are mutually exclusive

- GIVEN both `--active` and `--status` are provided
- WHEN `devhub agents --active --status idle` is executed
- THEN the command exits with code 2 and an error message about conflicting flags

### Requirement: Empty State Handling

When no agents match the query, the command MUST display "No agents registered" and exit with code 0.

#### Scenario: Empty registry

- GIVEN the agent_registry table has no rows
- WHEN `devhub agents` is executed
- THEN stdout shows "No agents registered"
- AND the process exits with code 0

#### Scenario: Filtered result is empty

- GIVEN agents exist but none match `--status nonexistent`
- WHEN `devhub agents --status nonexistent` is executed
- THEN stdout shows "No agents registered"
- AND the process exits with code 0

### Requirement: Unit Tests

The command MUST include unit tests covering flags, TTY/non-TTY output, empty data, and the database query logic. Tests MUST run via Jest.

#### Scenario: All agents command tests pass

- GIVEN `commands/agents.test.js` exists
- WHEN `cd devhub-cli && npm test` is executed
- THEN all tests pass with zero failures
