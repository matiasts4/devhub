# Agent Session Reopen Specification

## Purpose

Define resumable agent-session reopen after app relaunch or machine reboot. MVP MUST cover OpenCode-managed sessions, not generic shell resurrection, PTY replay, or TUI framebuffer recovery.

## Non-Goals

- Generic shell or scrollback restore after reboot
- Treating `hermes` relaunch in the same cwd as durable resume
- Promising Hermes durable restore before CLI list/resume support is verified
- Making Codex/Cloud-like providers first-class resumable providers in MVP

## Requirements

### Requirement: OpenCode Session Listing Has Bounded Reopen States

The system MUST populate the topbar Reopen OpenCode section from `/api/opencode/sessions`. OpenCode listing MUST resolve to `success`, `empty`, or `error` within 10 seconds and MUST NOT leave the UI in an indefinite loading state.

#### Scenario: OpenCode sessions load successfully

- GIVEN the user opens Reopen and OpenCode CLI returns sessions in time
- WHEN `/api/opencode/sessions` responds for the current project filter
- THEN the menu MUST render resumable OpenCode sessions
- AND loading MUST clear without showing an error state

#### Scenario: OpenCode listing times out or fails

- GIVEN the OpenCode session list call hangs or errors
- WHEN 10 seconds elapse or the failure is received
- THEN the loading state MUST end in an explicit error state with retry
- AND the Reopen menu MUST NOT keep spinning indefinitely

### Requirement: OpenCode Resume Is the Required MVP Restore Path

The system MUST reopen a selected OpenCode session by launching exactly one panel with `opencode --session <id>`. If the OpenCode CLI still lists a session after relaunch or reboot, DevHub MUST treat that session as resumable even when the original PTY is gone. The UI MUST describe this as session resume, not shell continuity.

#### Scenario: User resumes an OpenCode session after reboot

- GIVEN a previously used OpenCode session still appears in the CLI session list after reboot
- WHEN the user selects Reopen for that session
- THEN DevHub MUST start exactly one new panel with `opencode --session <id>`
- AND the resumed target MUST be that saved OpenCode session

#### Scenario: Listed session becomes invalid before reopen

- GIVEN a session was listed but the resume command later fails or becomes unavailable
- WHEN the user tries to reopen it
- THEN DevHub MUST show a deterministic failure state
- AND it MUST NOT silently open an unrelated blank substitute session

### Requirement: Reopen and History Show Only Verified Resumable Providers

The topbar Reopen UX and Agent Room resumable history MUST surface durable sessions only for providers with verified list-and-resume support. OpenCode is REQUIRED for MVP. Empty, loading, and error states MUST be explicit and testable.

#### Scenario: OpenCode appears in resumable history

- GIVEN OpenCode exposes resumable sessions for the current project
- WHEN DevHub refreshes Reopen or Agent Room history
- THEN OpenCode sessions MUST appear as resumable entries
- AND current OpenCode virtual-history synthesis MAY remain the source for that history in MVP

#### Scenario: No resumable providers are available

- GIVEN no provider returns any verified resumable sessions
- WHEN the user opens Reopen or resumable history
- THEN the UI MUST show an empty state instead of stale entries
- AND the UI MUST NOT imply that generic shell restore is supported

### Requirement: Hermes Durable Restore Is Conditional and Deferred by Default

Hermes durable restore MUST remain deferred unless implementation verifies Hermes CLI support for both listing existing sessions and resuming a specific session. Without that verification, DevHub MUST NOT label Hermes as reboot-safe resume and MUST NOT treat plain `hermes` relaunch as restore. Live Hermes runtime detection MAY continue for non-durable active-session presence only. Codex/Cloud-like CLIs SHOULD remain extension points only.

#### Scenario: Hermes support is not verified

- GIVEN Hermes has no verified CLI list-and-resume contract during implementation
- WHEN DevHub renders Reopen or resumable history
- THEN Hermes MUST be absent or clearly marked unsupported for durable resume
- AND reboot-safe Hermes restore MUST remain out of MVP scope

#### Scenario: Hermes support is verified later

- GIVEN implementation verifies Hermes CLI list and resume behavior
- WHEN Hermes sessions are shown as resumable
- THEN DevHub MUST use that verified contract rather than cwd-only relaunch
- AND Hermes MAY join the same resumable-provider model as OpenCode

## Acceptance Criteria

#### Scenario: Reopen never spins forever

- GIVEN `/api/opencode/sessions` stalls
- WHEN the bounded wait limit is reached
- THEN the user sees an error state within 10 seconds

#### Scenario: OpenCode resume survives reboot semantics

- GIVEN the machine rebooted and OpenCode still lists a prior session
- WHEN the user reopens it from DevHub
- THEN DevHub resumes it with `opencode --session <id>`

#### Scenario: Hermes false resume is forbidden

- GIVEN Hermes CLI resume/list support is unverified
- WHEN the user looks for durable reopen options
- THEN DevHub MUST NOT present plain `hermes` relaunch as valid restore
