# Delta for terminal-durable-opencode

## ADDED Requirements

### Requirement: opencode durable session registry

The sidecar SHALL persist opencode sessions that have a known `opencodeSessionId` and mark them as `opencode-durable` in the session store.

#### Scenario: opencode session is detected

- GIVEN a v2 panel launches `opencode --session <id>`
- WHEN the sidecar detects the session id
- THEN it MUST store `opencodeSessionId` in the session record
- AND MUST classify the session as `opencode-durable`

### Requirement: App restart relaunches opencode sessions

On application startup, the sidecar restore process SHALL skip backend PTY respawn for `opencode-durable` sessions; the frontend MUST relaunch `opencode --session <id>` for each such panel.

#### Scenario: App restarts with an opencode-durable session

- GIVEN a saved `opencode-durable` session exists
- WHEN the app restarts
- THEN `restoreSessions` in `src/lib/terminal/ttyServer.js` MUST skip the backend restore
- AND the frontend MUST open a panel with the saved `initialCommand` containing `opencode --session <id>`

#### Scenario: opencode process is already running

- GIVEN the opencode process for the saved session id is still alive after restart
- WHEN the frontend relaunches it
- THEN opencode MUST attach to the existing session
- AND MUST NOT create a duplicate session

## MODIFIED Requirements

### Requirement: Session classification

`classifySession` in `src/lib/terminal/sessionStore.js` SHALL recognize `opencode-durable` based on the presence of a durable opencode session id.
(Previously: classification relied only on `ptyPid` or generic `opencodeSessionId` without a durable flag.)

#### Scenario: Session has opencodeSessionId

- GIVEN a session record has `opencodeSessionId`
- WHEN `classifySession` is called
- THEN it MUST return `opencode-durable`
- AND the session MUST be excluded from legacy PTY restore

### Requirement: Session store schema

Persisted sessions SHALL include v2 rehydration metadata when applicable.
(Previously: sessions stored only basic identity, cwd, shell, and ptyPid.)

#### Scenario: v2 panel session is persisted

- GIVEN a v2 session is saved to disk
- THEN it SHOULD include `opencodeSessionId`, `sessionType`, and any durable-restore flags required by the frontend
