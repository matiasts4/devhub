# Delta for pty-identity-binding

## MODIFIED Requirements

### Requirement: PTY-4 — Restart Recovery from Database

The system MUST preserve PTY columns across application restarts. On restart, if a workspace has non-NULL PTY values and the PTY session is still active, the workspace MUST reconnect to the existing session. For `shell-ephemeral` sessions where `ptyPid` is null but `cwd` and `shell` are available, the system MUST respawn the session using the saved metadata instead of requiring a PTY binding.
(Previously: Reconnect to existing PTY session if still active; clear stale PTY columns)

#### Scenario: PTY-S4 — Restart recovers PTY binding

- GIVEN an agent workspace with populated `pane_id`, `terminal_id`, and `opencode_pid`
- WHEN the application restarts and reloads the workspace from the database
- AND the PTY session identified by those values is still active
- THEN the workspace reconnects to the existing PTY session
- AND the columns remain populated

#### Scenario: PTY-S5 — Stale PTY values on restart

- GIVEN an agent workspace with populated PTY columns
- WHEN the application restarts and the PTY process is no longer running
- THEN the system detects the stale PTY (process not found via `process.kill(pid, 0)`)
- AND clears the columns to NULL

### Requirement: PTY-6 — Shell-Ephemeral Resume Without PTY Binding

The system MUST handle `shell-ephemeral` sessions where `ptyPid` is null by restoring via cwd/shell metadata. The `process.kill(pid, 0)` check MUST NOT be applied to sessions with `sessionType=shell-ephemeral`.

#### Scenario: PTY-S6 — Ephemeral session respawns without PTY PID

- GIVEN a session with `sessionType=shell-ephemeral`, saved `cwd=/home/user`, and saved `shell=/bin/bash`
- WHEN the application restarts
- THEN `restoreSessions()` MUST respawn the shell at the saved cwd
- AND the `ptyPid` gate MUST be bypassed for this session type

#### Scenario: PTY-S7 — Ephemeral session ignores PID reuse check

- GIVEN a `shell-ephemeral` session
- WHEN restore is attempted
- THEN the system MUST NOT call `process.kill(pid, 0)` on a null `ptyPid`
- AND the respawn relies solely on saved metadata
