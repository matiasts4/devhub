# Delta for Telegram Commands

## ADDED Requirements

### Requirement: /session Command

The system MUST implement `/session [title]` that creates a new AgentHub session via OpenCode headless API, linked to the user's chat ID and active project.

#### Scenario: Create session with or without title

- GIVEN a Telegram user sends `/session` or `/session Fix auth bug`
- WHEN processed
- THEN a new `agent_hub_sessions` row is created with the title (or auto-generated), OpenCode session spawned, and bot replies with session details

### Requirement: /sessions Command (Enhanced)

The system MUST enhance `/sesiones` to list AgentHub sessions with title, date, project, and status (most recent 10).

#### Scenario: List sessions or show empty state

- GIVEN a user sends `/sessions`
- WHEN processed
- THEN the bot shows formatted session list, or "No hay sesiones. Usá /session para crear una."

### Requirement: /project Command

The system MUST implement `/project [name]` that switches the active project context and updates OpenCode `cwd`. Without arguments, shows current project.

#### Scenario: Switch, show, or fail

- GIVEN `/project my-app` → active project set, cwd updated, confirmed
- GIVEN `/project nonexistent` → error with available projects listed
- GIVEN `/project` → current project name and path shown

### Requirement: /status Command

The system MUST implement `/status` showing session ID, agent model, current tool (if any), token usage, and duration.

#### Scenario: Status during execution, idle, or no session

- GIVEN agent executing → shows session ID, model, current tool, tokens, elapsed time
- GIVEN idle → shows last session summary
- GIVEN no session → "No hay sesión activa. Usá /session para empezar."

### Requirement: Command Permission Model

All commands MUST work for any bot user without additional authentication.
