# Delta for session-restore

## ADDED Requirements

### Requirement: SESS-1 — Session Classification Taxonomy

The system MUST classify every saved terminal session into exactly one of three mutually exclusive types stored in the `sessionType` field: `pty-durable` when `ptyPid` is present, `opencode-durable` when `opencodeSessionId` is present, and `shell-ephemeral` when neither field is present.

#### Scenario: SESS-S1 — Classify as pty-durable

- GIVEN a session with an active PTY PID
- WHEN the session is persisted to `sessionStore.js`
- THEN `sessionType` is set to `pty-durable`
- AND `ptyPid` is recorded

#### Scenario: SESS-S2 — Classify as shell-ephemeral

- GIVEN a raw shell session with no PTY PID and no `opencodeSessionId`
- WHEN the session is persisted
- THEN `sessionType` is set to `shell-ephemeral`
- AND `initialCommand` and derived `shell` path are saved

#### Scenario: SESS-S3 — Legacy session migration on load

- GIVEN a saved session with no `sessionType` field (schemaVersion < 2)
- WHEN the session is loaded at startup
- THEN the system MUST reclassify it using the same taxonomy rules
- AND set `sessionType` accordingly
- AND update `schemaVersion` to 2

### Requirement: SESS-2 — Shell-Ephemeral Restore Without PTY

The system MUST respawn `shell-ephemeral` sessions using saved `cwd`, `shell`, and `title` metadata without requiring a PTY PID. The `ttyServer` MUST call `createSession()` with the saved directory and shell path.

#### Scenario: SESS-S4 — Ephemeral session respawns with correct cwd

- GIVEN a `shell-ephemeral` session with saved `cwd=/home/user/project` and `shell=/bin/zsh`
- WHEN `restoreSessions()` is invoked at startup
- THEN a new shell session is created at the saved cwd
- AND the panel label matches the saved `title`

#### Scenario: SESS-S5 — Stale ephemeral session evicted by TTL

- GIVEN a `shell-ephemeral` session with `lastSeenAt` older than 7 days
- WHEN the session store is loaded
- THEN the session is evicted before restore proceeds
- AND no respawn is attempted

### Requirement: SESS-3 — Restore Sequencing Mutex

The system MUST prevent concurrent restore operations between the backend TTY server and the React workspace manager. A `devhub_restore_in_progress` mutex flag in localStorage MUST block `devhub:relaunch-panel` dispatch until the TTY server signals completion.

#### Scenario: SESS-S6 — React relaunch blocked during backend restore

- GIVEN the TTY server is actively restoring sessions
- WHEN `TerminalWorkspacesManager` evaluates a relaunch action
- THEN the relaunch MUST NOT fire while `devhub_restore_in_progress` is set
- AND the action is queued until the flag is cleared

#### Scenario: SESS-S7 — Backend restore clears mutex on completion

- GIVEN `devhub_restore_in_progress` is set
- WHEN the TTY server completes all restore operations
- THEN the flag MUST be cleared
- AND React is unblocked to issue pending relaunch actions
