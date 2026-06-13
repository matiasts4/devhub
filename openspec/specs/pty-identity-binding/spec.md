# spec: pty-identity-binding
## type: new

PTY session identity columns on `agent_workspaces` for associating terminal sessions with agent workspaces.

### PTY-1: PTY Identity Columns

**Priority**: P0 | **Status**: approved

The system SHALL add three nullable columns to `agent_workspaces`: `pane_id TEXT`, `terminal_id TEXT`, and `opencode_pid INTEGER`. All columns SHALL default to NULL. Schema migration SHALL use `ALTER TABLE ADD COLUMN` (SQLite-compatible).

#### Scenario: PTY-S1 — Columns added as nullable
- **Given** an existing `agent_workspaces` table
- **When** the migration runs
- **Then** `pane_id TEXT`, `terminal_id TEXT`, and `opencode_pid INTEGER` columns exist
- **AND** all existing rows have NULL values for these columns
- **AND** the existing CHECK constraint does not reject NULL values

### PTY-2: Populate Columns During Session Activation

**Priority**: P0 | **Status**: approved

The system SHALL populate `pane_id`, `terminal_id`, and `opencode_pid` when a terminal session is activated for a workspace. The `ttyServer` session-activate event and `agentLaunchWrapper` post-spawn report SHALL both contribute to setting these values.

#### Scenario: PTY-S2 — Session activation sets columns
- **Given** an agent workspace with NULL PTY columns
- **When** a terminal session is activated for that workspace
- **Then** `pane_id`, `terminal_id`, and `opencode_pid` are updated with the session's values
- **AND** the workspace row reflects the active PTY binding

### PTY-3: Clear Columns on Session Termination

**Priority**: P0 | **Status**: approved

The system SHALL set `pane_id`, `terminal_id`, and `opencode_pid` to NULL when the terminal session for a workspace terminates.

#### Scenario: PTY-S3 — Session termination clears columns
- **Given** an agent workspace with populated PTY columns
- **When** the terminal session terminates
- **Then** `pane_id`, `terminal_id`, and `opencode_pid` are set to NULL
- **AND** the workspace row no longer references a PTY session

### PTY-4: Restart Recovery from Database

**Priority**: P1 | **Status**: approved

The system SHALL preserve PTY columns across application restarts. On restart, if a workspace has non-NULL PTY values and the PTY session is still active, the workspace SHALL reconnect to the existing session.

#### Scenario: PTY-S4 — Restart recovers PTY binding
- **Given** an agent workspace with populated `pane_id`, `terminal_id`, and `opencode_pid`
- **When** the application restarts and reloads the workspace from the database
- **AND** the PTY session identified by those values is still active
- **Then** the workspace reconnects to the existing PTY session
- **AND** the columns remain populated

#### Scenario: PTY-S5 — Stale PTY values on restart
- **Given** an agent workspace with populated PTY columns
- **When** the application restarts and the PTY process is no longer running
- **Then** the system detects the stale PTY (process not found via `process.kill(pid, 0)`)
- **AND** clears the columns to NULL

### PTY-6: Shell-Ephemeral Resume Without PTY Binding

**Priority**: P1 | **Status**: approved

The system MUST handle `shell-ephemeral` sessions where `ptyPid` is null by restoring via cwd/shell metadata. The `process.kill(pid, 0)` check MUST NOT be applied to sessions with `sessionType=shell-ephemeral`.

#### Scenario: PTY-S6 — Ephemeral session respawns without PTY PID
- **Given** a session with `sessionType=shell-ephemeral`, saved `cwd=/home/user`, and saved `shell=/bin/bash`
- **When** the application restarts
- **Then** `restoreSessions()` MUST respawn the shell at the saved cwd
- **AND** the `ptyPid` gate MUST be bypassed for this session type

#### Scenario: PTY-S7 — Ephemeral session ignores PID reuse check
- **Given** a `shell-ephemeral` session
- **WHEN** restore is attempted
- **Then** the system MUST NOT call `process.kill(pid, 0)` on a null `ptyPid`
- **AND** the respawn relies solely on saved metadata