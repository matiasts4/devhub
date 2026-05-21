# Agent Session Reopen Specification

## Purpose

Define durable agent-session reopen after app relaunch or machine reboot. MVP MUST cover OpenCode-managed session resume, not generic shell resurrection, PTY replay, or TUI framebuffer recovery.

## Non-Goals

- Generic shell, PTY, or scrollback restore after reboot
- Treating plain `hermes` relaunch in the same cwd as durable resume
- Promising Hermes, Codex, or Cloud durable restore before CLI list-and-resume support is verified

## Requirements

### Requirement: Reopen Listing Has Bounded Durable States

The system MUST populate Reopen and resumable history from provider-specific durable session catalogs. Each durable provider lookup MUST resolve to `success`, `empty`, or `error` within 10 seconds and MUST NOT leave the UI in an indefinite loading state.

#### Scenario: Durable sessions load successfully

- GIVEN a verified durable provider returns sessions in time
- WHEN DevHub refreshes Reopen or resumable history
- THEN resumable sessions MUST render for that provider
- AND loading MUST clear without an error state

#### Scenario: Durable lookup times out or fails

- GIVEN a durable provider lookup hangs or errors
- WHEN 10 seconds elapse or the failure is received
- THEN DevHub MUST show an explicit error state with retry
- AND the UI MUST NOT keep spinning indefinitely

### Requirement: OpenCode Is the Required MVP Durable Provider

OpenCode MUST be supported as the MVP durable provider. DevHub MUST reopen a selected OpenCode session by launching exactly one panel with `opencode --session <id>`. If OpenCode still lists a session after relaunch or reboot, DevHub MUST treat that session as resumable even when the original PTY is gone.

#### Scenario: User manually reopens an OpenCode session after reboot

- GIVEN OpenCode still lists a prior session after reboot
- WHEN the user selects Reopen for that session
- THEN DevHub MUST launch exactly one panel with `opencode --session <id>`
- AND the resumed target MUST be that listed OpenCode session

#### Scenario: Listed OpenCode session becomes invalid

- GIVEN a session was listed but resume later fails
- WHEN the user tries to reopen it
- THEN DevHub MUST show a deterministic failure state
- AND it MUST NOT open an unrelated blank substitute session

### Requirement: Startup Auto-Resume Uses Persisted Durable Resume Data

On app open after relaunch or reboot, DevHub MUST auto-resume verified durable sessions from persisted durable commands or provider tokens. Startup resume MUST use those persisted durable resume inputs, not generic shell restoration. For MVP, OpenCode durable resume data is REQUIRED. DevHub MUST auto-launch each eligible durable session at most once during startup.

#### Scenario: Startup auto-resumes persisted OpenCode session

- GIVEN a saved workspace contains persisted OpenCode durable resume data
- WHEN the app opens after relaunch or reboot
- THEN DevHub MUST auto-launch one panel for that session using the persisted durable resume command or token
- AND the behavior MUST represent session resume rather than generic shell restore

#### Scenario: Startup skips duplicate restored sessions

- GIVEN a durable session was already restored into an existing panel during startup hydration
- WHEN startup auto-resume evaluates persisted sessions
- THEN DevHub MUST NOT launch a duplicate panel for the same durable session
- AND already restored panels MUST remain the single restored instance

### Requirement: Only Verified Durable Providers May Auto-Resume

Reopen, resumable history, and startup auto-resume MUST surface durable sessions only for providers with verified CLI list-and-resume support. Hermes durable restore MUST remain unsupported and deferred unless that contract is verified. DevHub MUST NOT label plain `hermes` relaunch as reboot-safe restore. Codex and Cloud-like providers SHOULD remain extension points only.

#### Scenario: Hermes support is not verified

- GIVEN Hermes has no verified CLI list-and-resume contract
- WHEN DevHub renders resumable UX or runs startup auto-resume
- THEN Hermes MUST be absent or clearly marked unsupported for durable resume
- AND Hermes MUST NOT auto-resume on app startup

#### Scenario: A provider is verified later

- GIVEN implementation verifies another provider's CLI list and resume behavior
- WHEN that provider is surfaced as durable
- THEN DevHub MUST use that verified contract for reopen and startup auto-resume
- AND it MAY join the same durable-provider model as OpenCode

## Acceptance Criteria

#### Scenario: Startup auto-resume is durable-command based

- GIVEN the machine rebooted and persisted OpenCode durable resume data exists
- WHEN DevHub opens
- THEN DevHub MUST resume through persisted durable command or token data
- AND it MUST NOT claim generic shell restoration

#### Scenario: Duplicate startup panels are forbidden

- GIVEN a durable session was already restored once during startup
- WHEN startup reconciliation completes
- THEN no second panel exists for that same restored durable session
