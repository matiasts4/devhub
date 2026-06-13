# Spec: session-restore

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

## MODIFIED Requirements

### Requirement: SESS-1 — Session Classification Taxonomy

The system MUST classify every saved terminal session into exactly one of three mutually exclusive types stored in the `sessionType` field: `pty-durable` when `ptyPid` is present, `opencode-durable` when `opencodeSessionId` is present, and `shell-ephemeral` when neither field is present.

(Previously: single restore mutex, no per-session restorePolicy)

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

## MODIFIED Requirements

### Requirement: SESS-2 — Shell-Ephemeral Restore Without PTY

The system MUST respawn `shell-ephemeral` sessions using saved `cwd`, `shell`, and `title` metadata without requiring a PTY PID. The `ttyServer` MUST call `createSession()` with the saved directory and shell path.

(Previously: no restorePolicy field, no dual mutex)

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

## ADDED Requirements

### Requirement: SESS-4 — Dual Restore Mutex

The system MUST use two independent localStorage mutex keys to prevent concurrent restore interference between session types: `devhub_opencode_restore_in_progress` for OpenCode sessions and `devhub_generic_restore_in_progress` for generic PTY/shell sessions. The two mutexes operate independently and MUST NOT block one another.

#### Scenario: SESS-S8 — OpenCode restore does not block generic restore

- GIVEN `devhub_opencode_restore_in_progress` is set by React
- WHEN the backend initiates generic terminal restore
- THEN the backend restore MUST proceed without waiting
- AND the generic restore uses `devhub_generic_restore_in_progress`

#### Scenario: SESS-S9 — Generic restore does not block OpenCode restore

- GIVEN `devhub_generic_restore_in_progress` is set by backend
- WHEN React evaluates OpenCode restore dispatch
- THEN the OpenCode restore MUST proceed without waiting
- AND the OpenCode restore uses `devhub_opencode_restore_in_progress`

### Requirement: SESS-5 — Per-Session restorePolicy Field

Each saved session in the session store schema v3 MUST contain a `restorePolicy` field with value `auto | manual | off`. Sessions loaded without this field (v2 migration) MUST default to `restorePolicy: 'auto'`.

#### Scenario: SESS-S10 — v2 session migrates to restorePolicy auto

- GIVEN a saved session with schemaVersion 2 and no `restorePolicy` field
- WHEN `loadSessions()` is called at startup
- THEN `restorePolicy` is set to `'auto'`
- AND `schemaVersion` is updated to 3

#### Scenario: SESS-S11 — Auto policy resumes session normally

- GIVEN a session with `restorePolicy: 'auto'`
- WHEN `buildStartupRestorePlan()` evaluates the session
- THEN the normal restore action for its type is emitted
- AND `RESUME_OPENCODE_SESSION` or `RESTORE_SHELL_EMERGENT` fires as appropriate

#### Scenario: SESS-S12 — Manual policy suppresses auto-restore

- GIVEN a session with `restorePolicy: 'manual'`
- WHEN `buildStartupRestorePlan()` evaluates the session
- THEN a `TERMINATED` action is emitted instead of a restore action
- AND the panel is marked suspended without firing a respawn

#### Scenario: SESS-S13 — Off policy skips session entirely

- GIVEN a session with `restorePolicy: 'off'`
- WHEN `buildStartupRestorePlan()` evaluates the session
- THEN no restore action is emitted
- AND the session is not considered for reconnection or respawn

### Requirement: SESS-6 — OpenCode vs Generic Type Precedence

OpenCode sessions (`opencode-durable`) and generic sessions (`pty-durable`, `shell-ephemeral`) have no restore policy conflict because they operate on disjoint session types. Each session's own `restorePolicy` field independently governs its fate regardless of other sessions' policies. The workspace-level preference read from `restorePreferences.js` sets the default `restorePolicy` for new sessions but does not override an existing session's stored policy.

#### Scenario: SESS-S14 — Session-level policy overrides workspace default

- GIVEN workspace default set to `manual` for OpenCode in `restorePreferences`
- AND an existing saved session with `restorePolicy: 'auto'`
- WHEN the session is evaluated at startup
- THEN the session-level `restorePolicy: 'auto'` takes precedence
- AND the session is restored (not suspended)

#### Scenario: SESS-S15 — Mixed session types restore independently

- GIVEN an `opencode-durable` session with `restorePolicy: 'manual'`
- AND a `shell-ephemeral` session with `restorePolicy: 'auto'`
- WHEN startup restore plan is built
- THEN the OpenCode session emits `TERMINATED`
- AND the shell-ephemeral session emits `RESTORE_SHELL_EMERGENT`
- AND no conflict or interference occurs between them
