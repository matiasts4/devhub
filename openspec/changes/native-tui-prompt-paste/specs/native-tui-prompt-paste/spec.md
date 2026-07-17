# Spec: native-tui-prompt-paste

## ADDED Requirements

### Requirement: Clean interactive agent launch from Zed tools

When Zed opens an agent TUI via `open_terminal` or `launch_agent_session` for programs in `{opencode, codex, hermes, kimi, grok}`, the launch command string returned as `command_sent` MUST NOT embed the user task text (no `--prompt`, no `-p`, no `chat -q <task>` for the bootstrap task path).

#### Scenario: Open Grok with a task uses clean launch command

- **GIVEN** the model calls `open_terminal` or `launch_agent_session` with `program=grok` and a non-empty task prompt
- **WHEN** the tool returns successfully
- **THEN** `command_sent` launches Grok without embedding the task text
- **AND** `bootstrap_input` contains the task text (normalized for later paste)

#### Scenario: Open OpenCode with a task uses interactive launch

- **GIVEN** the model calls `open_terminal` with `program=opencode` and a non-empty task prompt provided as bootstrap intent
- **WHEN** the tool returns successfully
- **THEN** `command_sent` does not include `--prompt <task>`
- **AND** `bootstrap_input` contains the task text

#### Scenario: Open without a task does not invent bootstrap_input

- **GIVEN** the model opens an agent TUI with no task/prompt
- **WHEN** the tool returns successfully
- **THEN** `bootstrap_input` is absent or empty
- **AND** the TUI still launches interactively

---

### Requirement: Forward bootstrap_input through open-terminal UI dispatch

The client dispatcher that handles successful `open_terminal` / `launch_agent_session` results MUST forward `bootstrap_input` into the `devhub:zed-open-terminal` event detail so the panel layer can consume it.

#### Scenario: Dispatch includes bootstrap_input

- **GIVEN** a tool result with `opened/workspace`, a launch `command_sent`, and non-empty `bootstrap_input`
- **WHEN** `dispatchZedOpenTerminalFromToolResults` runs
- **THEN** `dispatchZedOpenTerminal` is called with `bootstrap_input` equal to that string (or an agreed normalized form)
- **AND** `command` remains the clean launch command

#### Scenario: Dispatch without bootstrap_input remains valid

- **GIVEN** a tool result for an empty shell or agent open without bootstrap text
- **WHEN** dispatch runs
- **THEN** open-terminal still fires without requiring `bootstrap_input`

---

### Requirement: Readiness-gated native paste coordinator

After a panel is opened with pending `bootstrap_input`, a client coordinator MUST wait until the agent TUI is ready (using existing readiness signals) or until a timeout elapses before pasting.

#### Scenario: Paste after readiness

- **GIVEN** a panel opened with non-empty `bootstrap_input` and a clean agent `initialCommand`
- **AND** the readiness signal for that program becomes true before timeout
- **WHEN** the coordinator runs
- **THEN** it formats the text with the human paste formatter (`formatTerminalPastePayload` semantics)
- **AND** sends the formatted payload once via the panel input transport (`sendTerminalPasteInput` or equivalent)
- **AND** then sends Enter as a **separate** input write

#### Scenario: Multiline bootstrap uses bracketed paste markers

- **GIVEN** `bootstrap_input` contains multiple lines
- **AND** the session is treated as an agent TUI (same rules as human multiline paste)
- **WHEN** the coordinator builds the paste payload
- **THEN** the payload includes bracketed-paste start and end markers around the text

#### Scenario: Timeout without readiness does not paste

- **GIVEN** a panel opened with non-empty `bootstrap_input`
- **AND** readiness never becomes true within the default timeout (~15s)
- **WHEN** the coordinator times out
- **THEN** it MUST NOT send the bootstrap paste
- **AND** it records an observable failure (debug log and/or structured status)

#### Scenario: At-most-once paste

- **GIVEN** bootstrap paste already completed successfully for a panel reservation
- **WHEN** the coordinator is invoked again (remount, re-ready, duplicate event)
- **THEN** it MUST NOT paste the same bootstrap_input again

#### Scenario: Empty bootstrap_input is a no-op

- **GIVEN** a panel open without `bootstrap_input`
- **WHEN** the coordinator is considered
- **THEN** no paste or Enter is sent by the bootstrap path

---

### Requirement: Enter is separate from paste payload

Auto-submit MUST NOT rely solely on a trailing newline inside the bracketed paste buffer when a distinct Enter keystroke is required by product intent.

#### Scenario: Enter write is distinct

- **GIVEN** a successful readiness-gated paste of bootstrap text
- **WHEN** auto-submit runs
- **THEN** the transport receives a paste write and a subsequent separate Enter write
- **AND** the Enter write is not wrapped in bracketed paste markers

---

## MODIFIED Requirements

None (new capability; no delta to an archived capability spec required for slice 1).

## REMOVED Requirements

None.
