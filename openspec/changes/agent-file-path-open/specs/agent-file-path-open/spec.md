# Spec: agent-file-path-open

## Purpose

Define requirements for opening path references from Grok/OpenCode terminal output into DevHub’s Files editor space.

## Requirements

### Requirement: Path detection in agent terminal output

The system SHALL detect file-path-like tokens in xterm buffer lines for sessions identified as Grok or OpenCode.

#### Scenario: Absolute Windows path

- **WHEN** the buffer line contains `D:\repo\src\app.js` (or forward-slash form)
- **THEN** the system provides a link covering that path token

#### Scenario: Relative project path with line

- **WHEN** the buffer line contains `src/lib/foo.ts:42` or `src/lib/foo.ts:42:3`
- **THEN** the system provides a link for the path and captures line (and optional column)

#### Scenario: Non-agent shell session

- **WHEN** the terminal is a normal shell (not Grok/OpenCode)
- **THEN** the agent file-path link provider is not registered (or provides no agent-specific links)

### Requirement: Modifier-click activation

The system SHALL open a detected path only when the user activates the link with Ctrl (Windows/Linux) or Meta (macOS).

#### Scenario: Ctrl/Cmd+click opens file

- **WHEN** the user Ctrl/Cmd+clicks a detected path link in a Grok or OpenCode panel
- **THEN** the system dispatches an open-file request for the resolved path

#### Scenario: Plain click does not open

- **WHEN** the user clicks a detected path without Ctrl/Meta
- **THEN** the system does not open the Files editor for that path
- **AND** TUI mouse injection is not suppressed solely by the presence of an underlink

### Requirement: Path resolution

The system SHALL resolve paths relative to the project root (`project.local_path` / workspace `cwd`) and, when helpful, the panel session CWD.

#### Scenario: Absolute under project

- **WHEN** an absolute path is under the project root
- **THEN** the open target is the POSIX-relative path within the project

#### Scenario: Relative path

- **WHEN** a relative path is detected
- **THEN** the open target is normalized to a POSIX-relative path suitable for `/api/fs/read` with `base=project root`

### Requirement: Files space open

The system SHALL surface the file in the workspace Files space component.

#### Scenario: Files panel already present

- **WHEN** an open-file request is accepted and a `files` panel exists in the active workspace
- **THEN** that panel is activated and the editor loads the file content

#### Scenario: No files panel

- **WHEN** an open-file request is accepted and no `files` panel exists
- **THEN** the system creates a `files` panel (split) and loads the file when the editor mounts

### Requirement: Event contract

Open requests SHALL use a documented browser event so multiple surfaces can produce/consume opens without tight coupling.

#### Scenario: Valid detail

- **WHEN** a producer dispatches `devhub:open-file` with a non-empty `path` string
- **THEN** consumers accept the event and attempt to open the file

#### Scenario: Invalid detail

- **WHEN** `path` is missing or empty
- **THEN** consumers ignore the event
