# Delta for terminal-restore-preferences

## ADDED Requirements

### Requirement: TRP-1 — Project-Scoped Restore Preferences Storage

The system MUST provide a `restorePreferences.js` module that persists terminal restore preferences under the localStorage key `devhub_terminal_restore_preferences:{projectId}`. It MUST store two independent restore policies — one for `opencode` sessions and one for `generic` sessions — each accepting values `auto | manual | off`.

#### Scenario: TRP-S1 — Read preferences for project with existing preferences

- GIVEN project `proj-A` with stored preferences `{ opencode: 'auto', generic: 'auto' }` in localStorage
- WHEN `readTerminalRestorePreferences('proj-A')` is called
- THEN `{ opencode: 'auto', generic: 'auto' }` is returned

#### Scenario: TRP-S2 — Read preferences for project with no stored preferences

- GIVEN project `proj-B` with no stored preferences
- WHEN `readTerminalRestorePreferences('proj-B')` is called
- THEN `{ opencode: 'auto', generic: 'auto' }` is returned as default
- AND the default is NOT persisted until a write occurs

### Requirement: TRP-2 — Write and Sanitize Preferences

The system MUST provide `writeTerminalRestorePreferences(projectId, prefs)` which sanitizes input by coercing values to the `auto | manual | off` enum before persisting. Unknown keys MUST be silently dropped. Invalid values for known keys MUST default to `'auto'`.

#### Scenario: TRP-S3 — Write with valid values persists correctly

- GIVEN project `proj-A`
- WHEN `writeTerminalRestorePreferences('proj-A', { opencode: 'manual', generic: 'off' })` is called
- THEN localStorage stores `{ opencode: 'manual', generic: 'off' }`

#### Scenario: TRP-S4 — Write with invalid enum value falls back to auto

- GIVEN project `proj-A`
- WHEN `writeTerminalRestorePreferences('proj-A', { opencode: 'invalid', generic: 'auto' })` is called
- THEN localStorage stores `{ opencode: 'auto', generic: 'auto' }`
- AND the invalid value is replaced with `'auto'`

#### Scenario: TRP-S5 — Write with unknown key silently ignores it

- GIVEN project `proj-A`
- WHEN `writeTerminalRestorePreferences('proj-A', { opencode: 'manual', generic: 'auto', unknown: 'value' })` is called
- THEN localStorage stores only `{ opencode: 'manual', generic: 'auto' }`
- AND the unknown key is not persisted

### Requirement: TRP-3 — Initial Terminal Settings Surface (PR #1)

PR #1 MUST expose terminal restore preferences in the existing `Ajustes.jsx` Preferencias tab as two independent radio-button groups — one labeled for OpenCode sessions, one for Generic Terminal sessions — each offering `auto | manual | off` options. The UI MUST read the current preferences on mount and write changes immediately on selection.

#### Scenario: TRP-S6 — Ajustes tab renders two independent radio groups

- GIVEN the user has opened Ajustes.jsx and navigated to the Preferencias tab
- WHEN the tab renders
- THEN two radio button groups are visible — one for OpenCode, one for Generic Terminal
- AND each group shows `auto`, `manual`, and `off` options
- AND the currently active setting is pre-selected for each group

#### Scenario: TRP-S7 — Changing preference persists immediately

- GIVEN the Ajustes tab is open with OpenCode currently set to `auto`
- WHEN the user selects `manual` for OpenCode
- THEN the localStorage preference is updated to `manual` immediately
- AND the radio selection reflects `manual`

### Requirement: TRP-4 — New Sessions Inherit Workspace Default

New sessions created during the active session MUST have their `restorePolicy` set to the workspace default from `restorePreferences.js` for the corresponding session type. Existing sessions are unaffected by preference changes.

#### Scenario: TRP-S8 — New OpenCode session inherits workspace default

- GIVEN `restorePreferences` for project `proj-A` has `opencode: 'manual'`
- WHEN a new OpenCode session is saved
- THEN the new session's `restorePolicy` is set to `'manual'`

#### Scenario: TRP-S9 — Changing preferences does not affect existing sessions

- GIVEN project `proj-A` has an existing session with `restorePolicy: 'manual'`
- WHEN the workspace default for OpenCode is changed to `auto`
- THEN the existing session keeps `restorePolicy: 'manual'`
- AND only new sessions created after the change inherit `'auto'`
